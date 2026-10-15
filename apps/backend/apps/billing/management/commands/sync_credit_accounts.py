import logging
from datetime import datetime, date, timezone
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.accounts.models import Customer, Ledger, JournalLine, VoucherLine
from apps.billing.models import CreditAccount, CreditTransaction

logger = logging.getLogger(__name__)


def sync_all_credit_accounts():
    """
    Sync all customers and their linked Sundry Debtors ledgers into
    CreditAccount and CreditTransaction tables.
    Returns (synced_accounts, total_tx_created).
    """
    customers = Customer.objects.all().select_related('outlet')
    synced_accounts = 0
    total_tx_created = 0

    with transaction.atomic():
        for customer in customers:
            if not customer.outlet:
                continue

            credit_account, _ = CreditAccount.objects.get_or_create(
                customer=customer,
                outlet=customer.outlet,
            )

            ledger = customer.ledgers.filter(group__name='Sundry Debtors').first()
            if not ledger:
                credit_account.total_outstanding = customer.outstanding or Decimal('0.00')
                credit_account.status = 'active' if credit_account.total_outstanding > 0 else 'cleared'
                credit_account.credit_limit = customer.credit_limit or Decimal('0.00')
                credit_account.save()
                synced_accounts += 1
                continue

            entries = []

            # 1. Opening Balance
            if ledger.opening_balance and ledger.opening_balance > 0:
                entries.append({
                    'date': date(2026, 4, 1),
                    'created_at': datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc),
                    'type': 'debit',
                    'amount': ledger.opening_balance,
                    'description': 'Opening Balance',
                })

            # 2. Journal Lines (Sales and other journals, excluding VOUCHER)
            jlines = JournalLine.objects.filter(ledger=ledger).exclude(
                journal_entry__source_type='VOUCHER'
            ).select_related('journal_entry')
            for jl in jlines:
                je = jl.journal_entry
                is_debit = (jl.debit_amount > 0)
                amt = jl.debit_amount if is_debit else jl.credit_amount
                if amt == 0:
                    continue
                dt = je.date or (je.created_at.date() if je.created_at else date(2026, 4, 1))
                created = je.created_at or datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc)
                entries.append({
                    'date': dt,
                    'created_at': created,
                    'type': 'debit' if is_debit else 'credit',
                    'amount': amt,
                    'description': je.narration or f"Journal {je.source_type}",
                })

            # 3. Voucher Lines (Receipts / Payments)
            vlines = VoucherLine.objects.filter(ledger=ledger).select_related('voucher')
            for vl in vlines:
                v = vl.voucher
                is_debit = (vl.debit > 0)
                amt = vl.debit if is_debit else vl.credit
                if amt == 0:
                    continue
                dt = v.date or (v.created_at.date() if v.created_at else date(2026, 4, 1))
                created = v.created_at or datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc)
                desc = f"{v.voucher_no} {v.narration or v.voucher_type}".strip()
                entries.append({
                    'date': dt,
                    'created_at': created,
                    'type': 'debit' if is_debit else 'credit',
                    'amount': amt,
                    'description': desc,
                })

            # Helper to make naive for sorting
            def _sort_key(item):
                c = item['created_at']
                if c is not None and hasattr(c, 'tzinfo') and c.tzinfo is not None:
                    c = c.replace(tzinfo=None)
                return (item['date'], c or datetime.min)

            # Sort chronologically
            entries.sort(key=_sort_key)

            # Clear existing transactions for clean re-sync
            CreditTransaction.objects.filter(credit_account=credit_account).delete()

            running_bal = Decimal('0.00')
            total_borrowed = Decimal('0.00')
            total_repaid = Decimal('0.00')
            last_dt = None

            for e in entries:
                if e['type'] == 'debit':
                    running_bal += e['amount']
                    total_borrowed += e['amount']
                else:
                    running_bal -= e['amount']
                    total_repaid += e['amount']
                last_dt = e['date']

                CreditTransaction.objects.create(
                    credit_account=credit_account,
                    customer=customer,
                    type=e['type'],
                    amount=e['amount'],
                    description=e['description'][:255],
                    balance_after=running_bal,
                    date=e['date'],
                )
                total_tx_created += 1

            credit_account.total_outstanding = ledger.current_balance
            credit_account.total_borrowed = total_borrowed
            credit_account.total_repaid = total_repaid
            if last_dt:
                credit_account.last_transaction_date = datetime.combine(last_dt, datetime.min.time(), tzinfo=timezone.utc)

            # Determine status
            if credit_account.total_outstanding <= Decimal('0.00'):
                credit_account.status = 'cleared'
            else:
                if last_dt:
                    days_diff = (date.today() - last_dt).days
                    credit_account.status = 'overdue' if days_diff > 30 else 'active'
                else:
                    credit_account.status = 'active'

            credit_account.credit_limit = customer.credit_limit or Decimal('0.00')
            credit_account.save()
            synced_accounts += 1

    return synced_accounts, total_tx_created


class Command(BaseCommand):
    help = "Sync customer outstanding balances and ledger history into CreditAccount and CreditTransaction"

    def handle(self, *args, **options):
        self.stdout.write("Syncing credit accounts and transactions...")
        synced_accounts, total_tx_created = sync_all_credit_accounts()
        self.stdout.write(self.style.SUCCESS(
            f"Successfully synced {synced_accounts} credit accounts and created {total_tx_created} credit transactions!"
        ))
