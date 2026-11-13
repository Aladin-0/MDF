"""
End-to-end OCR flow against the database, with Gemini mocked (no API calls).
Covers: distributor matching order, medicine matching + suggestions, learned
aliases, alias correction through the real purchase save, distributor alias
learning, and the review payload served to the frontend.
"""
import io
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Ledger, LedgerGroup, Staff
from apps.core.models import Organization, Outlet
from apps.inventory.models import Batch, MasterProduct, MasterProductAlias
from apps.purchases import ocr_engine
from apps.purchases.models import Distributor, PurchaseInvoice
from apps.purchases.services import atomic_purchase_save


def _gemini_payload(seller_name='VASANT MEDICAL', seller_gstin='27AACFB4442P1Z8', items=None):
    return {
        'header': {
            'seller': {'name': seller_name, 'gstin': seller_gstin, 'phone': '0240 2325067'},
            'buyer': {'name': 'MANAVTA PHARMA PVT LTD', 'gstin': '27AAPCM1753L2ZX'},
            'invoice_no': 'B2644490', 'invoice_date': '28/09/2026',
        },
        'items': items if items is not None else [
            {'name': 'DOLO-650', 'batch_no': 'DL001', 'expiry': '11/27', 'qty': 10, 'mrp': 33.6, 'rate': 25, 'gst_pct': 12, 'amount': 250},
            {'name': 'PAN-D CAP', 'batch_no': 'PD9', 'expiry': '10/27', 'qty': 5, 'mrp': 199, 'rate': 150, 'gst_pct': 12, 'amount': 750},
            {'name': 'TELMIBROOK', 'batch_no': 'TB1', 'expiry': '1/28', 'qty': 2, 'mrp': 120, 'rate': 90, 'gst_pct': 12, 'amount': 180},
        ],
        'totals': {'gross': 1180, 'grand_total': 1321.6},
    }


def _fake_call(data):
    return mock.patch('apps.purchases.gemini_ocr.call_gemini',
                      return_value={'data': data, 'model': 'fake-model', 'ms': 5,
                                    'usage': {'input_tokens': 1, 'output_tokens': 1,
                                              'thinking_tokens': 0, 'total_tokens': 2}})


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
@mock.patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key', 'OCR_AUTO_ROTATE': '0', 'OCR_VERIFY_PASS': '0'})
class OCRFlowTest(TestCase):

    def setUp(self):
        ocr_engine._CATALOG_CACHE.update(sig=None, index=None, at=0.0)
        from django.core.cache import cache
        cache.clear()
        self.org = Organization.objects.create(name='Org')
        self.outlet = Outlet.objects.create(name='MANAVTA PHARMA PVT LTD', organization=self.org, gstin='27AAPCM1753L2ZX')
        self.user = Staff.objects.create(name='u', phone='9999999990', outlet=self.outlet, role='super_admin')
        self.basant = Distributor.objects.create(outlet=self.outlet, name='BASANT MEDICAL AGENCIES', gstin='27AACFB4442P1Z8')
        self.vasant = Distributor.objects.create(outlet=self.outlet, name='VASANT MEDICAL AGENCIES')
        mk = lambda n, mrp=100: MasterProduct.objects.create(  # noqa: E731
            name=n, mrp=Decimal(mrp), pack_size=10, pack_unit='tablet', pack_type='strip', gst_rate=Decimal('12'))
        self.dolo650, self.dolo500 = mk('DOLO 650 TAB', 33.6), mk('DOLO 500 TAB', 30)
        self.pan40, self.pand = mk('PAN 40 TAB', 160), mk('PAN D CAP', 199)
        self.telmi40, self.telmih = mk('TELMIBROOK 40 TAB', 120), mk('TELMIBROOK H TAB', 140)
        buf = io.BytesIO()
        Image.new('L', (60, 40), 255).save(buf, format='JPEG')
        import tempfile
        self.tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        self.tmp.write(buf.getvalue())
        self.tmp.close()

    def _run(self, data=None):
        with _fake_call(data or _gemini_payload()):
            return ocr_engine.process_invoice_image(self.tmp.name, str(self.outlet.id))

    def test_gstin_beats_misread_name_and_strength_is_respected(self):
        r = self._run()
        self.assertNotIn('error', r)
        self.assertEqual(r['distributor_match']['distributor_id'], str(self.basant.id))
        self.assertEqual(r['distributor_match']['matched_by'], 'gstin')
        dolo, pand, telmi = (i['_medicine_match'] for i in r['items'])
        self.assertEqual(dolo['product_id'], str(self.dolo650.id))
        self.assertEqual(pand['product_id'], str(self.pand.id))
        # Ambiguous: must not guess, must offer both siblings.
        self.assertFalse(telmi['matched'])
        self.assertEqual({s['product_id'] for s in telmi['suggestions']},
                         {str(self.telmi40.id), str(self.telmih.id)})
        self.assertEqual(r['header']['invoice_date'], '2026-09-28')

    def test_batch_history_resolves_ambiguity(self):
        Batch.objects.create(outlet=self.outlet, product=self.telmih, batch_no='TB1', expiry_date=date(2028, 1, 1),
                             mrp=Decimal('140'), purchase_rate=Decimal('100'), pack_size=10, pack_unit='tablet',
                             pack_type='strip')
        telmi = self._run()['items'][2]['_medicine_match']
        self.assertEqual(telmi['product_id'], str(self.telmih.id))

    def test_learned_alias_wins(self):
        MasterProductAlias.objects.create(outlet=self.outlet, product=self.telmih, alias_name='TELMIBROOK')
        telmi = self._run()['items'][2]['_medicine_match']
        self.assertEqual(telmi['product_id'], str(self.telmih.id))
        self.assertEqual(telmi['matched_by'], 'learned_alias')

    def test_correction_replaces_wrong_alias_on_save(self):
        # A wrong alias learned earlier ...
        MasterProductAlias.objects.create(outlet=self.outlet, product=self.dolo500, alias_name='DOLO 650')
        self._setup_ledgers()
        # ... the user corrects the row to DOLO 650 and saves.
        atomic_purchase_save(self._payload(self.dolo650, ocr_name='DOLO-650'), str(self.outlet.id), str(self.user.id))
        alias = MasterProductAlias.objects.get(outlet=self.outlet, alias_name='DOLO 650')
        self.assertEqual(alias.product_id, self.dolo650.id)
        self.assertEqual(self._run()['items'][0]['_medicine_match']['matched_by'], 'learned_alias')

    def test_confirm_moves_all_pages_to_posted_invoice(self):
        import tempfile
        from apps.purchases.models import PurchaseInvoicePage
        self._setup_ledgers()
        with override_settings(MEDIA_ROOT=tempfile.mkdtemp()):
            draft = PurchaseInvoice.objects.create(
                outlet=self.outlet, status='SAVED', invoice_image=_jpeg(60), created_by=self.user, invoice_no='',
                invoice_date=date.today(), subtotal=0, taxable_amount=0, grand_total=0)
            PurchaseInvoicePage.objects.create(invoice=draft, page_no=2, image=_jpeg(61))
            client = APIClient()
            client.force_authenticate(self.user)
            res = client.post(f'/api/v1/purchases/{draft.id}/confirm/',
                              self._payload(self.dolo650, ocr_name='DOLO-650'), format='json')
            self.assertEqual(res.status_code, 201, res.content[:300])
            posted = PurchaseInvoice.objects.get(id=res.json()['id'])
            self.assertTrue(posted.invoice_image)
            self.assertEqual(list(posted.extra_pages.values_list('page_no', flat=True)), [2])
            self.assertFalse(PurchaseInvoice.objects.filter(id=draft.id).exists())

    def test_distributor_alias_learning(self):
        data = _gemini_payload(seller_name='SHREE SAI DISTRIBUTION CO', seller_gstin=None)
        self.assertIsNone(self._run(data)['distributor_match']['distributor_id'])
        ocr_engine.learn_distributor_alias(self.vasant, ocr_name='SHREE SAI DISTRIBUTION CO', ocr_gstin='27AACFB4442P1Z8')
        self.vasant.refresh_from_db()
        self.assertIn('SHREE SAI DISTRIBUTION CO', self.vasant.ocr_aliases['names'])
        self.assertEqual(self.vasant.ocr_aliases['gstins'], ['27AACFB4442P1Z8'])
        m = self._run(data)['distributor_match']
        self.assertEqual((m['distributor_id'], m['matched_by']), (str(self.vasant.id), 'learned_name'))

    def test_unresolved_problems_reach_staff_and_flag_review(self):
        data = _gemini_payload()
        data['items'][0]['mrp'] = 20          # rate 25 > MRP 20 -> impossible
        r = self._run(data)
        self.assertTrue(r['needs_review'])
        self.assertTrue(any('higher than MRP' in w for w in r['warnings']))
        from django.core.cache import cache
        cache.clear()   # same photo would otherwise come back from the OCR cache
        clean = self._run()
        self.assertFalse(clean['needs_review'])

    def test_quota_error_is_reported_clearly(self):
        class Quota(Exception):
            code = 429
        with mock.patch('apps.purchases.gemini_ocr.call_gemini', side_effect=Quota('RESOURCE_EXHAUSTED')):
            r = ocr_engine.process_invoice_image(self.tmp.name, str(self.outlet.id))
        self.assertEqual(r['error'], 'OCR_QUOTA_EXHAUSTED')

    def test_status_view_serves_bill_name_suggestions_and_ledger_by_gstin(self):
        group = LedgerGroup.objects.create(name='Sundry Creditors', outlet=self.outlet, nature='liability')
        other = Distributor.objects.create(outlet=self.outlet, name='KARWA DISTRIBUTORS')
        ledger = Ledger.objects.create(outlet=self.outlet, name='Karwa Distributors', group=group, gstin='27AAAFK1234A1Z4')
        data = _gemini_payload(seller_name='KARWA DISTRIBUTORS', seller_gstin='27AAAFK1234A1Z4')
        result = self._run(data)
        draft = PurchaseInvoice.objects.create(
            outlet=self.outlet, distributor=None, invoice_no='', invoice_date=date.today(), status='SAVED',
            subtotal=0, taxable_amount=0, grand_total=0, ocr_raw_data=result, ocr_confidence=result['confidence'],
            created_by=self.user)
        client = APIClient()
        client.force_authenticate(self.user)
        res = client.get(f'/api/v1/purchases/{draft.id}/ocr-status/', {'outletId': str(self.outlet.id)})
        self.assertEqual(res.status_code, 200, res.content[:300])
        body = res.json()
        self.assertEqual(body['header']['partyLedgerId'], str(ledger.id))
        items = body['items']
        self.assertEqual(items[0]['ocrOriginalName'], 'DOLO-650')
        self.assertEqual(items[0]['medicineMatch']['productId'], str(self.dolo650.id))
        self.assertEqual(len(items[2]['medicineMatch']['suggestions']), 2)
        self.assertIsNotNone(other)

    # --- helpers ---------------------------------------------------------------
    def _setup_ledgers(self):
        sc = LedgerGroup.objects.create(name='Sundry Creditors', outlet=self.outlet, nature='liability')
        pa = LedgerGroup.objects.create(name='Purchase Accounts', outlet=self.outlet, nature='expense')
        dt = LedgerGroup.objects.create(name='Duties & Taxes', outlet=self.outlet, nature='liability')
        de = LedgerGroup.objects.create(name='Direct Expenses', outlet=self.outlet, nature='expense')
        self.party = Ledger.objects.create(outlet=self.outlet, name='Basant', group=sc, linked_distributor=self.basant)
        for name, g in (('Purchase Account', pa), ('GST Input (CGST)', dt), ('GST Input (SGST)', dt),
                        ('Cess Account', dt), ('Freight Inward', de), ('Discount Received', pa)):
            Ledger.objects.create(outlet=self.outlet, name=name, group=g)

    def _payload(self, product, ocr_name):
        return {
            'outletId': str(self.outlet.id), 'partyLedgerId': str(self.party.id), 'invoiceNo': 'OCR-1',
            'invoiceDate': date.today().isoformat() + 'T00:00:00Z', 'purchaseType': 'credit',
            'subtotal': 250.0, 'discountAmount': 0, 'taxableAmount': 250.0, 'gstAmount': 30.0, 'cessAmount': 0,
            'freight': 0, 'grandTotal': 280.0,
            'items': [{'masterProductId': str(product.id), 'ocrOriginalName': ocr_name, 'batchNo': 'DL001',
                       'expiryDate': '2027-11-01T00:00:00Z', 'qty': 10, 'actualQty': 100, 'purchaseRate': 25.0,
                       'mrp': 33.6, 'saleRate': 33.6, 'discountPct': 0, 'taxableAmount': 250.0, 'gstRate': 12.0,
                       'gstAmount': 30.0, 'cess': 0, 'cessAmount': 0, 'totalAmount': 280.0, 'ptr': 0, 'pts': 0}],
        }


def _jpeg(w=60, shade=255):
    from django.core.files.uploadedfile import SimpleUploadedFile
    buf = io.BytesIO()
    Image.new('L', (w, 40), shade).save(buf, format='JPEG')
    return SimpleUploadedFile(f'p{w}-{shade}.jpg', buf.getvalue(), content_type='image/jpeg')


class MultiPageScanTest(TestCase):
    def setUp(self):
        import tempfile
        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.org = Organization.objects.create(name='Org')
        self.outlet = Outlet.objects.create(name='Outlet', organization=self.org)
        self.user = Staff.objects.create(name='u', phone='9999999991', outlet=self.outlet, role='super_admin')
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.user)

    def tearDown(self):
        self.override.disable()

    def test_pages_become_one_draft_and_duplicates_are_skipped(self):
        with mock.patch('apps.purchases.tasks.process_invoice_ocr.delay') as delay:
            res = self.client_api.post('/api/v1/purchases/scan/upload/',
                                       {'outletId': str(self.outlet.id),
                                        'image': [_jpeg(60), _jpeg(61), _jpeg(60)]},   # 3rd = same photo as 1st
                                       format='multipart')
        self.assertEqual(res.status_code, 202, res.content[:300])
        body = res.json()
        self.assertEqual((body['pages'], body['duplicatePagesSkipped']), (2, 1))
        draft = PurchaseInvoice.objects.get(id=body['draftId'])
        self.assertEqual(draft.extra_pages.count(), 1)
        self.assertEqual(len(draft.scan_image_paths()), 2)
        delay.assert_called_once_with(str(draft.id))

    def test_too_many_pages_rejected(self):
        res = self.client_api.post('/api/v1/purchases/scan/upload/',
                                   {'outletId': str(self.outlet.id), 'image': [_jpeg(60 + n) for n in range(7)]},
                                   format='multipart')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error']['code'], 'TOO_MANY_PAGES')

    def test_task_reads_all_pages_and_status_lists_them(self):
        from apps.purchases.models import PurchaseInvoicePage
        from apps.purchases.tasks import process_invoice_ocr
        draft = PurchaseInvoice.objects.create(
            outlet=self.outlet, status='SAVED', invoice_image=_jpeg(60), created_by=self.user, invoice_no='',
            invoice_date=date.today(), subtotal=0, taxable_amount=0, grand_total=0)
        PurchaseInvoicePage.objects.create(invoice=draft, page_no=2, image=_jpeg(61))
        with mock.patch('apps.purchases.tasks.process_invoice_image',
                        return_value={'header': {}, 'items': [], 'totals': {}, 'distributor_match': {},
                                      'confidence': 0.5, 'warnings': [], 'needs_review': True}) as proc:
            process_invoice_ocr(str(draft.id))
        paths = proc.call_args[0][0]
        self.assertIsInstance(paths, list)
        self.assertEqual(len(paths), 2)
        res = self.client_api.get(f'/api/v1/purchases/{draft.id}/ocr-status/', {'outletId': str(self.outlet.id)})
        self.assertEqual(len(res.json()['invoiceImageUrls']), 2)
        self.assertTrue(res.json()['needsReview'])


# --- regression tests for review findings ----------------------------------------

@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
@mock.patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key', 'OCR_AUTO_ROTATE': '0', 'OCR_VERIFY_PASS': '0'})
class ReviewFindingsTest(OCRFlowTest):
    """Inherits OCRFlowTest's setup; only the tests below are new."""

    def test_never_learns_the_pharmacys_own_gstin_or_name(self):
        ocr_engine.learn_distributor_alias(self.vasant, ocr_name='MANAVTA PHARMA PVT LTD',
                                           ocr_gstin='27AAPCM1753L2ZX', buyer_name='MANAVTA PHARMA PVT LTD SAI MEDICAL',
                                           buyer_gstin='27AAPCM1753L2ZX')
        self.vasant.refresh_from_db()
        self.assertEqual(self.vasant.ocr_aliases or {}, {})

    def test_correction_to_same_named_product_replaces_wrong_alias(self):
        dolo_dash = MasterProduct.objects.create(name='DOLO-650', mrp=Decimal('33.6'), pack_size=15,
                                                 pack_unit='tablet', pack_type='strip')
        MasterProductAlias.objects.create(outlet=self.outlet, product=self.dolo500, alias_name='DOLO 650')
        self._setup_ledgers()
        atomic_purchase_save(self._payload(dolo_dash, ocr_name='DOLO 650'), str(self.outlet.id), str(self.user.id))
        self.assertEqual(MasterProductAlias.objects.get(outlet=self.outlet, alias_name='DOLO 650').product_id,
                         dolo_dash.id)

    def test_retry_does_not_start_a_second_run_while_one_is_in_flight(self):
        from apps.purchases.tasks import mark_ocr_queued
        draft = PurchaseInvoice.objects.create(
            outlet=self.outlet, status='SAVED', invoice_image='purchase_invoices/x.jpg', created_by=self.user,
            invoice_no='', invoice_date=date.today(), subtotal=0, taxable_amount=0, grand_total=0)
        PurchaseInvoice.objects.filter(pk=draft.pk).update(created_at=timezone.now() - timedelta(hours=1))
        client = APIClient()
        client.force_authenticate(self.user)
        mark_ocr_queued(draft.id)
        with mock.patch('apps.purchases.tasks.process_invoice_ocr.delay') as delay:
            res = client.post(f'/api/v1/purchases/{draft.id}/ocr-retry/', {'outletId': str(self.outlet.id)})
            self.assertEqual(res.json()['status'], 'processing')
            delay.assert_not_called()
            from django.core.cache import cache
            cache.clear()                     # marker gone = job lost -> requeue allowed
            client.post(f'/api/v1/purchases/{draft.id}/ocr-retry/', {'outletId': str(self.outlet.id)})
            delay.assert_called_once()

    def test_draft_deleted_during_scan_does_not_come_back(self):
        from apps.purchases.tasks import process_invoice_ocr
        draft = PurchaseInvoice.objects.create(
            outlet=self.outlet, status='SAVED', invoice_image='purchase_invoices/x.jpg', created_by=self.user,
            invoice_no='', invoice_date=date.today(), subtotal=0, taxable_amount=0, grand_total=0)

        def scan_while_user_deletes(*a, **k):
            PurchaseInvoice.objects.filter(pk=draft.pk).delete()
            return {'header': {}, 'items': [], 'totals': {}, 'distributor_match': {}, 'confidence': 1, 'warnings': []}
        with mock.patch('apps.purchases.tasks.process_invoice_image', side_effect=scan_while_user_deletes):
            process_invoice_ocr(str(draft.id))
        self.assertFalse(PurchaseInvoice.objects.filter(pk=draft.pk).exists())

    def test_unreadable_photo_gets_a_clear_error(self):
        import tempfile
        bad = tempfile.NamedTemporaryFile(suffix='.heic', delete=False)
        bad.write(b'ftypheic not really an image')
        bad.close()
        r = ocr_engine.process_invoice_image(bad.name, str(self.outlet.id))
        self.assertEqual(r['error'], 'OCR_IMAGE_UNREADABLE')

    def test_ledger_by_gstin_only_picks_a_single_supplier_ledger(self):
        from apps.purchases.ocr_matching import gstin_checksum_ok, _GST_CHARS
        gstin = next('27AAAFK1234A1Z' + c for c in _GST_CHARS if gstin_checksum_ok('27AAAFK1234A1Z' + c))
        debtors = LedgerGroup.objects.create(name='Sundry Debtors', outlet=self.outlet, nature='asset')
        Ledger.objects.create(outlet=self.outlet, name='Karwa (customer)', group=debtors, gstin=gstin)
        data = _gemini_payload(seller_name='KARWA DISTRIBUTORS', seller_gstin=gstin)
        result = self._run(data)
        draft = PurchaseInvoice.objects.create(
            outlet=self.outlet, status='SAVED', invoice_no='', invoice_date=date.today(), subtotal=0,
            taxable_amount=0, grand_total=0, ocr_raw_data=result, created_by=self.user)
        client = APIClient()
        client.force_authenticate(self.user)
        res = client.get(f'/api/v1/purchases/{draft.id}/ocr-status/', {'outletId': str(self.outlet.id)})
        self.assertIsNone(res.json()['header']['partyLedgerId'])      # customer ledger never prefilled

    def test_opening_the_purchase_list_triggers_cleanup(self):
        client = APIClient()
        client.force_authenticate(self.user)
        with mock.patch('apps.purchases.scan_cleanup.maybe_cleanup_scan_photos') as trigger:
            client.get('/api/v1/purchases/', {'outletId': str(self.outlet.id)})
        trigger.assert_called_once()

    def test_upload_is_all_or_nothing(self):
        import tempfile
        with override_settings(MEDIA_ROOT=tempfile.mkdtemp()):
            client = APIClient()
            client.force_authenticate(self.user)
            with mock.patch('apps.purchases.models.PurchaseInvoicePage.objects.create', side_effect=OSError('disk')), \
                    mock.patch('apps.purchases.tasks.process_invoice_ocr.delay'):
                try:
                    client.post('/api/v1/purchases/scan/upload/',
                                {'outletId': str(self.outlet.id), 'image': [_jpeg(60), _jpeg(61)]}, format='multipart')
                except OSError:
                    pass
            self.assertFalse(PurchaseInvoice.objects.filter(outlet=self.outlet, status='SAVED').exists())


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
@mock.patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key', 'OCR_AUTO_ROTATE': '0', 'OCR_VERIFY_PASS': '0',
                                'OCR_ROW_STRIPS': '0'})
class TrainingDataTest(OCRFlowTest):
    """Confirmed scans are kept as training data (AI reading vs what staff saved)."""

    def _confirm_with_corrections(self, keep_images='0'):
        import tempfile
        from apps.purchases.models import ScanTrainingSample
        self._setup_ledgers()
        result = self._run()                                   # AI reads DOLO-650 (qty 10), PAN-D, TELMIBROOK
        result['items'][0]['_medicine_match'] = {'matched': True, 'product_id': str(self.dolo500.id),
                                                 'product_name': 'DOLO 500 TAB', 'confidence': 0.9}
        with override_settings(MEDIA_ROOT=tempfile.mkdtemp()), \
                mock.patch.dict('os.environ', {'OCR_KEEP_TRAINING_IMAGES': keep_images}):
            draft = PurchaseInvoice.objects.create(
                outlet=self.outlet, status='SAVED', invoice_image=_jpeg(60), created_by=self.user, invoice_no='',
                invoice_date=date.today(), subtotal=0, taxable_amount=0, grand_total=0, ocr_raw_data=result)
            payload = self._payload(self.dolo650, ocr_name='DOLO-650')   # staff: right product ...
            payload['items'][0]['qty'] = 12                              # ... and qty 12
            payload['invoiceNo'] = 'B2644490'
            client = APIClient()
            client.force_authenticate(self.user)
            res = client.post(f'/api/v1/purchases/{draft.id}/confirm/', payload, format='json')
            self.assertEqual(res.status_code, 201, res.content[:300])
            sample = ScanTrainingSample.objects.get()
            files_exist = [default_storage_exists(n) for n in sample.image_files]
        return sample, files_exist

    def test_confirmed_scan_is_saved_with_the_corrections(self):
        sample, _ = self._confirm_with_corrections()
        self.assertEqual(sample.rows, 1)
        self.assertEqual(sample.confirmed['items'][0]['product_id'], str(self.dolo650.id))
        self.assertEqual(sample.confirmed['items'][0]['bill_name'], 'DOLO-650')
        self.assertEqual(sample.ocr_result['items'][0]['qty'], 10.0)
        fields = {(c['field'], c.get('ai'), c.get('final')) for c in sample.corrections}
        self.assertIn(('product', 'DOLO 500 TAB', 'DOLO 650 TAB'), fields)
        self.assertIn(('qty', 10.0, 12.0), fields)
        self.assertTrue(any(c['field'] == 'row_removed' for c in sample.corrections))  # staff dropped 2 AI rows
        self.assertEqual(sample.image_files, [])                                      # photos switched off here

    def test_training_photo_is_a_small_compressed_copy(self):
        import io
        from PIL import Image
        from apps.purchases.training_data import compress_for_training, keep_training_images
        self.assertTrue(keep_training_images())                     # on by default
        buf = io.BytesIO()
        Image.new('RGB', (4000, 3000), (240, 240, 240)).save(buf, format='JPEG', quality=95)
        small = compress_for_training(buf.getvalue())
        im = Image.open(io.BytesIO(small))
        self.assertEqual(max(im.size), 1600)
        self.assertEqual(im.mode, 'L')
        self.assertLess(len(small), len(buf.getvalue()))

    def test_training_photos_kept_only_when_enabled(self):
        sample, exists = self._confirm_with_corrections(keep_images='1')
        self.assertEqual(len(sample.image_files), 1)
        self.assertTrue(sample.image_files[0].startswith('ocr_training/'))
        self.assertTrue(all(exists))

    def test_export_writes_samples_and_learned_names(self):
        import json, os, tempfile, io
        from django.core.management import call_command
        self._confirm_with_corrections()
        out = tempfile.mkdtemp()
        buf = io.StringIO()
        call_command('export_scan_training', out=out, stdout=buf)
        self.assertIn('Exported 1 confirmed bill', buf.getvalue())
        lines = open(os.path.join(out, 'samples.jsonl'), encoding='utf-8').read().splitlines()
        row = json.loads(lines[0])
        self.assertEqual(row['truth']['items'][0]['qty'], 12.0)
        self.assertTrue(any(c['field'] == 'product' for c in row['corrections']))
        aliases = open(os.path.join(out, 'product_aliases.csv'), encoding='utf-8').read()
        self.assertIn('DOLO 650', aliases)                     # learned: printed name -> product
        self.assertTrue(os.path.exists(os.path.join(out, 'README.txt')))

    def test_recording_never_blocks_saving(self):
        from apps.purchases.training_data import record_training_sample
        class Broken:
            id = 'x'
            @property
            def ocr_raw_data(self):
                raise RuntimeError('boom')
        self.assertIsNone(record_training_sample(Broken(), None, {}))


def default_storage_exists(name):
    from django.core.files.storage import default_storage
    return default_storage.exists(name)
