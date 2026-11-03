from datetime import date
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from django.urls import resolve
from openpyxl import load_workbook
from rest_framework.test import APIRequestFactory

from apps.reports.erp_views import GrossLossOnReturnExportView
from apps.reports.services.erp_excel_service import ErpExcelService
from apps.reports.services.erp_report_service import ErpReportService


class GrossLossOnReturnReportTests(SimpleTestCase):
    def test_detailed_and_daily_totals_use_return_quantity_and_cost_fallbacks(self):
        batch = SimpleNamespace(pack_size=10, landing_rate=Decimal('40'), purchase_rate=Decimal('35'))
        purchase_rate_batch = SimpleNamespace(pack_size=0, landing_rate=None, purchase_rate=Decimal('7'))

        def make_return(day, number, amount, items, customer=None):
            return SimpleNamespace(
                return_date=date(2026, 10, day),
                return_no=number,
                total_amount=Decimal(amount),
                original_sale=SimpleNamespace(customer=customer) if customer else None,
                items=SimpleNamespace(all=lambda: items),
            )

        returns = [
            make_return(1, 'R-1', '100', [
                SimpleNamespace(batch=batch, qty_returned_strips=1, qty_returned_loose=2, qty_returned=12),
            ], SimpleNamespace(name='Alice')),
            make_return(1, 'R-2', '50', [
                SimpleNamespace(batch=purchase_rate_batch, qty_returned_strips=0, qty_returned_loose=0, qty_returned=3),
            ]),
            make_return(2, 'R-3', '0', []),
        ]
        queryset = MagicMock()
        queryset.select_related.return_value.prefetch_related.return_value.order_by.return_value = returns

        with patch('apps.reports.services.erp_report_service.SalesReturn.objects.filter', return_value=queryset) as filter_returns:
            detailed = ErpReportService.get_gross_loss_on_return_report('outlet', '2026-10-01', '2026-10-02')
            daily = ErpReportService.get_gross_loss_on_return_report(
                'outlet', '2026-10-01', '2026-10-02', is_summarised=True,
            )

        filter_returns.assert_called_with(
            outlet_id='outlet', return_date__range=(date(2026, 10, 1), date(2026, 10, 2)),
        )
        self.assertEqual(detailed['rows'][0], {
            'date': '2026-10-01', 'return_no': 'R-1', 'party_name': 'Alice',
            'return_amount': 100.0, 'cogs': 48.0, 'gross_loss': 52.0, 'loss_pct': 52.0,
        })
        self.assertEqual(detailed['rows'][1]['party_name'], 'Walk-in Customer (Return)')
        self.assertEqual(detailed['rows'][1]['cogs'], 21.0)
        self.assertEqual(detailed['rows'][2]['loss_pct'], 0.0)
        self.assertEqual(daily['rows'], [
            {'date': '2026-10-01', 'return_count': 2, 'return_amount': 150.0,
             'cogs': 69.0, 'gross_loss': 81.0, 'loss_pct': 54.0},
            {'date': '2026-10-02', 'return_count': 1, 'return_amount': 0.0,
             'cogs': 0.0, 'gross_loss': 0.0, 'loss_pct': 0.0},
        ])
        self.assertEqual(daily['summary'], {
            'return_count': 3, 'total_return_amount': 150.0, 'total_cogs': 69.0,
            'total_gross_loss': 81.0, 'loss_pct': 54.0,
        })

    def test_exported_workbook_has_detailed_and_daily_columns_and_totals(self):
        base = {
            'date_range': {'start_date': '2026-10-01', 'end_date': '2026-10-02'},
            'summary': {
                'return_count': 2, 'total_return_amount': 150.0,
                'total_cogs': 69.0, 'total_gross_loss': 81.0, 'loss_pct': 54.0,
            },
        }
        cases = [
            ('detailed', {
                'date': '2026-10-01', 'return_no': 'R-1', 'party_name': 'Alice',
                'return_amount': 100.0, 'cogs': 48.0, 'gross_loss': 52.0, 'loss_pct': 52.0,
            }, ['Date', 'Return No', 'Party Name', 'Return Amount', 'Cost', 'Gross Loss', 'Loss %'],
             [100.0, 48.0, 52.0, 52.0], 4),
            ('summarised', {
                'date': '2026-10-01', 'return_count': 2,
                'return_amount': 150.0, 'cogs': 69.0, 'gross_loss': 81.0, 'loss_pct': 54.0,
            }, ['Date', 'Return Count', 'Return Amount', 'Cost', 'Gross Loss', 'Loss %'],
             [150.0, 69.0, 81.0, 54.0], 3),
        ]
        for format_mode, row, headers, amounts, amount_col in cases:
            with self.subTest(format_mode=format_mode):
                wb = ErpExcelService.generate_gross_loss_on_return_excel(
                    {**base, 'format': format_mode, 'rows': [row]}, None,
                )
                stream = BytesIO()
                wb.save(stream)
                ws = load_workbook(BytesIO(stream.getvalue())).active

                self.assertEqual(ws.freeze_panes, 'A6')
                self.assertEqual([cell.value for cell in ws[5]], headers)
                self.assertEqual(
                    [ws.cell(6, col).value for col in range(amount_col, amount_col + 4)],
                    amounts,
                )
                self.assertEqual(ws.cell(6, amount_col).number_format, ErpExcelService.CURRENCY_FORMAT)
                self.assertEqual(ws.cell(6, amount_col + 3).number_format, ErpExcelService.PERCENT_FORMAT)
                self.assertEqual(ws.cell(6, 1).font.color.rgb[-6:], 'C00000')
                self.assertEqual(ws.cell(6, 1).fill.fgColor.rgb[-6:], 'FFF2F2')
                self.assertEqual(ws.cell(7, amount_col).value, 150.0)
                self.assertEqual(ws.cell(7, amount_col + 1).value, 69.0)
                self.assertEqual(ws.cell(7, amount_col + 2).value, 81.0)
                self.assertEqual(ws.cell(7, amount_col + 3).value, 54.0)
                self.assertEqual(ws.cell(7, 1).value, 'TOTAL')

    def test_export_route_returns_xlsx_attachment(self):
        path = '/api/v1/reports/erp/gross-loss-return/export/'
        self.assertEqual(resolve(path).url_name, 'erp-gross-loss-return-export')
        report_data = {
            'format': 'detailed',
            'date_range': {'start_date': '2026-10-01', 'end_date': '2026-10-02'},
            'rows': [], 'summary': {},
        }
        request = APIRequestFactory().get(path)
        request.user = SimpleNamespace(outlet=None)
        view = GrossLossOnReturnExportView()
        params = {
            'outlet_id': 'outlet', 'start_date': '2026-10-01',
            'end_date': '2026-10-02', 'is_summarised': False,
        }
        with patch.object(view, 'extract_params', return_value=(params, None)), \
             patch('apps.reports.erp_views.ErpReportService.get_gross_loss_on_return_report', return_value=report_data), \
             patch('apps.reports.erp_views.Outlet.objects.filter') as outlet_filter:
            outlet_filter.return_value.first.return_value = None
            response = view.get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        self.assertEqual(
            response['Content-Disposition'],
            'attachment; filename="Gross_Loss_On_Return_detailed_2026-10-01_to_2026-10-02.xlsx"',
        )
        self.assertEqual(load_workbook(BytesIO(response.content)).active['A5'].value, 'Date')
