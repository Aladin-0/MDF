from django.apps import AppConfig

class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'

    def ready(self):
        from .models import Customer, Staff, Ledger, LedgerGroup, Voucher, DebitNote, CreditNote, JournalEntry
        from apps.audit.registry import register_audit
        register_audit(Customer, 'patient')
        register_audit(Staff, 'staff')
        register_audit(Ledger, 'accounts')
        register_audit(LedgerGroup, 'accounts')
        register_audit(Voucher, 'accounts')
        register_audit(DebitNote, 'accounts')
        register_audit(CreditNote, 'accounts')
        register_audit(JournalEntry, 'accounts')
