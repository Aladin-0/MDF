import logging
from django.db import transaction
from datetime import datetime
from apps.accounts.models import PostDatedCheque, JournalEntry
from apps.accounts.journal_service import _get_customer_ledger, _get_ledger, _create_lines_and_update_balances

logger = logging.getLogger(__name__)

def process_pdc_clearance(pdc: PostDatedCheque, bank_ledger=None):
    """
    Handles PDC state transitions (PENDING -> CLEARED, BOUNCED).
    On CLEARED: Credits Customer AR, Debits designated Bank ledger via journal.
    """
    with transaction.atomic():
        if pdc.status == 'CLEARED':
            raise ValueError(f"PDC {pdc.cheque_number} is already cleared.")
            
        # Update PDC
        pdc.status = 'CLEARED'
        pdc.save()
        
        outlet = pdc.customer.outlet
        
        # ── DEBIT side: Bank Ledger ──
        if not bank_ledger:
            bank_ledger = _get_ledger(outlet, 'Bank Account')
            if not bank_ledger:
                bank_ledger = _get_ledger(outlet, 'Cash')
                
        # ── CREDIT side: Customer Ledger (AR) ──
        customer_ledger = _get_customer_ledger(outlet, pdc.customer)
        if not customer_ledger:
            raise ValueError(f"No customer ledger found for {pdc.customer.name}")
            
        lines = [
            ('debit', bank_ledger, pdc.amount),
            ('credit', customer_ledger, pdc.amount)
        ]
        
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='PDC_CLEARANCE',
            source_id=str(pdc.id),
            date=datetime.now().date(),
            narration=f"PDC Clearance: Cheque {pdc.cheque_number} from {pdc.bank_name}"
        )
        
        _create_lines_and_update_balances(je, lines)
        logger.info(f"Cleared PDC {pdc.cheque_number} and posted journal {je.id}")

def process_pdc_bounced(pdc: PostDatedCheque, bounce_charges=0):
    """
    Handles PDC bounced scenario.
    Does not touch AR for the original amount (debt remains).
    """
    with transaction.atomic():
        pdc.status = 'BOUNCED'
        pdc.save()
        logger.info(f"PDC {pdc.cheque_number} bounced.")
        # Optional: debit note for bounce_charges could be added here.
