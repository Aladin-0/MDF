from django.apps import AppConfig

class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'

    def ready(self):
        from .models import Customer, Staff, Ledger, LedgerGroup, Voucher, DebitNote, CreditNote, JournalEntry
        from .models import Customer, Staff, Ledger, LedgerGroup, Voucher, DebitNote, CreditNote, JournalEntry
