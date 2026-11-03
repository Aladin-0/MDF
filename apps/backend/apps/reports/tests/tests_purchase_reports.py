from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from django.urls import resolve
from openpyxl import load_workbook
from rest_framework.test import APIRequestFactory

from apps.reports.erp_views import PurchaseBookExportView
from apps.reports.services.erp_excel_service import ErpExcelService
from apps.reports.services.erp_report_service import ErpReportService

INVOICE_QS = 'apps.reports.services.erp_report_service.PurchaseInvoice.objects.filter'
NOTE_QS = 'apps.reports.services.erp_report_service.DebitNote.objects.filter'


def _invoice(day, number, grand, taxable, gst, round_off=0, *, distributor='Anil Medical Stores',
             purchase_type='credit', freight=0, cess=0, invoice_date=True, gstin='27ABCDE1234F1Z5',
             ledger_adjustment=0):
    d = date(2026, 10, day)
    return SimpleNamespace(
        invoice_date=d if invoice_date else None,
        created_at=datetime(2026, 10, day, 10, 30),
        invoice_no=number,
        purchase_type=purchase_type,
        grand_total=Decimal(grand),
        taxable_amount=Decimal(taxable),
        gst_amount=Decimal(gst),
        cess_amount=Decimal(cess),
        freight=Decimal(freight),
        ledger_adjustment=Decimal(ledger_adjustment),
        round_off=Decimal(round_off),
        distributor=SimpleNamespace(name=distributor, gstin=gstin) if distributor else None,
    )


def _note(day, number, total, subtotal, gst, distributor='Anil Medical Stores'):
    return SimpleNamespace(
        date=date(2026, 10, day),
        debit_note_no=number,
        total_amount=Decimal(total),
        subtotal=Decimal(subtotal),
        gst_amount=Decimal(gst),
        distributor=SimpleNamespace(name=distributor, gstin='') if distributor else None,
    )


def _qs(rows):
    qs = MagicMock()
    qs.select_related.return_value = rows
    return qs


class PurchaseBookServiceTests(SimpleTestCase):
    def setUp(self):
        # Mirrors the real Marg sample: bill amt = taxable + tax + round off.
        self.invoices = [
            _invoice(31, 'AMS26/49857', '1554', '1480.37', '74.02', '-0.39'),
            _invoice(31, 'AAH013970', '1067', '1016.55', '50.84', '-0.39', distributor='HRIM MEDICARE'),
            _invoice(31, 'CU38788', '622', '592.06', '29.6', '0.34', distributor='PUSHKAR AGENCY',
                     purchase_type='cash'),
            _invoice(31, '65223', '68', '68', '0', '0', distributor=None, purchase_type='cash'),
        ]
        self.notes = [_note(31, 'DN00001', '150', '150', '0')]

    def _book(self, **kwargs):
        with patch(INVOICE_QS, return_value=_qs(self.invoices)) as inv_filter, \
                patch(NOTE_QS, return_value=_qs(self.notes)) as note_filter:
            report = ErpReportService.get_purchase_book('outlet', '2026-10-31', '2026-10-31', **kwargs)
        return report, inv_filter, note_filter

    def test_detailed_rows_match_marg_columns_and_tie_out(self):
        report, _, note_filter = self._book()

        # Rows are sorted by date then bill no (numeric-looking '65223' sorts first as text).
        self.assertEqual([r['bill_no'] for r in report['rows']],
                         ['65223', 'AAH013970', 'AMS26/49857', 'CU38788'])
        for row in report['rows']:
            self.assertAlmostEqual(row['taxable'] + row['tax'] + row['round_off'], row['bill_amt'], places=2)
            self.assertEqual((row['tax_free'], row['exempted']), (0.0, 0.0))
            self.assertFalse(row['is_return'])

        by_no = {r['bill_no']: r for r in report['rows']}
        self.assertEqual(by_no['AAH013970']['party_name'], 'HRIM MEDICARE')
        self.assertEqual(by_no['CU38788']['party_name'], 'CASH (PUSHKAR AGENCY)')
        self.assertEqual(by_no['65223']['party_name'], 'CASH (URD PURCHASE)')
        self.assertEqual(by_no['AAH013970']['round_off'], -0.39)

        self.assertEqual(report['summary'], {
            'total_bill_amt': 3311.0, 'total_taxable': 3156.98, 'total_tax': 154.46,
            'total_tax_free': 0.0, 'total_exempted': 0.0, 'total_round_off': -0.44,
            'bill_count': 4, 'return_count': 0, 'return_amount': 0.0,
        })
        # Plain Purchase Book does not touch debit notes.
        note_filter.assert_not_called()

    def test_less_returns_nets_debit_notes_as_negative_rows(self):
        report, _, note_filter = self._book(less_returns=True)

        note_filter.assert_called_once_with(
            outlet_id='outlet', date__range=(date(2026, 10, 31), date(2026, 10, 31)),
        )
        returns = [r for r in report['rows'] if r['is_return']]
        self.assertEqual(len(returns), 1)
        self.assertEqual(returns[0]['bill_amt'], -150.0)
        self.assertEqual(returns[0]['taxable'], -150.0)
        self.assertEqual(report['summary']['total_bill_amt'], 3161.0)
        self.assertEqual(report['summary']['bill_count'], 4)
        self.assertEqual(report['summary']['return_count'], 1)
        self.assertEqual(report['summary']['return_amount'], 150.0)
        self.assertTrue(report['less_returns'])

    def test_summarised_groups_by_day(self):
        self.invoices.append(_invoice(30, 'X-1', '100', '95.24', '4.76'))
        report, _, _ = self._book(is_summarised=True, less_returns=True)

        self.assertEqual(report['format'], 'summarised')
        self.assertEqual([r['date'] for r in report['rows']], ['2026-10-30', '2026-10-31'])
        day31 = report['rows'][1]
        # Bills and returns are counted separately so day rows add up to the footer.
        self.assertEqual((day31['bill_count'], day31['return_count']), (4, 1))
        self.assertEqual(day31['bill_amt'], 3161.0)
        self.assertEqual(sum(r['bill_count'] for r in report['rows']), report['summary']['bill_count'])
        self.assertEqual(report['rows'][0]['bill_amt'], 100.0)

    def test_freight_is_kept_in_taxable_and_missing_invoice_date_falls_back_to_created_at(self):
        self.invoices = [
            _invoice(5, 'F-1', '1105', '1000', '100', '0', freight='5', invoice_date=False),
        ]
        report, _, _ = self._book()
        row = report['rows'][0]
        self.assertEqual(row['date'], '2026-10-05')
        self.assertEqual(row['taxable'], 1005.0)
        self.assertEqual(row['taxable'] + row['tax'] + row['round_off'], row['bill_amt'])

    def test_queries_only_posted_invoices_for_the_outlet_and_swaps_reversed_dates(self):
        with patch(INVOICE_QS, return_value=_qs([])) as inv_filter, patch(NOTE_QS, return_value=_qs([])):
            report = ErpReportService.get_purchase_book('outlet', '2026-10-31', '2026-10-01')

        _, kwargs = inv_filter.call_args
        self.assertEqual(kwargs, {'outlet_id': 'outlet', 'status': 'POSTED'})
        self.assertEqual(report['date_range'], {'start_date': '2026-10-01', 'end_date': '2026-10-31'})
        self.assertEqual(report['rows'], [])
        self.assertEqual(report['summary']['total_bill_amt'], 0.0)


class PurchaseReturnBookServiceTests(SimpleTestCase):
    def test_return_book_rows_are_positive_and_counted_as_returns(self):
        notes = [
            _note(9, 'DN00002', '112', '100', '12', distributor='Sarda Enterprises'),
            _note(9, 'DN00001', '150', '150', '0', distributor=None),
        ]
        with patch(NOTE_QS, return_value=_qs(notes)):
            detailed = ErpReportService.get_purchase_return_book('outlet', '2026-10-01', '2026-10-31')
            daily = ErpReportService.get_purchase_return_book(
                'outlet', '2026-10-01', '2026-10-31', is_summarised=True,
            )

        self.assertEqual([r['bill_no'] for r in detailed['rows']], ['DN00001', 'DN00002'])
        self.assertEqual(detailed['rows'][0]['party_name'], 'URD PURCHASE')
        self.assertEqual(detailed['rows'][1]['tax'], 12.0)
        self.assertTrue(all(r['is_return'] for r in detailed['rows']))
        self.assertEqual(detailed['summary']['total_bill_amt'], 262.0)
        self.assertEqual(detailed['summary']['return_count'], 2)
        self.assertEqual(detailed['summary']['bill_count'], 0)

        self.assertEqual(daily['rows'], [{
            'date': '2026-10-09', 'bill_count': 0, 'return_count': 2, 'bill_amt': 262.0,
            'taxable': 250.0, 'tax': 12.0, 'tax_free': 0.0, 'exempted': 0.0, 'round_off': 0.0,
        }])


class PurchaseExcelTests(SimpleTestCase):
    def _data(self, fmt):
        rows = {
            'detailed': [
                {'date': '2026-10-31', 'bill_no': 'AAH013970', 'party_name': 'HRIM MEDICARE',
                 'bill_amt': 1067.0, 'taxable': 1016.55, 'tax': 50.84, 'tax_free': 0.0,
                 'exempted': 0.0, 'round_off': -0.39, 'is_return': False},
                {'date': '2026-10-31', 'bill_no': 'DN00001', 'party_name': 'URD PURCHASE',
                 'bill_amt': -150.0, 'taxable': -150.0, 'tax': 0.0, 'tax_free': 0.0,
                 'exempted': 0.0, 'round_off': 0.0, 'is_return': True},
            ],
            'summarised': [
                {'date': '2026-10-31', 'bill_count': 1, 'return_count': 1, 'bill_amt': 917.0,
                 'taxable': 866.55, 'tax': 50.84, 'tax_free': 0.0, 'exempted': 0.0, 'round_off': -0.39},
            ],
        }[fmt]
        return {
            'format': fmt,
            'date_range': {'start_date': '2026-10-31', 'end_date': '2026-10-31'},
            'rows': rows,
            'summary': {
                'total_bill_amt': 917.0, 'total_taxable': 866.55, 'total_tax': 50.84,
                'total_tax_free': 0.0, 'total_exempted': 0.0, 'total_round_off': -0.39,
                'bill_count': 1, 'return_count': 1, 'return_amount': 150.0,
            },
        }

    def _sheet(self, wb):
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        return load_workbook(buf).active

    def test_detailed_purchase_book_uses_marg_headers_and_totals(self):
        ws = self._sheet(ErpExcelService.generate_purchase_book_excel(self._data('detailed'), None))
        headers = [c.value for c in ws[5]]
        self.assertEqual(headers, ['DATE', 'BILL NO.', 'PARTY NAME', 'BILL AMT.', 'TAXABLE',
                                   'TAX', 'TAX FREE', 'EXEMPTED', 'R.OFF'])
        self.assertIn('PURCHASE BOOK (Detailed)', ws['A3'].value)
        self.assertNotIn('CONSOLIDATED', ws['A3'].value)
        self.assertEqual([c.value for c in ws[6]][:6], ['2026-10-31', 'AAH013970', 'HRIM MEDICARE',
                                                        1067.0, 1016.55, 50.84])
        self.assertEqual(ws['D7'].value, -150.0)
        totals = [c.value for c in ws[8]]
        self.assertEqual(totals[0], 'TOTAL')
        self.assertEqual(totals[3:], [917.0, 866.55, 50.84, 0.0, 0.0, -0.39])
        self.assertEqual(ws.title, 'Purchase Book Detailed')

    def test_consolidated_and_summarised_variants(self):
        ws = self._sheet(ErpExcelService.generate_purchase_book_excel(
            self._data('summarised'), None, consolidated=True))
        self.assertIn('CONSOLIDATED PURCHASE BOOK (Summarised)', ws['A3'].value)
        self.assertEqual([c.value for c in ws[5]], ['DATE', 'BILLS', 'BILL AMT.', 'TAXABLE', 'TAX',
                                                    'TAX FREE', 'EXEMPTED', 'R.OFF'])
        self.assertEqual([c.value for c in ws[6]][:3], ['2026-10-31', 1, 917.0])
        total = [c.value for c in ws[7]]
        self.assertEqual((total[0], total[1], total[2]), ('TOTAL', 1, 917.0))

    def test_return_book_workbook_counts_returns(self):
        ws = self._sheet(ErpExcelService.generate_purchase_return_book_excel(self._data('summarised'), None))
        self.assertIn('PURCHASE RETURN BOOK (Summarised)', ws['A3'].value)
        self.assertEqual(ws['B5'].value, 'RETURNS')
        self.assertEqual(ws['B7'].value, 1)  # return_count


class PurchaseReportRouteTests(SimpleTestCase):
    def test_routes_resolve_to_the_new_views(self):
        for path, name in [
            ('/api/v1/reports/erp/purchase-book/', 'erp-purchase-book'),
            ('/api/v1/reports/erp/purchase-book/export/', 'erp-purchase-book-export'),
            ('/api/v1/reports/erp/purchase-return-book/', 'erp-purchase-return-book'),
            ('/api/v1/reports/erp/purchase-return-book/export/', 'erp-purchase-return-book-export'),
        ]:
            self.assertEqual(resolve(path).url_name, name)

    def test_export_returns_xlsx_attachment_with_variant_title(self):
        report = {
            'format': 'detailed',
            'date_range': {'start_date': '2026-10-01', 'end_date': '2026-10-31'},
            'rows': [], 'summary': {},
        }
        request = APIRequestFactory().get(
            '/api/v1/reports/erp/purchase-book/export/',
            {'outletId': 'outlet', 'startDate': '2026-10-01', 'endDate': '2026-10-31',
             'variant': 'consolidated', 'lessReturns': 'true'},
        )
        request.user = SimpleNamespace(outlet=None, outlet_id='outlet', is_authenticated=True)

        view = PurchaseBookExportView()
        view.permission_classes = []
        with patch('apps.reports.erp_views.Outlet.objects') as outlets, \
                patch('apps.reports.erp_views.ErpReportService.get_purchase_book', return_value=report):
            outlets.filter.return_value.exists.return_value = True
            outlets.filter.return_value.first.return_value = None
            response = view.dispatch(request)

        self.assertEqual(response.status_code, 200)
        self.assertIn('Consolidated_Purchase_Book_Detailed_2026-10-01_to_2026-10-31.xlsx',
                      response['Content-Disposition'])
        ws = load_workbook(BytesIO(response.content)).active
        self.assertIn('CONSOLIDATED PURCHASE BOOK', ws['A3'].value)
