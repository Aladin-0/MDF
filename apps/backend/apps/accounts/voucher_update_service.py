import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Voucher, VoucherLine, VoucherBillAdjustment, Ledger, Customer
from apps.billing.models import SaleInvoice, CreditAccount, CreditTransaction
from apps.purchases.models import PurchaseInvoice
from apps.accounts.services import LedgerService
from apps.audit.core.registry import SnapshotBuilderRegistry
from apps.accounts.journal_service import post_voucher, reverse_journal

logger = logging.getLogger(__name__)

@transaction.atomic
def atomic_voucher_update(voucher_id: str, outlet_id: str, payload: dict, staff_id: str) -> Voucher:
    try:
        voucher = Voucher.objects.select_for_update().get(id=voucher_id, outlet_id=outlet_id)
    except Voucher.DoesNotExist:
        raise ValidationError("Voucher not found.")

    from apps.accounts.models import Staff
    staff = Staff.objects.filter(id=staff_id).first()
    # A voucher is considered "settled" if it has been adjusted against bills
    if voucher.bill_adjustments.exists():
        if not staff or (staff.role not in ('admin', 'super_admin') and not staff.can_modify_settled_vouchers):
            raise ValidationError("Cannot modify a voucher that is already linked to settled bills. Missing 'can_modify_settled_vouchers' permission.")

    if getattr(voucher, 'status', 'posted') == 'posted':
        reason_code = payload.get('revisionReasonCode')
        reason_text = payload.get('revisionReasonText')
        if not reason_code or not reason_text:
            raise ValidationError("Editing a posted voucher requires a reason code and explanation.")
        if len(reason_text.strip()) < 10:
            raise ValidationError("Reason explanation must be at least 10 characters.")

    old_snapshot = SnapshotBuilderRegistry.build_snapshot(voucher)

    voucher_type = voucher.voucher_type

    lines_data = payload.get('lines', [])
    if not lines_data:
        raise ValidationError('Voucher must have at least one line.')

    total_debit = sum(Decimal(str(l.get('debit', 0))) for l in lines_data)
    total_credit = sum(Decimal(str(l.get('credit', 0))) for l in lines_data)

    if total_debit != total_credit:
        raise ValidationError(f"Total debit (₹{total_debit}) must equal total credit (₹{total_credit}) for all vouchers.")

    # ── Direction guard for Receipt and Payment vouchers ──────────────────
    if voucher_type in ('receipt', 'payment'):
        for line in lines_data:
            line_debit = Decimal(str(line.get('debit', 0)))
            line_credit = Decimal(str(line.get('credit', 0)))
            if line_debit == 0 and line_credit == 0:
                continue
            try:
                ledger = Ledger.objects.select_related('group').get(id=line['ledger_id'])
            except Ledger.DoesNotExist:
                continue
            nature = ledger.group.nature
            if voucher_type == 'receipt' and nature == 'expense' and line_credit > 0:
                raise ValidationError(
                    f"Receipt voucher: expense ledger '{ledger.name}' cannot be credited. "
                    f"Use a Payment voucher to record expenses paid out."
                )
            if voucher_type == 'payment' and nature == 'expense' and line_credit > 0:
                raise ValidationError(
                    f"Payment voucher: expense ledger '{ledger.name}' must be debited, not credited. "
                    f"Expenses are always on the debit side for a Payment voucher."
                )
            if voucher_type == 'receipt' and nature == 'expense' and line_debit > 0:
                raise ValidationError(
                    f"Receipt voucher: expense ledger '{ledger.name}' cannot be debited in a Receipt. "
                    f"Use a Payment voucher to record an expense."
                )

    # Contra: both ledgers must be Cash in Hand or Bank Accounts
    if voucher_type == 'contra':
        for line in lines_data:
            try:
                ledger = Ledger.objects.select_related('group').get(id=line['ledger_id'])
                if ledger.group.name not in ('Cash in Hand', 'Bank Accounts'):
                    raise ValidationError(
                        f"Contra voucher: ledger '{ledger.name}' must be Cash or Bank."
                    )
            except Ledger.DoesNotExist:
                pass


    # =========================================================================
    # REVERSAL OF OLD STATE
    # =========================================================================

    # 1. Reverse bill adjustments
    for adj in voucher.bill_adjustments.all():
        if adj.invoice_type == 'sale' and adj.sale_invoice_id:
            try:
                inv = SaleInvoice.objects.select_for_update().get(id=adj.sale_invoice_id)
                inv.amount_due += adj.adjusted_amount
                inv.save(update_fields=['amount_due'])
                if inv.customer_id:
                    customer = Customer.objects.select_for_update().get(id=inv.customer_id)
                    customer.outstanding += adj.adjusted_amount
                    customer.save(update_fields=['outstanding'])
            except Exception:
                pass
        elif adj.invoice_type == 'purchase' and adj.purchase_invoice_id:
            try:
                inv = PurchaseInvoice.objects.select_for_update().get(id=adj.purchase_invoice_id)
                inv.outstanding += adj.adjusted_amount
                inv.save(update_fields=['outstanding'])
            except Exception:
                pass

    # 2. Reverse CreditAccount transactions
    for line in voucher.lines.all():
        if line.credit > 0:
            try:
                ledger = Ledger.objects.select_related('linked_customer').get(id=line.ledger_id)
                if ledger.linked_customer:
                    credit_account = CreditAccount.objects.filter(
                        customer=ledger.linked_customer, 
                        outlet_id=outlet_id
                    ).first()
                    
                    if credit_account:
                        credit_account.total_outstanding += line.credit
                        credit_account.total_repaid -= line.credit
                        
                        if credit_account.total_outstanding <= 0:
                            credit_account.status = 'cleared'
                        elif credit_account.total_outstanding < credit_account.total_borrowed:
                            credit_account.status = 'partial'
                        else:
                            credit_account.status = 'active'
                            
                        credit_account.last_transaction_date = timezone.now()
                        credit_account.save()
                        
                        # Delete the old credit transaction tied to this voucher
                        CreditTransaction.objects.filter(
                            credit_account=credit_account,
                            description=f"Payment via Voucher {voucher.voucher_no}",
                            amount=line.credit
                        ).delete()
            except Exception:
                pass

    # 3. Reverse old voucher line balances and delete old journal entry
    for line in voucher.lines.all():
        # Reverse the ledger balance by flipping debit and credit
        LedgerService.update_balance(line.ledger_id, line.credit, line.debit)

    from apps.accounts.models import JournalEntry
    JournalEntry.objects.filter(source_type='VOUCHER', source_id=str(voucher.id)).delete()

    # =========================================================================
    # APPLY NEW STATE
    # =========================================================================

    voucher.date = payload.get('date', voucher.date)
    voucher.narration = payload.get('narration', voucher.narration)
    voucher.total_amount = payload.get('total_amount', voucher.total_amount)
    voucher.payment_mode = payload.get('payment_mode', voucher.payment_mode)
    voucher.save()

    # Clear old lines and adjustments
    voucher.lines.all().delete()
    voucher.bill_adjustments.all().delete()

    for line in lines_data:
        VoucherLine.objects.create(
            voucher=voucher,
            ledger_id=line['ledger_id'],
            debit=line.get('debit', 0),
            credit=line.get('credit', 0),
            description=line.get('description', ''),
        )
        LedgerService.update_balance(
            line['ledger_id'],
            line.get('debit', 0),
            line.get('credit', 0),
        )

        # Sync with Billing CreditAccount if a customer ledger is credited
        line_credit = Decimal(str(line.get('credit', 0)))
        if line_credit > 0:
            try:
                ledger = Ledger.objects.select_related('linked_customer').get(id=line['ledger_id'])
                if ledger.linked_customer:
                    credit_account = CreditAccount.objects.filter(
                        customer=ledger.linked_customer, 
                        outlet_id=outlet_id
                    ).first()
                    
                    if credit_account:
                        credit_account.total_outstanding -= line_credit
                        credit_account.total_repaid += line_credit
                        
                        if credit_account.total_outstanding <= 0:
                            credit_account.status = 'cleared'
                        elif credit_account.total_outstanding < credit_account.total_borrowed:
                            credit_account.status = 'partial'
                            
                        credit_account.last_transaction_date = timezone.now()
                        credit_account.save()
                        
                        CreditTransaction.objects.create(
                            credit_account=credit_account,
                            customer=ledger.linked_customer,
                            type='credit',
                            amount=line_credit,
                            description=f"Payment via Voucher {voucher.voucher_no}",
                            balance_after=credit_account.total_outstanding,
                            recorded_by_id=staff_id,
                            date=payload['date']
                        )
            except Exception as e:
                logger.error(f"Error syncing CreditAccount for Voucher {voucher.voucher_no}: {e}")

    # Process bill adjustments
    for adj in payload.get('bill_adjustments', []):
        invoice_type = adj.get('invoice_type')
        adjusted_amount = Decimal(str(adj.get('adjusted_amount', 0)))
        if adjusted_amount <= 0:
            continue

        if invoice_type == 'sale':
            sale_inv_id = adj.get('invoice_id')
            VoucherBillAdjustment.objects.create(
                voucher=voucher,
                invoice_type='sale',
                sale_invoice_id=sale_inv_id,
                adjusted_amount=adjusted_amount,
            )
            try:
                inv = SaleInvoice.objects.select_for_update().get(id=sale_inv_id)
                inv.amount_due = max(Decimal('0'), inv.amount_due - adjusted_amount)
                inv.save(update_fields=['amount_due'])
                if inv.customer_id:
                    customer = Customer.objects.select_for_update().get(
                        id=inv.customer_id, outlet_id=outlet_id
                    )
                    customer.outstanding = max(
                        Decimal('0'), customer.outstanding - adjusted_amount
                    )
                    customer.save(update_fields=['outstanding'])
            except Exception:
                pass

        elif invoice_type == 'purchase':
            purchase_inv_id = adj.get('invoice_id')
            VoucherBillAdjustment.objects.create(
                voucher=voucher,
                invoice_type='purchase',
                purchase_invoice_id=purchase_inv_id,
                adjusted_amount=adjusted_amount,
            )
            try:
                inv = PurchaseInvoice.objects.select_for_update().get(id=purchase_inv_id)
                inv.outstanding = max(Decimal('0'), inv.outstanding - adjusted_amount)
                inv.save(update_fields=['outstanding'])
            except Exception:
                pass

    # Post journal entry to general ledger
    try:
        post_voucher(voucher)
    except Exception as e:
        logger.error(f"Journal posting failed for updated voucher {voucher.id}: {e}")
        raise ValidationError(f"Accounting failure: {e}")

    # Dual-write mode for audit tracking
    reason_code = payload.get('revisionReasonCode', 'MODIFIED')
    reason_text = payload.get('revisionReasonText', 'User updated the voucher')
    
    from apps.audit.core import orchestrator
    
    new_snapshot = SnapshotBuilderRegistry.build_snapshot(voucher)
    orchestrator.record_mutation(
        entity=voucher,
        action="UPDATE",
        module="accounts",
        old_snapshot=old_snapshot,
        new_snapshot=new_snapshot,
        reason_code=reason_code,
        reason_text=reason_text,
        metadata={"payload": payload}
    )
    return voucher
