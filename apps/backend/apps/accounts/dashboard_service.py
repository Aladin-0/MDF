from decimal import Decimal
from django.db.models import Sum, Q, F, Count
from django.utils import timezone
from datetime import timedelta
from apps.billing.models import SaleInvoice
from apps.purchases.models import PurchaseInvoice
from apps.accounts.models import Voucher

class DashboardService:
    @staticmethod
    def get_financial_health_kpis(outlet_id):
        # Total Payable: Sum of outstanding on PurchaseInvoices
        total_payable = PurchaseInvoice.objects.filter(outlet_id=outlet_id).aggregate(
            total=Sum('outstanding')
        )['total'] or Decimal('0.00')

        # Overdue Payable: Outstanding on PurchaseInvoices where due_date < today
        today = timezone.now().date()
        overdue_payable = PurchaseInvoice.objects.filter(
            outlet_id=outlet_id, 
            due_date__lt=today,
            outstanding__gt=0
        ).aggregate(
            total=Sum('outstanding')
        )['total'] or Decimal('0.00')

        # Total Receivable: Sum of amount_due on SaleInvoices
        total_receivable = SaleInvoice.objects.filter(outlet_id=outlet_id).aggregate(
            total=Sum('amount_due')
        )['total'] or Decimal('0.00')

        # Overdue Receivable: Let's assume 30 days credit for customers by default if not set
        thirty_days_ago = today - timedelta(days=30)
        overdue_receivable = SaleInvoice.objects.filter(
            outlet_id=outlet_id, 
            invoice_date__lt=thirty_days_ago,
            amount_due__gt=0
        ).aggregate(
            total=Sum('amount_due')
        )['total'] or Decimal('0.00')

        # Cash/Bank Balance: Can be calculated from Ledger if we identify Cash/Bank accounts, 
        # but for simplicity, we'll return 0 if not easily identifiable.
        # Let's try to find Cash-in-Hand ledger.
        from apps.accounts.models import Ledger
        cash_ledgers = Ledger.objects.filter(
            outlet_id=outlet_id, 
            group__name__icontains='Cash-in-hand'
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0.00')
        
        bank_ledgers = Ledger.objects.filter(
            outlet_id=outlet_id, 
            group__name__icontains='Bank Accounts'
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0.00')

        return {
            'totalPayable': float(total_payable),
            'overduePayable': float(overdue_payable),
            'totalReceivable': float(total_receivable),
            'overdueReceivable': float(overdue_receivable),
            'netPosition': float(total_receivable - total_payable),
            'cashBalance': float(cash_ledgers),
            'bankBalance': float(bank_ledgers),
        }

    @staticmethod
    def get_aging_summary(outlet_id):
        today = timezone.now().date()
        
        def calculate_buckets(queryset, date_field, amount_field):
            buckets = {'0-7': 0, '8-15': 0, '16-30': 0, '31-60': 0, '60+': 0}
            for item in queryset:
                date_val = getattr(item, date_field)
                if not date_val:
                    continue
                days_old = (today - date_val).days
                amt = float(getattr(item, amount_field) or 0)
                
                if days_old <= 7:
                    buckets['0-7'] += amt
                elif days_old <= 15:
                    buckets['8-15'] += amt
                elif days_old <= 30:
                    buckets['16-30'] += amt
                elif days_old <= 60:
                    buckets['31-60'] += amt
                else:
                    buckets['60+'] += amt
            return buckets
        
        # Payables based on due_date
        payables_qs = PurchaseInvoice.objects.filter(
            outlet_id=outlet_id, 
            outstanding__gt=0
        )
        payables_aging = calculate_buckets(payables_qs, 'due_date', 'outstanding')
        
        # Receivables based on invoice_date
        receivables_qs = SaleInvoice.objects.filter(
            outlet_id=outlet_id,
            amount_due__gt=0
        )
        receivables_aging = calculate_buckets(receivables_qs, 'invoice_date', 'amount_due')
        
        return {
            'payables': payables_aging,
            'receivables': receivables_aging
        }

    @staticmethod
    def get_urgent_actions(outlet_id):
        today = timezone.now().date()
        thirty_days_ago = today - timedelta(days=30)
        
        # 8 distributor bills overdue today
        overdue_distributor_bills = PurchaseInvoice.objects.filter(
            outlet_id=outlet_id,
            due_date__lt=today,
            outstanding__gt=0
        ).count()
        
        # 3 customer collections overdue > 30 days
        overdue_customer_bills = SaleInvoice.objects.filter(
            outlet_id=outlet_id,
            invoice_date__lt=thirty_days_ago,
            amount_due__gt=0
        ).count()
        
        # Vouchers created today
        vouchers_today = Voucher.objects.filter(
            outlet_id=outlet_id,
            date=today
        ).count()
        
        return {
            'overdueDistributorBills': overdue_distributor_bills,
            'overdueCustomerBills': overdue_customer_bills,
            'vouchersToday': vouchers_today,
            'reconciliationMismatches': 0, # To be populated by audit service
        }
