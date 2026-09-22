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

    # --- Sales & Breakdown ---
    sales = SaleInvoice.objects.filter(outlet_id=outlet_id, invoice_date__range=(start_dt, end_dt), is_cancelled=False)
    total_sales = float(sales.aggregate(total=Sum('grand_total'))['total'] or 0.0)
    
    # Cumulative Sale Upto (End of the range)
    sale_upto = float(SaleInvoice.objects.filter(outlet_id=outlet_id, invoice_date__lte=end_dt, is_cancelled=False).aggregate(total=Sum('grand_total'))['total'] or 0.0)

    # Breakdowns by payment mode
    phonepay_sales = float(sales.filter(payment_mode='upi').aggregate(total=Sum('grand_total'))['total'] or 0.0)
    card_sales = float(sales.filter(payment_mode='card').aggregate(total=Sum('grand_total'))['total'] or 0.0)
    credit_sales = float(sales.filter(payment_mode='credit').aggregate(total=Sum('grand_total'))['total'] or 0.0)
    
    # Returns
    returns = SalesReturn.objects.filter(outlet_id=outlet_id, return_date__range=(start_date, end_date))
    total_returns = float(returns.aggregate(total=Sum('total_amount'))['total'] or 0.0)
    net_sales = total_sales - total_returns

    # Customer Jama (Receipts in Cash)
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
    # Purchases in range
    purchases = PurchaseInvoice.objects.filter(outlet_id=outlet_id, invoice_date__range=(start_date, end_date))
    total_purchases = float(purchases.aggregate(total=Sum('grand_total'))['total'] or 0.0)
    # Cumulative Purchase
    cumulative_purchase = float(PurchaseInvoice.objects.filter(outlet_id=outlet_id, invoice_date__lte=end_date).aggregate(total=Sum('grand_total'))['total'] or 0.0)

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
    
    # --- Cash Report State (Only makes sense for a single day, but we sum up petty cash for reconciliation if single day) ---
    is_single_day = start_date == end_date
    cash_state = None
    if is_single_day:
        cash_state, _ = DailyCashReport.objects.get_or_create(outlet_id=outlet_id, date=start_date)
        petty_cash_exp_manual = float(cash_state.petty_cash_exp)
        carton_sale_manual = float(cash_state.carton_sale)
    else:
        # Sum petty cash and carton sale over the period for math
        cash_reports = DailyCashReport.objects.filter(outlet_id=outlet_id, date__range=(start_date, end_date))
        petty_cash_exp_manual = float(cash_reports.aggregate(total=Sum('petty_cash_exp'))['total'] or 0.0)
        carton_sale_manual = float(cash_reports.aggregate(total=Sum('carton_sale'))['total'] or 0.0)
        
    # --- Ledger Entries (Vouchers) ---
    from apps.accounts.models import Voucher, VoucherLine
    
    # 1. Ledger Expenses (All Cash Payments)
    cash_payments = Voucher.objects.filter(
        outlet_id=outlet_id, 
        date__range=(start_date, end_date), 
        voucher_type='payment', 
        payment_mode='cash',
        status='posted'
    )
    ledger_expenses = float(cash_payments.aggregate(total=Sum('total_amount'))['total'] or 0.0)

    # 2. Ledger Customer Jama (Cash Receipts crediting a Sundry Debtors ledger)
    jama_qs = VoucherLine.objects.filter(
        voucher__outlet_id=outlet_id,
        voucher__date__range=(start_date, end_date),
        voucher__voucher_type='receipt',
        voucher__payment_mode='cash',
        voucher__status='posted',
        ledger__group__name='Sundry Debtors',
        credit__gt=0
    )
    ledger_jama = float(jama_qs.aggregate(total=Sum('credit'))['total'] or 0.0)

    # 3. Ledger Carton Sale (Cash Receipts crediting an Income ledger)
    carton_qs = VoucherLine.objects.filter(
        voucher__outlet_id=outlet_id,
        voucher__date__range=(start_date, end_date),
        voucher__voucher_type='receipt',
        voucher__payment_mode='cash',
        voucher__status='posted',
        ledger__group__nature='income',
        credit__gt=0
    )
    ledger_carton_sale = float(carton_qs.aggregate(total=Sum('credit'))['total'] or 0.0)
    
    # Combine Manual + Ledger
    petty_cash_exp = petty_cash_exp_manual + ledger_expenses
    carton_sale = carton_sale_manual + ledger_carton_sale
    jama = jama_manual + ledger_jama
    
    # --- Fixed Monthly Expense ---
    fixed_exp, _ = FixedMonthlyExpense.objects.get_or_create(outlet_id=outlet_id)
    
    # Math
    cash_required = total_sales - total_returns - credit_sales - phonepay_sales - card_sales - petty_cash_exp + jama + carton_sale
    
    if is_single_day:
        actual_cash = float(cash_state.actual_cash)
        extra_short = actual_cash - cash_required
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
            'saleReturn': total_returns,
            'creditSale': credit_sales,
            'phonePay': phonepay_sales,
            'card': card_sales,
            'expenses': petty_cash_exp,
            'customerJama': jama,
            'cartonSale': carton_sale,
            'cashRequired': round(cash_required, 2),
            'actualCash': round(actual_cash, 2),
            'extraShort': round(extra_short, 2),
        },
        'cashState': {
            'notes2000': cash_state.notes_2000 if cash_state else 0,
            'notes500': cash_state.notes_500 if cash_state else 0,
            'notes200': cash_state.notes_200 if cash_state else 0,
            'notes100': cash_state.notes_100 if cash_state else 0,
            'notes50': cash_state.notes_50 if cash_state else 0,
            'notes20': cash_state.notes_20 if cash_state else 0,
            'notes10': cash_state.notes_10 if cash_state else 0,
            'pettyCashExp': petty_cash_exp,
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
        
        # Sales Breakdown (D8:E20)
        sb_rows = [
            ("(-)SALE RETURN", data['salesBreakdown']['saleReturn'], None),
            ("(-)CREDIT SALE", data['salesBreakdown']['creditSale'], "FF0000"),
            ("(-)PHONEPAY", data['salesBreakdown']['phonePay'], None),
            ("(-)CARD", data['salesBreakdown']['card'], None),
            ("(-) EXPENSES", data['salesBreakdown']['expenses'], "FF0000"),
            (None, None, "FFFF00"), # Yellow blank row
            ("(+) CUSTOMER JAMA", data['salesBreakdown']['customerJama'], "FF0000"),
            ("(+) CARTON SALE", data['salesBreakdown']['cartonSale'], None),
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
