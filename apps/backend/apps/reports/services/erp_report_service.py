import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Dict, Any, List, Optional
from collections import defaultdict

from django.db.models import Sum, F, Q, Case, When, Value, FloatField
from django.db.models.functions import Coalesce, Cast
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem
from apps.accounts.models import DebitNote
from apps.purchases.models import PurchaseInvoice

logger = logging.getLogger(__name__)


class ErpReportService:
    """
    High-performance aggregation engine for Marg ERP-style reporting.
    Solves the N+1 query bottleneck by using targeted prefetching and in-memory bucketing.
    """

    @staticmethod
    def _parse_date(d: Any, default_val: Optional[date] = None) -> date:
        if isinstance(d, date):
            return d
        if isinstance(d, datetime):
            return d.date()
        if isinstance(d, str) and d.strip():
            try:
                return datetime.strptime(d.strip(), '%Y-%m-%d').date()
            except ValueError:
                pass
        return default_val or date.today()

    @classmethod
    def get_consolidated_sales_book(
        cls,
        outlet_id: str,
        start_date: Any,
        end_date: Any,
        is_summarised: bool = False,
        less_returns: bool = True
    ) -> Dict[str, Any]:
        """
        Consolidated Sales Book report.
        Detailed Mode: One row per invoice (and credit note if less_returns is True) with
                       taxable values broken down across 0%, 5%, 12%, 18%, 28% GST slabs.
        Summarised Mode: Rows grouped by date (YYYY-MM-DD).
        """
        start = cls._parse_date(start_date)
        end = cls._parse_date(end_date)
        if start > end:
            start, end = end, start

        # 1. Fetch Invoices in single query with prefetch to avoid N+1
        invoices = SaleInvoice.objects.filter(
            outlet_id=outlet_id,
            invoice_date__date__range=(start, end),
            is_cancelled=False,
            is_return=False
        ).select_related('customer').prefetch_related(
            'items__batch',
            'items__batch__product'
        ).order_by('invoice_date', 'invoice_no')

        detailed_rows: List[Dict[str, Any]] = []
        daily_summary_map: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'date': '',
            'bill_count': 0,
            'taxable': 0.0,
            'tax_5': 0.0,
            'tax_12': 0.0,
            'tax_18': 0.0,
            'tax_28': 0.0,
            'total_gst': 0.0,
            'exempted': 0.0,
            'round_off': 0.0,
            'net_total': 0.0,
        })

        total_taxable = 0.0
        total_tax_5 = 0.0
        total_tax_12 = 0.0
        total_tax_18 = 0.0
        total_tax_28 = 0.0
        total_gst = 0.0
        total_exempted = 0.0
        total_round_off = 0.0
        total_net_sales = 0.0

        for inv in invoices:
            dt_str = inv.invoice_date.strftime('%Y-%m-%d')
            party_name = inv.customer.name if inv.customer and inv.customer.name else 'Cash Walk-in'
            gstin = inv.customer.gstin if inv.customer and inv.customer.gstin else ''

            inv_taxable = 0.0
            inv_tax_5 = 0.0
            inv_tax_12 = 0.0
            inv_tax_18 = 0.0
            inv_tax_28 = 0.0
            inv_total_gst = 0.0
            inv_exempted = 0.0

            for item in inv.items.all():
                rate = float(item.gst_rate or 0.0)
                item_taxable = float(item.taxable_amount or 0.0)
                item_gst = float(item.gst_amount or (item.cgst_amount + item.sgst_amount + item.igst_amount) or 0.0)

                inv_taxable += item_taxable
                inv_total_gst += item_gst

                # Granular GST Slab Bucketing
                if abs(rate - 5.0) < 0.5:
                    inv_tax_5 += item_gst
                elif abs(rate - 12.0) < 0.5:
                    inv_tax_12 += item_gst
                elif abs(rate - 18.0) < 0.5:
                    inv_tax_18 += item_gst
                elif abs(rate - 28.0) < 0.5:
                    inv_tax_28 += item_gst
                elif rate <= 0.01:
                    inv_exempted += item_taxable

            r_off = float(inv.round_off or 0.0)
            n_tot = float(inv.grand_total or 0.0)

            # Round to 2 decimals per row
            row_dict = {
                'date': dt_str,
                'bill_no': inv.invoice_no,
                'party_name': party_name,
                'gstin': gstin,
                'taxable': round(inv_taxable, 2),
                'tax_5': round(inv_tax_5, 2),
                'tax_12': round(inv_tax_12, 2),
                'tax_18': round(inv_tax_18, 2),
                'tax_28': round(inv_tax_28, 2),
                'total_gst': round(inv_total_gst, 2),
                'exempted': round(inv_exempted, 2),
                'round_off': round(r_off, 2),
                'net_total': round(n_tot, 2),
                'is_return': False,
            }
            detailed_rows.append(row_dict)

            # Accumulate daily summary
            d_map = daily_summary_map[dt_str]
            d_map['date'] = dt_str
            d_map['bill_count'] += 1
            d_map['taxable'] += inv_taxable
            d_map['tax_5'] += inv_tax_5
            d_map['tax_12'] += inv_tax_12
            d_map['tax_18'] += inv_tax_18
            d_map['tax_28'] += inv_tax_28
            d_map['total_gst'] += inv_total_gst
            d_map['exempted'] += inv_exempted
            d_map['round_off'] += r_off
            d_map['net_total'] += n_tot

            # Accumulate global totals
            total_taxable += inv_taxable
            total_tax_5 += inv_tax_5
            total_tax_12 += inv_tax_12
            total_tax_18 += inv_tax_18
            total_tax_28 += inv_tax_28
            total_gst += inv_total_gst
            total_exempted += inv_exempted
            total_round_off += r_off
            total_net_sales += n_tot

        # 2. Process Sales Returns if less_returns is True
        return_count = 0
        total_return_amount = 0.0

        if less_returns:
            returns = SalesReturn.objects.filter(
                outlet_id=outlet_id,
                return_date__range=(start, end)
            ).select_related('original_sale__customer').prefetch_related(
                'items__batch',
                'items__batch__product',
                'items__original_sale_item'
            ).order_by('return_date', 'return_no')

            return_count = returns.count()

            for ret in returns:
                ret_dt_str = ret.return_date.strftime('%Y-%m-%d')
                ret_amount = float(ret.total_amount or 0.0)
                total_return_amount += ret_amount

                cust = ret.original_sale.customer if ret.original_sale else None
                party_name = cust.name if cust and cust.name else 'Walk-in Customer (Return)'
                gstin = cust.gstin if cust and cust.gstin else ''

                ret_taxable = 0.0
                ret_tax_5 = 0.0
                ret_tax_12 = 0.0
                ret_tax_18 = 0.0
                ret_tax_28 = 0.0
                ret_total_gst = 0.0
                ret_exempted = 0.0

                for item in ret.items.all():
                    gst_rate = 0.0
                    if item.original_sale_item and item.original_sale_item.gst_rate is not None:
                        gst_rate = float(item.original_sale_item.gst_rate)
                    elif item.batch and item.batch.product and item.batch.product.gst_rate is not None:
                        gst_rate = float(item.batch.product.gst_rate)

                    it_total = float(item.total_amount or 0.0)
                    if gst_rate > 0:
                        it_taxable = it_total / (1.0 + (gst_rate / 100.0))
                        it_gst = it_total - it_taxable
                    else:
                        it_taxable = it_total
                        it_gst = 0.0

                    ret_taxable += it_taxable
                    ret_total_gst += it_gst

                    if abs(gst_rate - 5.0) < 0.5:
                        ret_tax_5 += it_gst
                    elif abs(gst_rate - 12.0) < 0.5:
                        ret_tax_12 += it_gst
                    elif abs(gst_rate - 18.0) < 0.5:
                        ret_tax_18 += it_gst
                    elif abs(gst_rate - 28.0) < 0.5:
                        ret_tax_28 += it_gst
                    elif gst_rate <= 0.01:
                        ret_exempted += it_taxable

                ret_row_dict = {
                    'date': ret_dt_str,
                    'bill_no': ret.return_no,
                    'party_name': party_name,
                    'gstin': gstin,
                    'taxable': round(-ret_taxable, 2),
                    'tax_5': round(-ret_tax_5, 2),
                    'tax_12': round(-ret_tax_12, 2),
                    'tax_18': round(-ret_tax_18, 2),
                    'tax_28': round(-ret_tax_28, 2),
                    'total_gst': round(-ret_total_gst, 2),
                    'exempted': round(-ret_exempted, 2),
                    'round_off': 0.0,
                    'net_total': round(-ret_amount, 2),
                    'is_return': True,
                }
                detailed_rows.append(ret_row_dict)

                # Deduct from daily summary
                d_map = daily_summary_map[ret_dt_str]
                d_map['date'] = ret_dt_str
                d_map['taxable'] -= ret_taxable
                d_map['tax_5'] -= ret_tax_5
                d_map['tax_12'] -= ret_tax_12
                d_map['tax_18'] -= ret_tax_18
                d_map['tax_28'] -= ret_tax_28
                d_map['total_gst'] -= ret_total_gst
                d_map['exempted'] -= ret_exempted
                d_map['net_total'] -= ret_amount

                # Deduct from global totals
                total_taxable -= ret_taxable
                total_tax_5 -= ret_tax_5
                total_tax_12 -= ret_tax_12
                total_tax_18 -= ret_tax_18
                total_tax_28 -= ret_tax_28
                total_gst -= ret_total_gst
                total_exempted -= ret_exempted
                total_net_sales -= ret_amount

        # Sort detailed rows chronologically by date and bill_no
        detailed_rows.sort(key=lambda r: (r['date'], r['bill_no']))

        # Convert daily summary map to sorted list
        summarised_rows = []
        for day_str in sorted(daily_summary_map.keys()):
            d_val = daily_summary_map[day_str]
            summarised_rows.append({
                'date': d_val['date'],
                'bill_count': d_val['bill_count'],
                'taxable': round(d_val['taxable'], 2),
                'tax_5': round(d_val['tax_5'], 2),
                'tax_12': round(d_val['tax_12'], 2),
                'tax_18': round(d_val['tax_18'], 2),
                'tax_28': round(d_val['tax_28'], 2),
                'total_gst': round(d_val['total_gst'], 2),
                'exempted': round(d_val['exempted'], 2),
                'round_off': round(d_val['round_off'], 2),
                'net_total': round(d_val['net_total'], 2),
            })

        return {
            'format': 'summarised' if is_summarised else 'detailed',
            'date_range': {
                'start_date': start.strftime('%Y-%m-%d'),
                'end_date': end.strftime('%Y-%m-%d'),
            },
            'less_returns': less_returns,
            'rows': summarised_rows if is_summarised else detailed_rows,
            'summary': {
                'total_taxable': round(total_taxable, 2),
                'total_tax_5': round(total_tax_5, 2),
                'total_tax_12': round(total_tax_12, 2),
                'total_tax_18': round(total_tax_18, 2),
                'total_tax_28': round(total_tax_28, 2),
                'total_gst': round(total_gst, 2),
                'total_exempted': round(total_exempted, 2),
                'total_round_off': round(total_round_off, 2),
                'total_net_sales': round(total_net_sales, 2),
                'invoice_count': invoices.count(),
                'return_count': return_count,
                'return_amount': round(total_return_amount, 2),
            }
        }

    @classmethod
    def get_gross_profit_report(
        cls,
        outlet_id: str,
        start_date: Any,
        end_date: Any,
        is_summarised: bool = False,
        less_returns: bool = True
    ) -> Dict[str, Any]:
        """
        Gross Profit Report.
        Detailed Mode: One row per invoice (and credit note if less_returns is True) with
                       Net Sales, COGS, Gross Profit, and Gross Profit Margin %.
        Summarised Mode: Rows grouped by date (YYYY-MM-DD).
        """
        start = cls._parse_date(start_date)
        end = cls._parse_date(end_date)
        if start > end:
            start, end = end, start

        # 1. Fetch Invoices in single query with prefetch to avoid N+1
        invoices = SaleInvoice.objects.filter(
            outlet_id=outlet_id,
            invoice_date__date__range=(start, end),
            is_cancelled=False,
            is_return=False
        ).select_related('customer').prefetch_related(
            'items__batch',
            'items__batch__product'
        ).order_by('invoice_date', 'invoice_no')

        detailed_rows: List[Dict[str, Any]] = []
        daily_summary_map: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'date': '',
            'bill_count': 0,
            'net_sales': 0.0,
            'cogs': 0.0,
            'gross_profit': 0.0,
            'profit_pct': 0.0,
        })

        total_sales = 0.0
        total_cogs = 0.0

        for inv in invoices:
            dt_str = inv.invoice_date.strftime('%Y-%m-%d')
            party_name = inv.customer.name if inv.customer and inv.customer.name else 'Cash Walk-in'
            inv_sales = float(inv.grand_total or 0.0)

            inv_cogs = 0.0
            for item in inv.items.all():
                batch = item.batch
                pack_size = item.pack_size or (batch.pack_size if batch else 1) or 1
                total_loose = (item.qty_strips * pack_size) + item.qty_loose

                cost_rate = float(batch.landing_rate or batch.purchase_rate or 0.0) if batch else 0.0
                cost_per_loose = cost_rate / pack_size if pack_size > 0 else 0.0
                inv_cogs += cost_per_loose * total_loose

            inv_gp = inv_sales - inv_cogs
            inv_margin_pct = round((inv_gp / inv_sales * 100.0), 2) if inv_sales > 0 else 0.0

            detailed_rows.append({
                'date': dt_str,
                'bill_no': inv.invoice_no,
                'party_name': party_name,
                'net_sales': round(inv_sales, 2),
                'cogs': round(inv_cogs, 2),
                'gross_profit': round(inv_gp, 2),
                'profit_pct': inv_margin_pct,
                'is_return': False,
            })

            d_map = daily_summary_map[dt_str]
            d_map['date'] = dt_str
            d_map['bill_count'] += 1
            d_map['net_sales'] += inv_sales
            d_map['cogs'] += inv_cogs

            total_sales += inv_sales
            total_cogs += inv_cogs

        # 2. Process Returns & COGS Reversal if less_returns is True
        return_count = 0
        total_returns_amount = 0.0
        total_returns_cogs_reversed = 0.0

        if less_returns:
            returns = SalesReturn.objects.filter(
                outlet_id=outlet_id,
                return_date__range=(start, end)
            ).select_related('original_sale__customer').prefetch_related(
                'items__batch',
                'items__batch__product'
            ).order_by('return_date', 'return_no')

            return_count = returns.count()

            for ret in returns:
                ret_dt_str = ret.return_date.strftime('%Y-%m-%d')
                ret_refund = float(ret.total_amount or 0.0)
                total_returns_amount += ret_refund

                cust = ret.original_sale.customer if ret.original_sale else None
                party_name = cust.name if cust and cust.name else 'Walk-in Customer (Return)'

                ret_cogs = 0.0
                for item in ret.items.all():
                    batch = item.batch
                    pack_size = (batch.pack_size if batch else 1) or 1
                    total_returned_loose = (item.qty_returned_strips * pack_size) + item.qty_returned_loose

                    # Failsafe: if strips & loose are zero, fallback to qty_returned
                    if total_returned_loose == 0:
                        total_returned_loose = item.qty_returned

                    cost_rate = float(batch.landing_rate or batch.purchase_rate or 0.0) if batch else 0.0
                    cost_per_loose = cost_rate / pack_size if pack_size > 0 else 0.0
                    ret_cogs += cost_per_loose * total_returned_loose

                total_returns_cogs_reversed += ret_cogs

                # Net return effect: negative sale, negative COGS
                ret_gp = (-ret_refund) - (-ret_cogs)
                ret_margin_pct = round((ret_gp / ret_refund * 100.0), 2) if ret_refund > 0 else 0.0

                detailed_rows.append({
                    'date': ret_dt_str,
                    'bill_no': ret.return_no,
                    'party_name': party_name,
                    'net_sales': round(-ret_refund, 2),
                    'cogs': round(-ret_cogs, 2),
                    'gross_profit': round(ret_gp, 2),
                    'profit_pct': ret_margin_pct,
                    'is_return': True,
                })

                d_map = daily_summary_map[ret_dt_str]
                d_map['date'] = ret_dt_str
                d_map['net_sales'] -= ret_refund
                d_map['cogs'] -= ret_cogs

                total_sales -= ret_refund
                total_cogs -= ret_cogs

        # Sort detailed rows chronologically
        detailed_rows.sort(key=lambda r: (r['date'], r['bill_no']))

        # Convert daily summary map to sorted list with margin %
        summarised_rows = []
        for day_str in sorted(daily_summary_map.keys()):
            d_val = daily_summary_map[day_str]
            d_sales = d_val['net_sales']
            d_cogs = d_val['cogs']
            d_gp = d_sales - d_cogs
            d_pct = round((d_gp / d_sales * 100.0), 2) if d_sales > 0 else 0.0

            summarised_rows.append({
                'date': d_val['date'],
                'bill_count': d_val['bill_count'],
                'net_sales': round(d_sales, 2),
                'cogs': round(d_cogs, 2),
                'gross_profit': round(d_gp, 2),
                'profit_pct': d_pct,
            })

        global_gp = total_sales - total_cogs
        global_margin_pct = round((global_gp / total_sales * 100.0), 2) if total_sales > 0 else 0.0

        return {
            'format': 'summarised' if is_summarised else 'detailed',
            'date_range': {
                'start_date': start.strftime('%Y-%m-%d'),
                'end_date': end.strftime('%Y-%m-%d'),
            },
            'less_returns': less_returns,
            'rows': summarised_rows if is_summarised else detailed_rows,
            'summary': {
                'total_sales': round(total_sales, 2),
                'total_cogs': round(total_cogs, 2),
                'total_gross_profit': round(global_gp, 2),
                'profit_pct': global_margin_pct,
                'invoice_count': invoices.count(),
                'return_count': return_count,
                'return_amount': round(total_returns_amount, 2),
                'return_cogs_reversed': round(total_returns_cogs_reversed, 2),
            }
        }

    @classmethod
    def get_sales_return_book(
        cls,
        outlet_id: str,
        start_date: Any,
        end_date: Any,
        is_summarised: bool = False
    ) -> Dict[str, Any]:
        """
        Sales Return Book (Credit Note Register) report.
        Tracks all refunded bills and breaks down reversed tax liabilities across
        granular GST slabs (0%, 5%, 12%, 18%, 28%, Exempted).
        - Detailed Mode: One row per SalesReturn with date, return_no, party_name,
          gstin, taxable, tax_5, tax_12, tax_18, tax_28, total_gst, exempted, round_off, net_total.
        - Summarised Mode: Rows grouped by return_date with daily totals.
        """
        start = cls._parse_date(start_date)
        end = cls._parse_date(end_date)
        if start > end:
            start, end = end, start

        returns = SalesReturn.objects.filter(
            outlet_id=outlet_id,
            return_date__range=(start, end)
        ).select_related('original_sale__customer').prefetch_related(
            'items__original_sale_item',
            'items__batch__product'
        ).order_by('return_date', 'return_no')

        detailed_rows: List[Dict[str, Any]] = []
        daily_summary_map: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'date': '',
            'return_count': 0,
            'bill_count': 0,
            'taxable': 0.0,
            'tax_5': 0.0,
            'tax_12': 0.0,
            'tax_18': 0.0,
            'tax_28': 0.0,
            'total_gst': 0.0,
            'exempted': 0.0,
            'round_off': 0.0,
            'net_total': 0.0,
        })

        total_taxable = 0.0
        total_tax_5 = 0.0
        total_tax_12 = 0.0
        total_tax_18 = 0.0
        total_tax_28 = 0.0
        total_gst = 0.0
        total_exempted = 0.0
        total_round_off = 0.0
        total_net_returns = 0.0

        for ret in returns:
            ret_dt_str = ret.return_date.strftime('%Y-%m-%d')
            ret_amount = float(ret.total_amount or 0.0)

            cust = ret.original_sale.customer if ret.original_sale else None
            party_name = cust.name if cust and cust.name else 'Walk-in Customer'
            gstin = cust.gstin if cust and cust.gstin else ''

            ret_taxable = 0.0
            ret_tax_5 = 0.0
            ret_tax_12 = 0.0
            ret_tax_18 = 0.0
            ret_tax_28 = 0.0
            ret_total_gst = 0.0
            ret_exempted = 0.0

            for item in ret.items.all():
                gst_rate = 0.0
                if item.original_sale_item and item.original_sale_item.gst_rate is not None:
                    gst_rate = float(item.original_sale_item.gst_rate)
                elif item.batch and item.batch.product and item.batch.product.gst_rate is not None:
                    gst_rate = float(item.batch.product.gst_rate)

                it_total = float(item.total_amount or 0.0)
                if gst_rate > 0:
                    it_taxable = it_total / (1.0 + (gst_rate / 100.0))
                    it_gst = it_total - it_taxable
                else:
                    it_taxable = it_total
                    it_gst = 0.0

                ret_taxable += it_taxable
                ret_total_gst += it_gst

                if abs(gst_rate - 5.0) < 0.5:
                    ret_tax_5 += it_gst
                elif abs(gst_rate - 12.0) < 0.5:
                    ret_tax_12 += it_gst
                elif abs(gst_rate - 18.0) < 0.5:
                    ret_tax_18 += it_gst
                elif abs(gst_rate - 28.0) < 0.5:
                    ret_tax_28 += it_gst
                elif gst_rate <= 0.01:
                    ret_exempted += it_taxable

            ret_row_dict = {
                'date': ret_dt_str,
                'return_no': ret.return_no,
                'bill_no': ret.return_no,
                'party_name': party_name,
                'gstin': gstin,
                'taxable': round(ret_taxable, 2),
                'tax_5': round(ret_tax_5, 2),
                'tax_12': round(ret_tax_12, 2),
                'tax_18': round(ret_tax_18, 2),
                'tax_28': round(ret_tax_28, 2),
                'total_gst': round(ret_total_gst, 2),
                'exempted': round(ret_exempted, 2),
                'round_off': 0.0,
                'net_total': round(ret_amount, 2),
                'is_return': True,
            }
            detailed_rows.append(ret_row_dict)

            # Daily summary aggregation
            d_map = daily_summary_map[ret_dt_str]
            d_map['date'] = ret_dt_str
            d_map['return_count'] += 1
            d_map['bill_count'] += 1
            d_map['taxable'] += ret_taxable
            d_map['tax_5'] += ret_tax_5
            d_map['tax_12'] += ret_tax_12
            d_map['tax_18'] += ret_tax_18
            d_map['tax_28'] += ret_tax_28
            d_map['total_gst'] += ret_total_gst
            d_map['exempted'] += ret_exempted
            d_map['net_total'] += ret_amount

            # Global totals accumulation
            total_taxable += ret_taxable
            total_tax_5 += ret_tax_5
            total_tax_12 += ret_tax_12
            total_tax_18 += ret_tax_18
            total_tax_28 += ret_tax_28
            total_gst += ret_total_gst
            total_exempted += ret_exempted
            total_net_returns += ret_amount

        # Sort detailed rows chronologically by date and return_no
        detailed_rows.sort(key=lambda r: (r['date'], r['return_no']))

        # Convert daily summary map to sorted list
        summarised_rows = []
        for day_str in sorted(daily_summary_map.keys()):
            d_val = daily_summary_map[day_str]
            summarised_rows.append({
                'date': d_val['date'],
                'return_count': d_val['return_count'],
                'bill_count': d_val['bill_count'],
                'taxable': round(d_val['taxable'], 2),
                'tax_5': round(d_val['tax_5'], 2),
                'tax_12': round(d_val['tax_12'], 2),
                'tax_18': round(d_val['tax_18'], 2),
                'tax_28': round(d_val['tax_28'], 2),
                'total_gst': round(d_val['total_gst'], 2),
                'exempted': round(d_val['exempted'], 2),
                'round_off': round(d_val['round_off'], 2),
                'net_total': round(d_val['net_total'], 2),
            })

        return {
            'format': 'summarised' if is_summarised else 'detailed',
            'date_range': {
                'start_date': start.strftime('%Y-%m-%d'),
                'end_date': end.strftime('%Y-%m-%d'),
            },
            'rows': summarised_rows if is_summarised else detailed_rows,
            'summary': {
                'total_taxable': round(total_taxable, 2),
                'total_tax_5': round(total_tax_5, 2),
                'total_tax_12': round(total_tax_12, 2),
                'total_tax_18': round(total_tax_18, 2),
                'total_tax_28': round(total_tax_28, 2),
                'total_gst': round(total_gst, 2),
                'total_exempted': round(total_exempted, 2),
                'total_round_off': round(total_round_off, 2),
                'total_net_returns': round(total_net_returns, 2),
                'total_net_sales': round(total_net_returns, 2),
                'return_count': returns.count(),
                'invoice_count': returns.count(),
            }
        }

    @classmethod
    def get_gross_loss_on_return_report(
        cls,
        outlet_id: str,
        start_date: Any,
        end_date: Any,
        is_summarised: bool = False,
    ) -> Dict[str, Any]:
        """Report refunded revenue, reversed cost, and lost profit on sales returns."""
        start = cls._parse_date(start_date)
        end = cls._parse_date(end_date)
        if start > end:
            start, end = end, start

        returns = SalesReturn.objects.filter(
            outlet_id=outlet_id,
            return_date__range=(start, end),
        ).select_related('original_sale__customer').prefetch_related(
            'items__batch__product',
        ).order_by('return_date', 'return_no')

        detailed_rows: List[Dict[str, Any]] = []
        daily_totals: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'return_count': 0,
            'return_amount': 0.0,
            'cogs': 0.0,
        })
        total_return_amount = 0.0
        total_cogs = 0.0

        for ret in returns:
            day = ret.return_date.strftime('%Y-%m-%d')
            return_amount = float(ret.total_amount or 0.0)
            customer = ret.original_sale.customer if ret.original_sale else None
            party_name = customer.name if customer and customer.name else 'Walk-in Customer (Return)'

            cogs = 0.0
            for item in ret.items.all():
                batch = item.batch
                pack_size = batch.pack_size or 1
                total_loose = (
                    (item.qty_returned_strips * pack_size) + item.qty_returned_loose
                )
                if total_loose == 0:
                    total_loose = item.qty_returned
                cost_rate = float(batch.landing_rate or batch.purchase_rate or 0.0)
                cogs += (cost_rate / pack_size) * total_loose

            gross_loss = return_amount - cogs
            detailed_rows.append({
                'date': day,
                'return_no': ret.return_no,
                'party_name': party_name,
                'return_amount': round(return_amount, 2),
                'cogs': round(cogs, 2),
                'gross_loss': round(gross_loss, 2),
                'loss_pct': round(gross_loss / return_amount * 100, 2) if return_amount else 0.0,
            })

            daily = daily_totals[day]
            daily['return_count'] += 1
            daily['return_amount'] += return_amount
            daily['cogs'] += cogs
            total_return_amount += return_amount
            total_cogs += cogs

        summarised_rows: List[Dict[str, Any]] = []
        for day in sorted(daily_totals):
            daily = daily_totals[day]
            return_amount = daily['return_amount']
            cogs = daily['cogs']
            gross_loss = return_amount - cogs
            summarised_rows.append({
                'date': day,
                'return_count': daily['return_count'],
                'return_amount': round(return_amount, 2),
                'cogs': round(cogs, 2),
                'gross_loss': round(gross_loss, 2),
                'loss_pct': round(gross_loss / return_amount * 100, 2) if return_amount else 0.0,
            })

        total_gross_loss = total_return_amount - total_cogs
        return {
            'format': 'summarised' if is_summarised else 'detailed',
            'date_range': {
                'start_date': start.strftime('%Y-%m-%d'),
                'end_date': end.strftime('%Y-%m-%d'),
            },
            'rows': summarised_rows if is_summarised else detailed_rows,
            'summary': {
                'return_count': len(detailed_rows),
                'total_return_amount': round(total_return_amount, 2),
                'total_cogs': round(total_cogs, 2),
                'total_gross_loss': round(total_gross_loss, 2),
                'loss_pct': round(total_gross_loss / total_return_amount * 100, 2)
                if total_return_amount else 0.0,
            },
        }

    # ------------------------------------------------------------------
    # Purchase registers (Marg ERP "Purchase Book" / "Purchase Return Book")
    # Columns: DATE, BILL NO., PARTY NAME, BILL AMT., TAXABLE, TAX,
    #          TAX FREE, EXEMPTED, R.OFF
    #
    # Money is accumulated as exact Decimals (docs/testing_architecture.md) and only
    # converted to JSON numbers at the output boundary.
    #
    # TAX FREE / EXEMPTED are kept for layout parity with the Marg export.
    # No product/tax-slab flag distinguishes exempt or tax-free lines in this
    # database, so they are reported as 0.00 and every line value (including
    # 0% lines) sits in TAXABLE, exactly like the Marg sample.
    # ------------------------------------------------------------------

    _PURCHASE_MONEY_KEYS = ('bill_amt', 'taxable', 'tax', 'tax_free', 'exempted', 'round_off')
    _CENT = Decimal('0.01')

    @staticmethod
    def _dec(value: Any) -> Decimal:
        """Exact Decimal from a model value (Decimal/int/str/float)."""
        return value if isinstance(value, Decimal) else Decimal(str(value or 0))

    @classmethod
    def _num(cls, value: Decimal) -> float:
        """JSON number for a money Decimal (2dp, bankers' rounding like the rest of the GST code)."""
        return float(value.quantize(cls._CENT))

    @staticmethod
    def _purchase_party_name(distributor: Any, is_cash: bool = False) -> str:
        name = (getattr(distributor, 'name', '') or '').strip() if distributor else ''
        name = name or 'URD PURCHASE'
        return f'CASH ({name})' if is_cash else name

    @classmethod
    def _new_purchase_bucket(cls) -> Dict[str, Any]:
        bucket: Dict[str, Any] = {'date': '', 'bill_count': 0, 'return_count': 0}
        bucket.update({k: Decimal('0') for k in cls._PURCHASE_MONEY_KEYS})
        return bucket

    @classmethod
    def _accumulate_purchase_bucket(cls, bucket: Dict[str, Any], row: Dict[str, Any]) -> None:
        bucket['date'] = row['date']
        bucket['return_count' if row['is_return'] else 'bill_count'] += 1
        for key in cls._PURCHASE_MONEY_KEYS:
            bucket[key] += row[key]

    @classmethod
    def _public_purchase_row(cls, row: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(row)
        for key in cls._PURCHASE_MONEY_KEYS:
            out[key] = cls._num(row[key])
        return out

    @classmethod
    def _public_purchase_bucket(cls, bucket: Dict[str, Any]) -> Dict[str, Any]:
        out = {'date': bucket['date'], 'bill_count': bucket['bill_count'], 'return_count': bucket['return_count']}
        for key in cls._PURCHASE_MONEY_KEYS:
            out[key] = cls._num(bucket[key])
        return out

    @classmethod
    def _purchase_invoice_rows(cls, outlet_id: str, start: date, end: date) -> List[Dict[str, Any]]:
        """One row per POSTED purchase invoice. Draft (SAVED) scans never reach the book."""
        invoices = PurchaseInvoice.objects.filter(
            Q(invoice_date__range=(start, end))
            | Q(invoice_date__isnull=True, created_at__date__range=(start, end)),
            outlet_id=outlet_id,
            status='POSTED',
        ).select_related('distributor')

        rows: List[Dict[str, Any]] = []
        for inv in invoices:
            inv_date = inv.invoice_date or inv.created_at.date()
            taxable = cls._dec(inv.taxable_amount)
            freight = cls._dec(inv.freight)
            tax = cls._dec(inv.gst_amount) + cls._dec(inv.cess_amount)
            round_off = cls._dec(inv.round_off)
            rows.append({
                'date': inv_date.strftime('%Y-%m-%d'),
                'bill_no': inv.invoice_no or '-',
                'party_name': cls._purchase_party_name(inv.distributor, inv.purchase_type == 'cash'),
                'gstin': (inv.distributor.gstin if inv.distributor and inv.distributor.gstin else ''),
                # grand_total is net of ledger_adjustment (a settlement such as a debit note applied
                # at payment). The book shows the bill's real value, so add it back; this also keeps
                # TAXABLE + TAX + R.OFF == BILL AMT and stops a netted debit note being deducted twice.
                'bill_amt': cls._dec(inv.grand_total) + cls._dec(inv.ledger_adjustment),
                # Freight is part of the bill value; keeping it in TAXABLE makes the columns tie out.
                'taxable': taxable + freight,
                'tax': tax,
                'tax_free': Decimal('0'),
                'exempted': Decimal('0'),
                'round_off': round_off,
                'is_return': False,
            })
        return rows

    @classmethod
    def _debit_note_rows(cls, outlet_id: str, start: date, end: date, as_negative: bool) -> List[Dict[str, Any]]:
        """One row per debit note (purchase return). Negated when netted off a purchase book."""
        notes = DebitNote.objects.filter(
            outlet_id=outlet_id,
            date__range=(start, end),
        ).select_related('distributor')

        sign = Decimal('-1') if as_negative else Decimal('1')
        rows: List[Dict[str, Any]] = []
        for note in notes:
            rows.append({
                'date': note.date.strftime('%Y-%m-%d'),
                'bill_no': note.debit_note_no,
                'party_name': cls._purchase_party_name(note.distributor),
                'gstin': (note.distributor.gstin if note.distributor and note.distributor.gstin else ''),
                'bill_amt': sign * cls._dec(note.total_amount),
                'taxable': sign * cls._dec(note.subtotal),
                'tax': sign * cls._dec(note.gst_amount),
                'tax_free': Decimal('0'),
                'exempted': Decimal('0'),
                'round_off': Decimal('0'),
                'is_return': True,
            })
        return rows

    @classmethod
    def _build_purchase_register(
        cls,
        rows: List[Dict[str, Any]],
        start: date,
        end: date,
        is_summarised: bool,
    ) -> Dict[str, Any]:
        """Sort rows, derive the daily summary and grand totals shared by both registers."""
        rows.sort(key=lambda r: (r['date'], str(r['bill_no'])))

        daily: Dict[str, Dict[str, Any]] = defaultdict(cls._new_purchase_bucket)
        totals = cls._new_purchase_bucket()
        return_amount = Decimal('0')
        for row in rows:
            cls._accumulate_purchase_bucket(daily[row['date']], row)
            cls._accumulate_purchase_bucket(totals, row)
            if row['is_return']:
                return_amount += abs(row['bill_amt'])

        summary = {f'total_{k}': cls._num(totals[k]) for k in cls._PURCHASE_MONEY_KEYS}
        summary.update({
            'bill_count': totals['bill_count'],
            'return_count': totals['return_count'],
            'return_amount': cls._num(return_amount),
        })

        return {
            'format': 'summarised' if is_summarised else 'detailed',
            'date_range': {
                'start_date': start.strftime('%Y-%m-%d'),
                'end_date': end.strftime('%Y-%m-%d'),
            },
            'rows': (
                [cls._public_purchase_bucket(daily[day]) for day in sorted(daily)]
                if is_summarised else [cls._public_purchase_row(r) for r in rows]
            ),
            'summary': summary,
        }

    @classmethod
    def get_purchase_book(
        cls,
        outlet_id: str,
        start_date: Any,
        end_date: Any,
        is_summarised: bool = False,
        less_returns: bool = False,
    ) -> Dict[str, Any]:
        """
        Purchase Book / Consolidated Purchase Book.
        Detailed: one row per posted purchase invoice (and per debit note, negated, when
                  less_returns is True).
        Summarised: rows grouped by date, with bill_count (invoices) and return_count (debit notes).
        """
        start = cls._parse_date(start_date)
        end = cls._parse_date(end_date)
        if start > end:
            start, end = end, start

        rows = cls._purchase_invoice_rows(outlet_id, start, end)
        if less_returns:
            rows += cls._debit_note_rows(outlet_id, start, end, as_negative=True)

        report = cls._build_purchase_register(rows, start, end, is_summarised)
        report['less_returns'] = less_returns
        return report

    @classmethod
    def get_purchase_return_book(
        cls,
        outlet_id: str,
        start_date: Any,
        end_date: Any,
        is_summarised: bool = False,
    ) -> Dict[str, Any]:
        """
        Purchase Return Book (Debit Note register): one row per debit note, positive values.
        Summarised: rows grouped by date (return_count per day).
        """
        start = cls._parse_date(start_date)
        end = cls._parse_date(end_date)
        if start > end:
            start, end = end, start

        rows = cls._debit_note_rows(outlet_id, start, end, as_negative=False)
        return cls._build_purchase_register(rows, start, end, is_summarised)
