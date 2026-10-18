import datetime
import io
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Sum, F, Q, FloatField, ExpressionWrapper
from django.db.models.functions import Coalesce, NullIf
from django.utils.timezone import make_aware, get_current_timezone
from django.http import HttpResponse

from apps.core.permissions import IsAuthenticated
from apps.core.models import Outlet
from apps.billing.models import SaleInvoice, SaleItem, ExpenseEntry, SalesReturn, ReceiptEntry
from apps.purchases.models import PurchaseInvoice
from apps.inventory.models import Batch
from apps.accounts.models import Partner
from apps.reports.models import DailyCashReport, FixedMonthlyExpense

def get_daily_snapshot_data(outlet_id, start_date_str, end_date_str=None):
    if not end_date_str:
        end_date_str = start_date_str
        
    start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
    end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
        
    start_dt = make_aware(datetime.datetime.combine(start_date, datetime.time.min))
    end_dt = make_aware(datetime.datetime.combine(end_date, datetime.time.max))

    # --- Opening Cash ---
    is_single_day = start_date == end_date
    cash_state = None
    def _get_prev_opening_cash(target_date):
        prev_reports = DailyCashReport.objects.filter(
            outlet_id=outlet_id, 
            date__lt=target_date
        ).order_by('-date')[:5]
        for prev_report in prev_reports:
            if float(prev_report.next_day_opening) > 0:
                return float(prev_report.next_day_opening)
            if float(prev_report.actual_cash) > 0:
                return float(prev_report.actual_cash)
            if float(prev_report.opening_cash) > 0:
                return float(prev_report.opening_cash)
        return 0.0

    if is_single_day:
        cash_state, _ = DailyCashReport.objects.get_or_create(outlet_id=outlet_id, date=start_date)
        opening_cash = float(cash_state.opening_cash)
        if opening_cash == 0.0:
            opening_cash = _get_prev_opening_cash(start_date)
        carton_sale_manual = float(cash_state.carton_sale)
    else:
        first_report = DailyCashReport.objects.filter(outlet_id=outlet_id, date=start_date).first()
        opening_cash = float(first_report.opening_cash) if first_report else 0.0
        if opening_cash == 0.0:
            opening_cash = _get_prev_opening_cash(start_date)
        cash_reports = DailyCashReport.objects.filter(outlet_id=outlet_id, date__range=(start_date, end_date))
        carton_sale_manual = float(cash_reports.aggregate(total=Sum('carton_sale'))['total'] or 0.0)
        cash_state = DailyCashReport.objects.filter(outlet_id=outlet_id, date=end_date).first()
        if not cash_state:
            cash_state = DailyCashReport.objects.filter(outlet_id=outlet_id, date__lte=end_date).order_by('-date').first()

    # --- Sales & Detailed Payment Split Breakdown ---
    sales = SaleInvoice.objects.filter(outlet_id=outlet_id, invoice_date__range=(start_dt, end_dt), is_cancelled=False).select_related('customer').order_by('invoice_date')
    total_sales = 0.0
    total_credit_sales = 0.0
    total_upi_sales = 0.0
    total_card_sales = 0.0
    total_cash_sales = 0.0

    gross_sales_items = []
    credit_sales_items = []
    upi_sales_items = []
    card_sales_items = []

    for s in sales:
        gt = float(s.grand_total)
        total_sales += gt

        # Extract payment splits properly even for split/mixed payments
        if s.payment_mode == 'split' or s.cash_paid > 0 or s.upi_paid > 0 or s.card_paid > 0 or s.credit_given > 0:
            c_amt = float(s.cash_paid)
            u_amt = float(s.upi_paid)
            cd_amt = float(s.card_paid)
            cr_amt = float(s.credit_given)
        elif s.payment_mode == 'upi':
            c_amt, u_amt, cd_amt, cr_amt = 0.0, gt, 0.0, 0.0
        elif s.payment_mode == 'card':
            c_amt, u_amt, cd_amt, cr_amt = 0.0, 0.0, gt, 0.0
        elif s.payment_mode == 'credit':
            c_amt, u_amt, cd_amt, cr_amt = 0.0, 0.0, 0.0, gt
        else:
            c_amt, u_amt, cd_amt, cr_amt = gt, 0.0, 0.0, 0.0

        total_cash_sales += c_amt
        total_credit_sales += cr_amt
        total_upi_sales += u_amt
        total_card_sales += cd_amt

        cust_name = s.customer.name if s.customer else 'Walk-in Customer'
        dt_str = s.invoice_date.strftime("%d-%m-%Y %I:%M %p")

        gross_sales_items.append({
            'id': str(s.id),
            'no': s.invoice_no,
            'date': dt_str,
            'customer': cust_name,
            'paymentMode': s.payment_mode,
            'grandTotal': round(gt, 2),
            'cashAmt': round(c_amt, 2),
            'upiAmt': round(u_amt, 2),
            'cardAmt': round(cd_amt, 2),
            'creditAmt': round(cr_amt, 2),
            'link': f'/billing/{s.id}',
        })

        if cr_amt > 0:
            credit_sales_items.append({
                'id': str(s.id),
                'no': s.invoice_no,
                'date': dt_str,
                'customer': cust_name,
                'amount': round(cr_amt, 2),
                'grandTotal': round(gt, 2),
                'link': f'/billing/{s.id}',
            })
        if u_amt > 0:
            upi_sales_items.append({
                'id': str(s.id),
                'no': s.invoice_no,
                'date': dt_str,
                'customer': cust_name,
                'amount': round(u_amt, 2),
                'grandTotal': round(gt, 2),
                'link': f'/billing/{s.id}',
            })
        if cd_amt > 0:
            card_sales_items.append({
                'id': str(s.id),
                'no': s.invoice_no,
                'date': dt_str,
                'customer': cust_name,
                'amount': round(cd_amt, 2),
                'grandTotal': round(gt, 2),
                'link': f'/billing/{s.id}',
            })

    # Cumulative Sale Upto
    sale_upto = float(SaleInvoice.objects.filter(outlet_id=outlet_id, invoice_date__lte=end_dt, is_cancelled=False).aggregate(total=Sum('grand_total'))['total'] or 0.0)

    # Returns
    returns = SalesReturn.objects.filter(outlet_id=outlet_id, return_date__range=(start_date, end_date)).select_related('original_sale__customer').order_by('return_date')
    total_returns = float(returns.aggregate(total=Sum('total_amount'))['total'] or 0.0)
    sales_return_items = [
        {
            'id': str(r.id),
            'no': r.return_no or f'RET-{r.id}',
            'date': r.return_date.strftime("%d-%m-%Y"),
            'customer': r.original_sale.customer.name if (r.original_sale and r.original_sale.customer) else 'Walk-in',
            'amount': round(float(r.total_amount), 2),
            'link': f'/dashboard/accounts/sale-returns/{r.id}/edit',
        }
        for r in returns
    ]
    net_sales = total_sales - total_returns

    # Customer Jama (POS Receipts in Cash)
    jama_manual = float(ReceiptEntry.objects.filter(outlet_id=outlet_id, date__range=(start_date, end_date), payment_mode='cash').aggregate(total=Sum('total_amount'))['total'] or 0.0)

    # COGS
    sale_items = SaleItem.objects.filter(invoice__in=sales)
    cogs = float(sale_items.aggregate(
        total=Sum(
            ExpressionWrapper(
                (F('qty_strips') * Coalesce(NullIf(F('pack_size'), 0), 1) + F('qty_loose')) * 
                (F('batch__purchase_rate') / Coalesce(NullIf(F('pack_size'), 0), 1)),
                output_field=FloatField()
            )
        )
    )['total'] or 0.0)
    gross_profit = net_sales - cogs

    # --- Purchases ---
    purchases = PurchaseInvoice.objects.filter(outlet_id=outlet_id, invoice_date__range=(start_date, end_date))
    total_purchases = float(purchases.aggregate(total=Sum('grand_total'))['total'] or 0.0)
    cumulative_purchase = float(PurchaseInvoice.objects.filter(outlet_id=outlet_id, invoice_date__lte=end_date).aggregate(total=Sum('grand_total'))['total'] or 0.0)

    # Cash Purchases (purchase_type == 'cash')
    cash_purchases_qs = PurchaseInvoice.objects.filter(
        outlet_id=outlet_id,
        invoice_date__range=(start_date, end_date),
        purchase_type='cash'
    ).select_related('distributor').order_by('invoice_date')
    total_cash_purchases = float(sum(p.grand_total for p in cash_purchases_qs))
    cash_purchase_items = [
        {
            'id': str(p.id),
            'no': p.invoice_no,
            'date': p.invoice_date.strftime("%d-%m-%Y") if p.invoice_date else '',
            'distributor': p.distributor.name if p.distributor else 'Direct Purchase',
            'amount': round(float(p.grand_total), 2),
            'link': f'/dashboard/purchases/revisions/{p.id}',
        }
        for p in cash_purchases_qs
    ]

    # --- Stock Value ---
    batches = Batch.objects.filter(outlet_id=outlet_id, is_active=True, qty_strips__gt=0)
    stock_value = float(batches.aggregate(
        total=Sum(
            ExpressionWrapper(
                F('qty_strips') * F('purchase_rate') + 
                F('qty_loose') * (F('purchase_rate') / Coalesce(NullIf(F('pack_size'), 0), 1)),
                output_field=FloatField()
            )
        )
    )['total'] or 0.0)

    # --- Bills ---
    first_bill = sales.order_by('invoice_no').first()
    last_bill = sales.order_by('-invoice_no').first()

    # --- Vouchers: Strict Cash Portion Logic ---
    from apps.accounts.models import Voucher, VoucherLine

    vouchers = Voucher.objects.filter(
        outlet_id=outlet_id,
        date__range=(start_date, end_date),
        status='posted'
    ).prefetch_related('lines__ledger__group').order_by('date', 'created_at')

    cash_expenses = 0.0
    cash_payments = 0.0
    cash_received = 0.0
    cash_income = 0.0

    cash_expense_items = []
    cash_payment_items = []
    cash_received_items = []
    cash_income_items = []

    def is_cash_line(line):
        if not line or not line.ledger:
            return False
        grp = (line.ledger.group.name if line.ledger.group else '').lower().replace('-', ' ')
        return grp == 'cash in hand' or line.ledger.name.strip().lower() == 'cash'

    for v in vouchers:
        lines = list(v.lines.all())
        cash_cr_lines = [l for l in lines if is_cash_line(l) and l.credit > 0]
        cash_dr_lines = [l for l in lines if is_cash_line(l) and l.debit > 0]

        # Cash Paid OUT (Payment voucher crediting Cash in Hand)
        if cash_cr_lines and v.voucher_type == 'payment':
            cash_out_amt = float(sum(l.credit for l in cash_cr_lines))
            dr_lines = [l for l in lines if l.debit > 0 and not is_cash_line(l)]
            total_dr = float(sum(d.debit for d in dr_lines))

            for dl in dr_lines:
                dr_amt = float(dl.debit)
                portion = cash_out_amt * (dr_amt / total_dr) if total_dr > 0 else dr_amt
                grp_name = dl.ledger.group.name if dl.ledger.group else ''
                nature = dl.ledger.group.nature if dl.ledger.group else ''

                item_record = {
                    'id': str(v.id),
                    'no': v.voucher_no,
                    'date': v.date.strftime("%d-%m-%Y"),
                    'ledger': dl.ledger.name,
                    'group': grp_name,
                    'narration': v.narration or '',
                    'amount': round(portion, 2),
                    'totalVoucherAmount': round(float(v.total_amount), 2),
                    'link': f'/dashboard/accounts/voucher-entry?editId={v.id}',
                }

                if 'Expense' in grp_name or nature == 'expense':
                    cash_expenses += portion
                    cash_expense_items.append(item_record)
                else:
                    cash_payments += portion
                    cash_payment_items.append(item_record)

        # Cash Received IN (Receipt voucher debiting Cash in Hand)
        if cash_dr_lines and v.voucher_type == 'receipt':
            cash_in_amt = float(sum(l.debit for l in cash_dr_lines))
            cr_lines = [l for l in lines if l.credit > 0 and not is_cash_line(l)]
            total_cr = float(sum(c.credit for c in cr_lines))

            for cl in cr_lines:
                cr_amt = float(cl.credit)
                portion = cash_in_amt * (cr_amt / total_cr) if total_cr > 0 else cr_amt
                grp_name = cl.ledger.group.name if cl.ledger.group else ''
                nature = cl.ledger.group.nature if cl.ledger.group else ''

                item_record = {
                    'id': str(v.id),
                    'no': v.voucher_no,
                    'date': v.date.strftime("%d-%m-%Y"),
                    'ledger': cl.ledger.name,
                    'group': grp_name,
                    'narration': v.narration or '',
                    'amount': round(portion, 2),
                    'totalVoucherAmount': round(float(v.total_amount), 2),
                    'link': f'/dashboard/accounts/voucher-entry?editId={v.id}',
                }

                if 'Income' in grp_name or nature == 'income':
                    cash_income += portion
                    cash_income_items.append(item_record)
                else:
                    cash_received += portion
                    cash_received_items.append(item_record)

    # Legacy POS receipts & manual carton sale
    if jama_manual > 0:
        cash_received += jama_manual
        cash_received_items.append({
            'id': 'manual_pos',
            'no': 'POS Receipt',
            'date': start_date.strftime("%d-%m-%Y"),
            'ledger': 'Customer Jama (POS)',
            'group': 'Sundry Debtors',
            'narration': 'Cash received at POS',
            'amount': round(jama_manual, 2),
            'totalVoucherAmount': round(jama_manual, 2),
            'link': '',
        })

    if carton_sale_manual > 0:
        cash_income += carton_sale_manual
        cash_income_items.append({
            'id': 'manual_carton',
            'no': 'Manual Entry',
            'date': start_date.strftime("%d-%m-%Y"),
            'ledger': 'Carton Sale (Manual)',
            'group': 'Direct Incomes',
            'narration': 'Daily till carton sale',
            'amount': round(carton_sale_manual, 2),
            'totalVoucherAmount': round(carton_sale_manual, 2),
            'link': '',
        })

    # --- Fixed Monthly Expense ---
    fixed_exp, _ = FixedMonthlyExpense.objects.get_or_create(outlet_id=outlet_id)

    # ── Strict Formula for End-of-Day Required Cash ──
    # Opening Cash + Gross Sales - Sales Return - Credit Sale - UPI - Cards - Cash Expenses - Cash Payments - Cash Purchases + Cash Received + Cash Income
    cash_required = (
        opening_cash
        + total_sales
        - total_returns
        - total_credit_sales
        - total_upi_sales
        - total_card_sales
        - cash_expenses
        - cash_payments
        - total_cash_purchases
        + cash_received
        + cash_income
    )

    if cash_state:
        actual_cash = float(cash_state.actual_cash)
        extra_short = round(actual_cash - cash_required, 2)
    else:
        actual_cash = 0.0
        extra_short = 0.0
    
    days_in_range = (end_date - start_date).days + 1
    total_fixed_expense_for_period = float(fixed_exp.per_day) * days_in_range
    net_profit = gross_profit - total_fixed_expense_for_period

    # --- Historical Partners ---
    # We need to calculate partner splits day by day to accurately reflect historical percentages
    partner_totals = {}
    from apps.accounts.models import Partner, PartnerShareHistory
    
    # Get all partners ever
    all_partners = Partner.objects.filter(outlet_id=outlet_id)
    for p in all_partners:
        partner_totals[p.id] = {'name': p.name, 'shareAmount': 0.0, 'current_percentage': 0.0}
        
    current_date = start_date
    while current_date <= end_date:
        # Calculate daily net profit for this specific day
        d_start = make_aware(datetime.datetime.combine(current_date, datetime.time.min))
        d_end = make_aware(datetime.datetime.combine(current_date, datetime.time.max))
        
        d_sales_qs = SaleInvoice.objects.filter(outlet_id=outlet_id, invoice_date__range=(d_start, d_end), is_cancelled=False)
        d_sales = float(d_sales_qs.aggregate(total=Sum('grand_total'))['total'] or 0.0)
        d_returns = float(SalesReturn.objects.filter(outlet_id=outlet_id, return_date=current_date).aggregate(total=Sum('total_amount'))['total'] or 0.0)
        
        d_net_sales = d_sales - d_returns
        
        d_cogs = 0.0
        d_sale_items = SaleItem.objects.filter(invoice__in=d_sales_qs)
        for item in d_sale_items:
            pack_size = item.pack_size or 1
            total_loose = (item.qty_strips * pack_size) + item.qty_loose
            if pack_size > 0:
                d_cogs += float(item.batch.purchase_rate / pack_size) * total_loose
                
        d_gross_profit = d_net_sales - d_cogs
        d_net_profit = d_gross_profit - float(fixed_exp.per_day)
        
        # Look up partner percentages for this day from history
        for p in all_partners:
            # Find history record valid on current_date
            history = PartnerShareHistory.objects.filter(
                partner=p,
                start_date__lte=current_date
            ).exclude(end_date__lt=current_date).first()
            
            percentage = float(history.profit_percentage) if history else float(p.profit_percentage)
            
            if current_date == end_date:
                partner_totals[p.id]['current_percentage'] = percentage
                
            partner_totals[p.id]['shareAmount'] += (percentage / 100.0) * d_net_profit
            
        current_date += datetime.timedelta(days=1)
        
    partners_list = []
    # Only include partners who are active, or had some share amount
    for p_id, p_data in partner_totals.items():
        if p_data['current_percentage'] > 0 or p_data['shareAmount'] != 0:
            partners_list.append({
                'name': p_data['name'],
                'percentage': p_data['current_percentage'],
                'shareAmount': round(p_data['shareAmount'], 2)
            })
    
    # Sort partners by name
    partners_list.sort(key=lambda x: x['name'])

    return {
        'date': f"{start_date_str} to {end_date_str}" if start_date_str != end_date_str else start_date_str,
        'startDate': start_date_str,
        'endDate': end_date_str,
        'isSingleDay': is_single_day,
        'financials': {
            'grossProfit': round(gross_profit, 2),
            'netProfit': round(net_profit, 2),
            'totalSales': total_sales,
            'saleUpto': sale_upto,
            'cumulativePurchase': cumulative_purchase,
            'stockValue': round(stock_value, 2),
        },
        'salesBreakdown': {
            'openingCash': round(opening_cash, 2),
            'grossSales': round(total_sales, 2),
            'saleReturn': round(total_returns, 2),
            'creditSale': round(total_credit_sales, 2),
            'upi': round(total_upi_sales, 2),
            'phonePay': round(total_upi_sales, 2),
            'card': round(total_card_sales, 2),
            'cashExpenses': round(cash_expenses, 2),
            'expenses': round(cash_expenses, 2),
            'cashPayments': round(cash_payments, 2),
            'cashPurchases': round(total_cash_purchases, 2),
            'cashReceived': round(cash_received, 2),
            'customerJama': round(cash_received, 2),
            'cashIncome': round(cash_income, 2),
            'cartonSale': round(cash_income, 2),
            'cashRequired': round(cash_required, 2),
            'actualCash': round(actual_cash, 2),
            'extraShort': round(extra_short, 2),
            'details': {
                'grossSales': gross_sales_items,
                'saleReturn': sales_return_items,
                'creditSale': credit_sales_items,
                'upi': upi_sales_items,
                'card': card_sales_items,
                'cashExpenses': cash_expense_items,
                'cashPayments': cash_payment_items,
                'cashPurchases': cash_purchase_items,
                'cashReceived': cash_received_items,
                'cashIncome': cash_income_items,
            }
        },
        'cashState': {
            'openingCash': round(opening_cash, 2),
            'notes2000': cash_state.notes_2000 if cash_state else 0,
            'notes500': cash_state.notes_500 if cash_state else 0,
            'notes200': cash_state.notes_200 if cash_state else 0,
            'notes100': cash_state.notes_100 if cash_state else 0,
            'notes50': cash_state.notes_50 if cash_state else 0,
            'notes20': cash_state.notes_20 if cash_state else 0,
            'notes10': cash_state.notes_10 if cash_state else 0,
            'pettyCashExp': round(cash_expenses, 2),
            'sideCash': float(cash_state.side_cash) if cash_state else 0.0,
            'nextDayOpening': float(cash_state.next_day_opening) if cash_state else 0.0,
        },
        'fixedExpenses': {
            'salary': float(fixed_exp.salary),
            'rent': float(fixed_exp.rent),
            'transport': float(fixed_exp.transport),
            'petrol': float(fixed_exp.petrol),
            'light': float(fixed_exp.light),
            'water': float(fixed_exp.water),
            'internet': float(fixed_exp.internet),
            'stationery': float(fixed_exp.stationery),
            'intOnCc': float(fixed_exp.int_on_cc),
            'incomeTax': float(fixed_exp.income_tax),
            'caFees': float(fixed_exp.ca_fees),
            'godown': float(fixed_exp.godown),
            'other': float(fixed_exp.other),
            'totalMonthly': float(fixed_exp.total_monthly),
            'daysInMonth': fixed_exp.days_in_month,
            'perDay': float(fixed_exp.per_day),
        },
        'bills': {
            'first': first_bill.invoice_no if first_bill else 'N/A',
            'last': last_bill.invoice_no if last_bill else 'N/A'
        },
        'partners': partners_list
    }


class DailySnapshotView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        start_date_str = request.query_params.get('startDate')
        end_date_str = request.query_params.get('endDate')
        
        if not start_date_str:
            # Fallback to 'date' param for backwards compatibility
            start_date_str = request.query_params.get('date', datetime.date.today().strftime("%Y-%m-%d"))
        if not end_date_str:
            end_date_str = start_date_str
            
        if not outlet_id: return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(get_daily_snapshot_data(outlet_id, start_date_str, end_date_str), status=status.HTTP_200_OK)


class DailyCashReportView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        date_str = request.data.get('date')
        if not outlet_id or not date_str: return Response(status=status.HTTP_400_BAD_REQUEST)
        
        cash_state, _ = DailyCashReport.objects.get_or_create(outlet_id=outlet_id, date=date_str)
        cash_state.notes_2000 = request.data.get('notes2000', cash_state.notes_2000)
        cash_state.notes_500 = request.data.get('notes500', cash_state.notes_500)
        cash_state.notes_200 = request.data.get('notes200', cash_state.notes_200)
        cash_state.notes_100 = request.data.get('notes100', cash_state.notes_100)
        cash_state.notes_50 = request.data.get('notes50', cash_state.notes_50)
        cash_state.notes_20 = request.data.get('notes20', cash_state.notes_20)
        cash_state.notes_10 = request.data.get('notes10', cash_state.notes_10)
        cash_state.side_cash = request.data.get('sideCash', cash_state.side_cash)
        cash_state.next_day_opening = request.data.get('nextDayOpening', cash_state.next_day_opening)
        if 'openingCash' in request.data:
            cash_state.opening_cash = request.data.get('openingCash')
        if 'cartonSale' in request.data:
            cash_state.carton_sale = request.data.get('cartonSale')
        cash_state.updated_by = request.user
        cash_state.save()
        
        return Response({'status': 'ok'})


class FixedMonthlyExpenseView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId')
        if not outlet_id: return Response(status=status.HTTP_400_BAD_REQUEST)
        
        fixed_exp, _ = FixedMonthlyExpense.objects.get_or_create(outlet_id=outlet_id)
        fixed_exp.salary = request.data.get('salary', fixed_exp.salary)
        fixed_exp.rent = request.data.get('rent', fixed_exp.rent)
        fixed_exp.transport = request.data.get('transport', fixed_exp.transport)
        fixed_exp.petrol = request.data.get('petrol', fixed_exp.petrol)
        fixed_exp.light = request.data.get('light', fixed_exp.light)
        fixed_exp.water = request.data.get('water', fixed_exp.water)
        fixed_exp.internet = request.data.get('internet', fixed_exp.internet)
        fixed_exp.stationery = request.data.get('stationery', fixed_exp.stationery)
        fixed_exp.int_on_cc = request.data.get('intOnCc', fixed_exp.int_on_cc)
        fixed_exp.income_tax = request.data.get('incomeTax', fixed_exp.income_tax)
        fixed_exp.ca_fees = request.data.get('caFees', fixed_exp.ca_fees)
        fixed_exp.godown = request.data.get('godown', fixed_exp.godown)
        fixed_exp.other = request.data.get('other', fixed_exp.other)
        fixed_exp.days_in_month = request.data.get('daysInMonth', fixed_exp.days_in_month)
        fixed_exp.updated_by = request.user
        fixed_exp.save()
        
        return Response({'status': 'ok'})

class DailySnapshotExportView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        start_date_str = request.query_params.get('startDate')
        end_date_str = request.query_params.get('endDate')
        
        if not start_date_str:
            start_date_str = request.query_params.get('date', datetime.date.today().strftime("%Y-%m-%d"))
        if not end_date_str:
            end_date_str = start_date_str
            
        if not outlet_id: return Response({'detail': 'outletId required'}, status=status.HTTP_400_BAD_REQUEST)
        
        data = get_daily_snapshot_data(outlet_id, start_date_str, end_date_str)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = f"Report {data['date'].replace(' to ', '_')}"

        # Styles
        header_font = Font(bold=True)
        bold_font = Font(bold=True)
        center_align = Alignment(horizontal="center", vertical="center")
        right_align = Alignment(horizontal="right")
        
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
        yellow_fill = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
        blue_fill = PatternFill(start_color="C9DAF8", end_color="C9DAF8", fill_type="solid")
        
        def style_cell(cell, font=None, fill=None, align=None, border=thin_border):
            if font: cell.font = font
            if fill: cell.fill = fill
            if align: cell.alignment = align
            if border: cell.border = border
            
        # Top Header
        ws.merge_cells('B1:D1')
        ws['B1'] = "DAILY REPORTING"
        style_cell(ws['B1'], font=bold_font, align=center_align)

        # Row 2 (GP / EXP / NP)
        ws['A2'] = "GROSS PROFIT"; ws['B2'] = "EXPENSES"; ws['C2'] = "NET PROFIT"; ws['D2'] = "DATE"; ws['E2'] = data['date']
        ws['A3'] = data['financials']['grossProfit']; ws['B3'] = data['fixedExpenses']['pettyCashExp'] if 'pettyCashExp' in data['fixedExpenses'] else data['salesBreakdown']['expenses']; ws['C3'] = data['financials']['netProfit']
        
        # Partners Row 4 & 5
        col = 'A'
        for p in data['partners']:
            ws[f'{col}4'] = f"{p['name']} {p['percentage']}%"
            ws[f'{col}5'] = p['shareAmount']
            col = chr(ord(col) + 1)
            
        ws['D4'] = "FIRST BILL NO"; ws['E4'] = data['bills']['first']
        ws['D5'] = "LAST BILL NO"; ws['E5'] = data['bills']['last']
        
        # Row 6 (Purchase, Stock, Sale Upto)
        ws['A6'] = "PURCHASE"; ws['B6'] = "STOCK"; ws['C6'] = "SALE UPTO"; ws['D6'] = "SALE"; ws['E6'] = data['financials']['totalSales']
        ws['A7'] = data['financials']['cumulativePurchase']; ws['B7'] = data['financials']['stockValue']; ws['C7'] = data['financials']['saleUpto']
        
        # Style A2:E7 block
        for r in range(2, 8):
            for c in ['A','B','C','D','E']:
                style_cell(ws[f'{c}{r}'], font=bold_font)
        
        # Cash Denominations (A10:C17)
        ws['A9'] = "CASH"; ws.merge_cells('A9:C9'); style_cell(ws['A9'], font=bold_font, fill=yellow_fill, align=center_align)
        denoms = [(10, data['cashState']['notes10']), (20, data['cashState']['notes20']), (50, data['cashState']['notes50']), 
                 (100, data['cashState']['notes100']), (200, data['cashState']['notes200']), (500, data['cashState']['notes500']), 
                 (2000, data['cashState']['notes2000'])]
        r = 10
        for d in denoms:
            ws[f'A{r}'] = d[0]; ws[f'B{r}'] = d[1]; ws[f'C{r}'] = d[0]*d[1]
            style_cell(ws[f'A{r}']); style_cell(ws[f'B{r}']); style_cell(ws[f'C{r}'])
            r += 1
        
        ws[f'A{r}'] = "TOTAL"; ws.merge_cells(f'A{r}:B{r}'); ws[f'C{r}'] = data['salesBreakdown']['actualCash']
        style_cell(ws[f'A{r}'], font=bold_font, fill=yellow_fill, align=center_align); style_cell(ws[f'C{r}'], fill=yellow_fill)
        
        r += 1
        ws[f'A{r}'] = "PETTY CASH EXP"; ws.merge_cells(f'A{r}:B{r}'); ws[f'C{r}'] = data['cashState']['pettyCashExp']; style_cell(ws[f'A{r}']); style_cell(ws[f'C{r}'])
        r += 1
        ws[f'A{r}'] = "PETTY CASH PROFIT"; ws.merge_cells(f'A{r}:B{r}'); ws[f'C{r}'] = data['financials']['netProfit']; style_cell(ws[f'A{r}']); style_cell(ws[f'C{r}'])
        r += 1
        ws[f'A{r}'] = "SIDE CASH"; ws.merge_cells(f'A{r}:B{r}'); ws[f'C{r}'] = data['cashState']['sideCash']; style_cell(ws[f'A{r}']); style_cell(ws[f'C{r}'])
        r += 1
        ws[f'A{r}'] = "NEXT DAY OPENING"; ws.merge_cells(f'A{r}:B{r}'); ws[f'C{r}'] = data['cashState']['nextDayOpening']; style_cell(ws[f'A{r}']); style_cell(ws[f'C{r}'])
        r += 1
        ws[f'A{r}'] = "TOTAL"; ws.merge_cells(f'A{r}:B{r}'); ws[f'C{r}'] = data['salesBreakdown']['actualCash']; style_cell(ws[f'A{r}']); style_cell(ws[f'C{r}'])
        
        # Sales Breakdown (D8:E22)
        sb_rows = [
            ("OPENING CASH", data['salesBreakdown']['openingCash'], None),
            ("GROSS SALES", data['salesBreakdown']['grossSales'], None),
            ("(-)SALE RETURN", data['salesBreakdown']['saleReturn'], None),
            ("(-)CREDIT SALE", data['salesBreakdown']['creditSale'], "FF0000"),
            ("(-)PHONEPAY / UPI", data['salesBreakdown']['upi'], None),
            ("(-)CARD", data['salesBreakdown']['card'], None),
            ("(-) CASH EXPENSES", data['salesBreakdown']['cashExpenses'], "FF0000"),
            ("(-) CASH PAYMENTS", data['salesBreakdown']['cashPayments'], "FF0000"),
            ("(-) CASH PURCHASES", data['salesBreakdown']['cashPurchases'], "FF0000"),
            ("(+) CASH RECEIVED", data['salesBreakdown']['cashReceived'], "FF0000"),
            ("(+) CASH INCOME", data['salesBreakdown']['cashIncome'], None),
            ("CASH REQUIRED", data['salesBreakdown']['cashRequired'], "FFFF00"),
            ("ACTUAL CASH", data['salesBreakdown']['actualCash'], "FFFF00"),
            ("(+EXTRA)(-SHORT)", data['salesBreakdown']['extraShort'], "C9DAF8"),
        ]
        
        sr = 8
        for title, val, color in sb_rows:
            if title is not None:
                ws[f'D{sr}'] = title
                ws[f'E{sr}'] = val
            fill = PatternFill(start_color=color, end_color=color, fill_type="solid") if color else None
            font = Font(color="FF0000", bold=True) if color == "FF0000" and title else bold_font
            
            style_cell(ws[f'D{sr}'], font=font, fill=fill)
            style_cell(ws[f'E{sr}'], fill=fill)
            sr += 1
            
        # Expenses Breakdown (G2:H16)
        ws.merge_cells('G1:H1'); ws['G1'] = "EXPENSES"; style_cell(ws['G1'], font=bold_font, align=center_align)
        
        exps = [
            ("SALARY", data['fixedExpenses']['salary']),
            ("RENT", data['fixedExpenses']['rent']),
            ("TRANSPORT", data['fixedExpenses']['transport']),
            ("PETROL", data['fixedExpenses']['petrol']),
            ("LIGHT", data['fixedExpenses']['light']),
            ("WATER", data['fixedExpenses']['water']),
            ("INTERNET", data['fixedExpenses']['internet']),
            ("STATIONERY", data['fixedExpenses']['stationery']),
            ("INT ON CC", data['fixedExpenses']['intOnCc']),
            ("INCOME TAX", data['fixedExpenses']['incomeTax']),
            ("CA FEES", data['fixedExpenses']['caFees']),
            ("GODOWN", data['fixedExpenses']['godown']),
            ("OTHER", data['fixedExpenses']['other']),
            ("TOTAL MONTHLY", data['fixedExpenses']['totalMonthly']),
            ("DAY IN MONTH", data['fixedExpenses']['daysInMonth']),
            ("PER DAY", data['fixedExpenses']['perDay']),
        ]
        er = 2
        for title, val in exps:
            ws[f'G{er}'] = title; ws[f'H{er}'] = val
            is_bold = "TOTAL" in title or "DAY" in title
            style_cell(ws[f'G{er}'], font=bold_font if is_bold else None)
            style_cell(ws[f'H{er}'], font=bold_font if is_bold else None)
            er += 1
            
        # Column width adj
        ws.column_dimensions['A'].width = 15; ws.column_dimensions['B'].width = 12; ws.column_dimensions['C'].width = 15
        ws.column_dimensions['D'].width = 25; ws.column_dimensions['E'].width = 15
        ws.column_dimensions['F'].width = 3
        ws.column_dimensions['G'].width = 18; ws.column_dimensions['H'].width = 15

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        response = HttpResponse(buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        filename = f'Daily_Report_{start_date_str}.xlsx' if start_date_str == end_date_str else f'Daily_Report_{start_date_str}_to_{end_date_str}.xlsx'
        response['Content-Disposition'] = f'attachment; filename={filename}'
        return response
