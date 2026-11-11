"""Scan photos are deleted 24 h after scanning; purchases, drafts and scanned data stay."""
import io
import tempfile
from datetime import date, timedelta
from unittest import mock

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Staff
from apps.core.models import Organization, Outlet
from apps.purchases.models import PurchaseInvoice, PurchaseInvoicePage
from apps.purchases.scan_cleanup import cleanup_scan_photos, maybe_cleanup_scan_photos


def _jpeg(name):
    buf = io.BytesIO()
    Image.new('L', (40, 30), 255).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class _ScanTestBase(TestCase):
    def setUp(self):
        self.override = override_settings(MEDIA_ROOT=tempfile.mkdtemp())
        self.override.enable()
        org = Organization.objects.create(name='Org')
        self.outlet = Outlet.objects.create(name='Outlet', organization=org)
        self.user = Staff.objects.create(name='u', phone='9999999992', outlet=self.outlet, role='super_admin')
        self.now = timezone.now()
        from django.core.cache import cache
        cache.clear()

    def tearDown(self):
        self.override.disable()

    def _scan(self, hours_ago, status='SAVED', recorded=True, pages=0):
        inv = PurchaseInvoice.objects.create(
            outlet=self.outlet, status=status, invoice_image=_jpeg(f'scan{hours_ago}.jpg'), created_by=self.user,
            invoice_no=f'S{hours_ago}{status}{recorded}', invoice_date=date.today(), subtotal=0, taxable_amount=0,
            grand_total=0, ocr_raw_data={'items': [{'name': 'DOLO 650'}]},
            scan_uploaded_at=(self.now - timedelta(hours=hours_ago)) if recorded else None)
        PurchaseInvoice.objects.filter(pk=inv.pk).update(created_at=self.now - timedelta(hours=hours_ago))
        for n in range(pages):
            page = PurchaseInvoicePage.objects.create(invoice=inv, page_no=n + 2, image=_jpeg(f'p{hours_ago}-{n}.jpg'))
            PurchaseInvoicePage.objects.filter(pk=page.pk).update(created_at=self.now - timedelta(hours=hours_ago))
        inv.refresh_from_db()
        return inv

    def _run(self, **kw):
        with self.captureOnCommitCallbacks(execute=True):
            return cleanup_scan_photos(now=self.now, **kw)



@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ScanPhotoCleanupTest(_ScanTestBase):
    def test_photos_older_than_24h_are_deleted_data_kept(self):
        old = self._scan(25, pages=1)
        old_file = old.invoice_image.name
        page_file = old.extra_pages.first().image.name
        recent = self._scan(1, pages=1)

        stats = self._run()
        self.assertEqual((stats['invoices'], stats['pages']), (1, 1))

        old.refresh_from_db()
        self.assertFalse(old.invoice_image)
        self.assertFalse(default_storage.exists(old_file))
        self.assertFalse(default_storage.exists(page_file))
        self.assertEqual(old.extra_pages.count(), 0)
        self.assertEqual(old.ocr_raw_data['items'][0]['name'], 'DOLO 650')   # scanned data kept
        self.assertEqual(old.status, 'SAVED')                                 # draft kept

        recent.refresh_from_db()
        self.assertTrue(recent.invoice_image)
        self.assertTrue(default_storage.exists(recent.invoice_image.name))
        self.assertEqual(recent.extra_pages.count(), 1)

    def test_saved_purchase_keeps_everything_but_the_photo(self):
        posted = self._scan(30, status='POSTED')
        self._run()
        posted.refresh_from_db()
        self.assertFalse(posted.invoice_image)
        self.assertEqual(posted.status, 'POSTED')

    def test_photos_from_before_this_feature_need_explicit_opt_in(self):
        legacy = self._scan(72, status='POSTED', recorded=False)
        self.assertEqual(self._run()['invoices'], 0)
        legacy.refresh_from_db()
        self.assertTrue(legacy.invoice_image)
        self.assertEqual(self._run(include_old=True)['invoices'], 1)

    def test_dry_run_deletes_nothing(self):
        old = self._scan(25)
        self.assertEqual(self._run(dry_run=True)['invoices'], 1)
        old.refresh_from_db()
        self.assertTrue(default_storage.exists(old.invoice_image.name))

    def test_ttl_is_configurable(self):
        self._scan(10)
        with mock.patch.dict('os.environ', {'OCR_SCAN_PHOTO_TTL_HOURS': '6'}):
            self.assertEqual(self._run()['invoices'], 1)

    def test_automatic_run_is_throttled(self):
        with mock.patch('apps.purchases.scan_cleanup.cleanup_scan_photos') as run:
            maybe_cleanup_scan_photos()
            maybe_cleanup_scan_photos()
        self.assertEqual(run.call_count, 1)

    def test_management_command(self):
        self._scan(25)
        out = io.StringIO()
        with self.captureOnCommitCallbacks(execute=True):
            call_command('cleanup_scan_photos', stdout=out)
        self.assertIn('1 scan photo(s)', out.getvalue())

    def test_deleting_a_draft_removes_its_files(self):
        draft = self._scan(1, pages=1)
        files = [draft.invoice_image.name, draft.extra_pages.first().image.name]
        client = APIClient()
        client.force_authenticate(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            res = client.delete(f'/api/v1/purchases/{draft.id}/?outletId={self.outlet.id}')
        self.assertEqual(res.status_code, 204, res.content[:200])
        for name in files:
            self.assertFalse(default_storage.exists(name))

    def test_review_screen_is_told_the_photo_is_gone(self):
        draft = self._scan(25)
        self._run()
        client = APIClient()
        client.force_authenticate(self.user)
        res = client.get(f'/api/v1/purchases/{draft.id}/ocr-status/', {'outletId': str(self.outlet.id)})
        self.assertEqual(res.status_code, 200, res.content[:200])
        self.assertTrue(res.json()['scanPhotoRemoved'])
        self.assertEqual(res.json()['invoiceImageUrls'], [])


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class StaleDraftCleanupTest(_ScanTestBase):
    """Scan drafts not saved within 3 days are removed with their photos."""

    def test_unsaved_draft_older_than_3_days_is_deleted_with_photos(self):
        stale = self._scan(4 * 24, pages=1)
        files = [stale.invoice_image.name, stale.extra_pages.first().image.name]
        fresh = self._scan(2 * 24)
        stats = self._run()
        self.assertEqual(stats['drafts'], 1)
        self.assertFalse(PurchaseInvoice.objects.filter(pk=stale.pk).exists())
        for name in files:
            self.assertFalse(default_storage.exists(name))
        self.assertTrue(PurchaseInvoice.objects.filter(pk=fresh.pk, status='SAVED').exists())

    def test_saved_purchases_and_purchase_orders_are_never_deleted(self):
        from apps.purchases.models import Distributor, PurchaseOrder
        posted = self._scan(10 * 24, status='POSTED')
        dist = Distributor.objects.create(outlet=self.outlet, name='D')
        po = PurchaseOrder.objects.create(outlet=self.outlet, distributor=dist, status='SAVED',
                                          po_number='PO-OLD')
        self._run()
        self.assertTrue(PurchaseInvoice.objects.filter(pk=posted.pk).exists())
        self.assertTrue(PurchaseOrder.objects.filter(pk=po.pk).exists())

    def test_draft_ttl_is_configurable(self):
        d = self._scan(30)
        with mock.patch.dict('os.environ', {'OCR_DRAFT_TTL_DAYS': '1'}):
            self.assertEqual(self._run()['drafts'], 1)
        self.assertFalse(PurchaseInvoice.objects.filter(pk=d.pk).exists())

    def test_list_tells_staff_when_a_draft_will_be_removed(self):
        draft = self._scan(24)
        client = APIClient()
        client.force_authenticate(self.user)
        res = client.get('/api/v1/purchases/', {'outletId': str(self.outlet.id), 'status': 'draft'})
        self.assertEqual(res.status_code, 200, res.content[:300])
        body = res.json()
        rows = body.get('data') or body.get('results') or body
        row = next(r for r in rows if r['id'] == str(draft.id))
        expected = (draft.created_at + timedelta(days=3)).isoformat()
        self.assertEqual(row['autoDeleteAt'][:16], expected[:16])
