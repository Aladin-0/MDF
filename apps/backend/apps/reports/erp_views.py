import io
import logging
from datetime import date
from typing import Tuple, Optional, Dict, Any

from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import PermissionDenied

from apps.core.permissions import IsAuthenticated, CanAccessReports
from apps.core.models import Outlet
from apps.reports.services.erp_report_service import ErpReportService
from apps.reports.services.erp_excel_service import ErpExcelService

logger = logging.getLogger(__name__)


class BaseErpReportView(APIView):
    """
    Base API view for Marg ERP-style reports.
    Overrides DRF content negotiation so `format=detailed` or `format=summarised`
    in query parameters is not misinterpreted as an invalid DRF renderer format.
    """
    permission_classes = [IsAuthenticated, CanAccessReports]

    def perform_content_negotiation(self, request, force=False):
        fmt = request.query_params.get('format')
        if fmt and fmt.lower() in ('detailed', 'summarised', 'summarized', 'summary'):
            renderers = self.get_renderers()
            return renderers[0], renderers[0].media_type
        return super().perform_content_negotiation(request, force=force)

    def extract_params(self, request) -> Tuple[Optional[Dict[str, Any]], Optional[Response]]:
        """
        Extract and validate query parameters for Marg ERP-style reports.
        Supports both camelCase (frontend React/Next.js) and snake_case parameters.
        """
        # 1. Outlet ID extraction & validation
        outlet_id = request.query_params.get('outletId') or request.query_params.get('outlet_id')
        if not outlet_id and hasattr(request.user, 'outlet_id') and request.user.outlet_id:
            outlet_id = str(request.user.outlet_id)

        if not outlet_id:
            return None, Response(
                {'detail': 'outletId is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Outlet isolation. core.permissions.IsAuthenticated only inspects the camelCase
        # `outletId` param, but this view also accepts `outlet_id`; enforce the same rule
        # (non-super_admin staff may only read their own outlet) on the resolved value so
        # no parameter spelling can bypass it.
        if getattr(request.user, 'role', None) != 'super_admin':
            user_outlet_id = str(getattr(request.user, 'outlet_id', '') or '')
            if user_outlet_id and str(outlet_id) != user_outlet_id:
                raise PermissionDenied(
                    'You do not have access to this outlet. '
                    'Staff can only access data from their own outlet.'
                )

        if not Outlet.objects.filter(id=outlet_id).exists():
            return None, Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 2. Date range extraction (fallback to today if missing)
        start_date = (
            request.query_params.get('startDate')
            or request.query_params.get('start_date')
            or request.query_params.get('from')
            or date.today().strftime('%Y-%m-%d')
        )
        end_date = (
            request.query_params.get('endDate')
            or request.query_params.get('end_date')
            or request.query_params.get('to')
            or start_date
        )

        # 3. Format extraction: 'detailed' vs 'summarised'
        format_raw = (
            request.query_params.get('format')
            or request.query_params.get('format_mode')
            or 'detailed'
        ).lower().strip()
        is_summarised = format_raw in ('summarised', 'summarized', 'summary')

        # 4. Less returns toggle (default: true)
        less_returns_raw = request.query_params.get(
            'lessReturns',
            request.query_params.get('less_returns', 'true')
        )
        less_returns = str(less_returns_raw).lower() in ('true', '1', 'yes')

        params = {
            'outlet_id': outlet_id,
            'start_date': start_date,
            'end_date': end_date,
            'is_summarised': is_summarised,
            'less_returns': less_returns,
        }
        return params, None


class ConsolidatedSalesBookView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/sales-book/

    Generates classic Marg ERP-style Consolidated Sales Book report.
    - Detailed Mode: Bill-by-bill register with granular tax slabs (0%, 5%, 12%, 18%, 28%),
      exempted values, round-off, and credit note deductions.
    - Summarised Mode: Date-wise aggregation with invoice counts and daily tax breakdown.
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_consolidated_sales_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
                less_returns=params['less_returns']
            )
            return Response(report_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error generating Consolidated Sales Book report")
            return Response(
                {'detail': f'Error generating sales book report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ConsolidatedSalesBookExportView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/sales-book/export/

    Exports the Consolidated Sales Book report as a Marg ERP-style formatted Excel spreadsheet (.xlsx).
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_consolidated_sales_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
                less_returns=params['less_returns']
            )

            outlet = Outlet.objects.filter(id=params['outlet_id']).first() or getattr(request.user, 'outlet', None)
            wb = ErpExcelService.generate_sales_book_excel(report_data, outlet)

            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            fmt = report_data.get('format', 'detailed')
            start_d = report_data.get('date_range', {}).get('start_date', params['start_date'])
            end_d = report_data.get('date_range', {}).get('end_date', params['end_date'])
            filename = f"Sales_Book_{fmt.title()}_{start_d}_to_{end_d}.xlsx"

            response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.exception("Error exporting Consolidated Sales Book report to Excel")
            return Response(
                {'detail': f'Error exporting sales book to Excel: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GrossProfitReportView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/gross-profit/

    Generates classic Marg ERP-style Gross Profit report.
    - Detailed Mode: Bill-by-bill Net Sales, COGS (via batch landing/purchase rate),
      Gross Profit, and Margin %, with credit note COGS reversals.
    - Summarised Mode: Date-wise aggregated Net Sales, COGS, Gross Profit, and Margin %.
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_gross_profit_report(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
                less_returns=params['less_returns']
            )
            return Response(report_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error generating Gross Profit report")
            return Response(
                {'detail': f'Error generating gross profit report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GrossProfitReportExportView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/gross-profit/export/

    Exports the Gross Profit report as a Marg ERP-style formatted Excel spreadsheet (.xlsx).
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_gross_profit_report(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
                less_returns=params['less_returns']
            )

            outlet = Outlet.objects.filter(id=params['outlet_id']).first() or getattr(request.user, 'outlet', None)
            wb = ErpExcelService.generate_gross_profit_excel(report_data, outlet)

            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            fmt = report_data.get('format', 'detailed')
            start_d = report_data.get('date_range', {}).get('start_date', params['start_date'])
            end_d = report_data.get('date_range', {}).get('end_date', params['end_date'])
            filename = f"Gross_Profit_{fmt.title()}_{start_d}_to_{end_d}.xlsx"

            response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.exception("Error exporting Gross Profit report to Excel")
            return Response(
                {'detail': f'Error exporting gross profit to Excel: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SalesReturnBookView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/sales-return-book/

    Generates classic Marg ERP-style Sales Return Book (Credit Note Register).
    - Detailed Mode: Bill-by-bill credit note register with granular tax slabs (0%, 5%, 12%, 18%, 28%),
      exempted values, round-off, and net return totals.
    - Summarised Mode: Date-wise aggregation with return counts and daily tax breakdown.
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_sales_return_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised']
            )
            return Response(report_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error generating Sales Return Book report")
            return Response(
                {'detail': f'Error generating sales return book report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SalesReturnBookExportView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/sales-return-book/export/

    Exports the Sales Return Book (Credit Note Register) as a Marg ERP-style
    formatted Excel spreadsheet (.xlsx).
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_sales_return_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised']
            )

            outlet = Outlet.objects.filter(id=params['outlet_id']).first() or getattr(request.user, 'outlet', None)
            wb = ErpExcelService.generate_sales_return_book_excel(report_data, outlet)

            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            fmt = report_data.get('format', 'detailed')
            start_d = report_data.get('date_range', {}).get('start_date', params['start_date'])
            end_d = report_data.get('date_range', {}).get('end_date', params['end_date'])
            filename = f"Sales_Return_Book_{fmt.title()}_{start_d}_to_{end_d}.xlsx"

            response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.exception("Error exporting Sales Return Book report to Excel")
            return Response(
                {'detail': f'Error exporting sales return book to Excel: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GrossLossOnReturnView(BaseErpReportView):
    """GET /api/v1/reports/erp/gross-loss-return/."""

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_gross_loss_on_return_report(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
            )
            return Response(report_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error generating Gross Loss on Sales Return report")
            return Response(
                {'detail': f'Error generating gross loss on return report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class GrossLossOnReturnExportView(BaseErpReportView):
    """GET /api/v1/reports/erp/gross-loss-return/export/."""

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_gross_loss_on_return_report(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
            )
            outlet = Outlet.objects.filter(id=params['outlet_id']).first() or getattr(request.user, 'outlet', None)
            wb = ErpExcelService.generate_gross_loss_on_return_excel(report_data, outlet)

            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            fmt = report_data.get('format', 'detailed')
            start_d = report_data.get('date_range', {}).get('start_date', params['start_date'])
            end_d = report_data.get('date_range', {}).get('end_date', params['end_date'])
            filename = f"Gross_Loss_On_Return_{fmt}_{start_d}_to_{end_d}.xlsx"

            response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.exception("Error exporting Gross Loss on Sales Return report")
            return Response(
                {'detail': f'Error exporting gross loss on return report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


def _is_consolidated(request) -> bool:
    """`variant=consolidated` selects the Consolidated Purchase Book title/filename."""
    return str(request.query_params.get('variant', '')).lower() == 'consolidated'


def _purchase_less_returns(request, params) -> bool:
    """
    Whether to net debit notes off the purchase book.
    The shared param parser defaults `lessReturns` to true (right for the sales books), but a plain
    Purchase Book is a register of purchases: only the Consolidated variant nets returns by default.
    An explicit `lessReturns` / `less_returns` value always wins.
    """
    if 'lessReturns' in request.query_params or 'less_returns' in request.query_params:
        return params['less_returns']
    return _is_consolidated(request)


class PurchaseBookView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/purchase-book/

    Marg ERP-style Purchase Book / Consolidated Purchase Book.
    - Detailed Mode: bill-by-bill register (DATE, BILL NO., PARTY NAME, BILL AMT., TAXABLE,
      TAX, TAX FREE, EXEMPTED, R.OFF) of POSTED purchase invoices.
    - Summarised Mode: date-wise aggregation with bill counts.
    - `lessReturns=true` nets debit notes (purchase returns) off as negative rows.
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_purchase_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
                less_returns=_purchase_less_returns(request, params),
            )
            return Response(report_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error generating Purchase Book report")
            return Response(
                {'detail': f'Error generating purchase book report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PurchaseBookExportView(BaseErpReportView):
    """GET /api/v1/reports/erp/purchase-book/export/ (?variant=consolidated)."""

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            consolidated = _is_consolidated(request)
            report_data = ErpReportService.get_purchase_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
                less_returns=_purchase_less_returns(request, params),
            )

            outlet = Outlet.objects.filter(id=params['outlet_id']).first() or getattr(request.user, 'outlet', None)
            wb = ErpExcelService.generate_purchase_book_excel(report_data, outlet, consolidated=consolidated)

            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            fmt = report_data.get('format', 'detailed')
            start_d = report_data.get('date_range', {}).get('start_date', params['start_date'])
            end_d = report_data.get('date_range', {}).get('end_date', params['end_date'])
            prefix = 'Consolidated_Purchase_Book' if consolidated else 'Purchase_Book'
            filename = f"{prefix}_{fmt.title()}_{start_d}_to_{end_d}.xlsx"

            response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.exception("Error exporting Purchase Book report to Excel")
            return Response(
                {'detail': f'Error exporting purchase book to Excel: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PurchaseReturnBookView(BaseErpReportView):
    """
    GET /api/v1/reports/erp/purchase-return-book/

    Marg ERP-style Purchase Return Book (Debit Note register).
    - Detailed Mode: one row per debit note.
    - Summarised Mode: date-wise aggregation with return counts.
    """

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_purchase_return_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
            )
            return Response(report_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error generating Purchase Return Book report")
            return Response(
                {'detail': f'Error generating purchase return book report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PurchaseReturnBookExportView(BaseErpReportView):
    """GET /api/v1/reports/erp/purchase-return-book/export/."""

    def get(self, request, *args, **kwargs):
        params, err_response = self.extract_params(request)
        if err_response:
            return err_response

        try:
            report_data = ErpReportService.get_purchase_return_book(
                outlet_id=params['outlet_id'],
                start_date=params['start_date'],
                end_date=params['end_date'],
                is_summarised=params['is_summarised'],
            )

            outlet = Outlet.objects.filter(id=params['outlet_id']).first() or getattr(request.user, 'outlet', None)
            wb = ErpExcelService.generate_purchase_return_book_excel(report_data, outlet)

            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            fmt = report_data.get('format', 'detailed')
            start_d = report_data.get('date_range', {}).get('start_date', params['start_date'])
            end_d = report_data.get('date_range', {}).get('end_date', params['end_date'])
            filename = f"Purchase_Return_Book_{fmt.title()}_{start_d}_to_{end_d}.xlsx"

            response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.exception("Error exporting Purchase Return Book report to Excel")
            return Response(
                {'detail': f'Error exporting purchase return book to Excel: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

