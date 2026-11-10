"""
Family / shared accounts.

Several people can share one mobile number and one credit account. ANY customer can be the account owner ("Priya and Rohan bill
under Rahul"): the owner keeps their own ledger, balance, credit limit and credit account, and members point to them with
`Customer.account_holder`. A purely shared record that is no single person ("Sharma Family Account", `is_family_account=True`)
is also supported; billing it always names the person. A bill is posted to the ACCOUNT (SaleInvoice.customer) and names the person it was for in
SaleInvoice.patient, so every piece of money code keeps working on one owner and the medical history stays per person.
"""
from decimal import Decimal
from typing import Optional, Tuple

from django.db import transaction

from apps.accounts.models import Customer, Ledger, LedgerGroup


class FamilyAccountError(Exception):
    """A rule about family accounts was broken; the message is safe to show to the user."""


def debtors_group(outlet):
    group, _ = LedgerGroup.objects.get_or_create(outlet=outlet, name='Sundry Debtors', defaults={'nature': 'asset', 'is_system': True})
    return group


def account_ledger(customer: Customer) -> Optional[Ledger]:
    """The Sundry Debtors ledger that holds this person's money (their family account's, else their own)."""
    owner = customer.financial_customer
    return Ledger.objects.filter(linked_customer=owner, group__name='Sundry Debtors').order_by('created_at').first()


def ensure_customer_ledger(customer: Customer) -> Ledger:
    ledger = Ledger.objects.filter(linked_customer=customer, group__name='Sundry Debtors').first()
    if ledger:
        return ledger
    return Ledger.objects.create(
        outlet=customer.outlet, name=f'{customer.name} ({customer.phone})', group=debtors_group(customer.outlet),
        linked_customer=customer, phone=customer.phone, gstin=customer.gstin or '', address=customer.address or '', is_system=True,
    )


def customer_for_ledger(outlet, ledger: Ledger) -> Customer:
    """
    The Customer behind a Sundry Debtors ledger that has no linked customer yet (e.g. imported from Tally).
    Matched by phone AND name: several people can share one phone, so the phone alone would pick (or crash on) the wrong one.
    """
    phone = ledger.phone or f'L-{ledger.id}'[:20]
    name = ledger.name or 'Walk-in Customer'
    customer = Customer.objects.filter(outlet=outlet, phone=phone, name__iexact=name).first()
    if customer is None:
        customer = Customer.objects.create(outlet=outlet, phone=phone, name=name, address=ledger.address or '', gstin=ledger.gstin or None)
    if ledger.gstin and not customer.gstin:
        customer.gstin = ledger.gstin
        customer.save(update_fields=['gstin'])
    ledger.linked_customer = customer
    ledger.save(update_fields=['linked_customer'])
    return customer


def _owns_money(customer: Customer) -> bool:
    """Does this person already have a balance or credit history of their own?"""
    from apps.billing.models import CreditAccount
    if Decimal(str(customer.outstanding or 0)) != 0:
        return True
    if Ledger.objects.filter(linked_customer=customer, group__name='Sundry Debtors').exclude(current_balance=0).exists():
        return True
    return CreditAccount.objects.filter(customer=customer).exclude(total_outstanding=0).exists()


@transaction.atomic
def create_family_account(outlet, name: str, phone: str, credit_limit=0, address: str = '') -> Customer:
    account = Customer.objects.create(outlet=outlet, name=name, phone=phone, address=address or None, credit_limit=credit_limit,
                                      is_family_account=True, is_active=True)
    ensure_customer_ledger(account)
    return account


def account_people(owner: Customer):
    """Everyone a bill on `owner`'s account can be for: the owner themselves (unless it is a purely shared record) + members."""
    people = [] if owner.is_family_account else [owner]
    people.extend(owner.members.filter(is_active=True).order_by('created_at'))
    return people


def has_family(customer: Customer) -> bool:
    owner = customer.financial_customer
    return owner.is_family_account or owner.members.exists()


@transaction.atomic
def attach_member(member: Customer, account: Customer, relationship: str = '', gender: str = '') -> Customer:
    """Make `member` bill to `account`. Refused when it would strand a balance or build an invalid structure."""
    if account.pk == member.pk:
        raise FamilyAccountError('A customer cannot be a member of their own account.')
    if account.outlet_id != member.outlet_id:
        raise FamilyAccountError('That account belongs to a different outlet.')
    if account.account_holder_id:
        raise FamilyAccountError(f'"{account.name}" is itself a member of "{account.account_holder.name}"; pick the account owner instead.')
    if member.is_family_account or member.members.exists():
        raise FamilyAccountError(f'"{member.name}" already has family members under their own account, so they cannot join another account.')
    if member.account_holder_id and member.account_holder_id != account.pk:
        raise FamilyAccountError(f'"{member.name}" already belongs to "{member.account_holder.name}". Remove them from it first.')
    if _owns_money(member):
        raise FamilyAccountError(
            f'"{member.name}" has an outstanding balance or credit history of their own. Settle it first, '
            'otherwise it would be left behind on a ledger that no longer receives their bills.')
    member.account_holder = account
    member.relationship = relationship or member.relationship
    member.gender = gender or member.gender
    member.save(update_fields=['account_holder', 'relationship', 'gender'])
    return member


@transaction.atomic
def detach_member(member: Customer) -> Customer:
    """Take `member` out of their family account; from now on they bill to their own ledger."""
    if not member.account_holder_id:
        return member
    member.account_holder = None
    member.save(update_fields=['account_holder'])
    ensure_customer_ledger(member)
    return member


def resolve_bill_parties(customer: Customer, patient_id=None) -> Tuple[Customer, Optional[Customer]]:
    """
    Who is billed and who it is for. Returns (account_to_bill, patient_or_None).
      - picking a family member bills their account and records them as the patient;
      - picking the family account itself requires a patient (the whole point is knowing who the medicine is for);
      - a person with no account bills themselves; patient is None;
      - an explicit patient must belong to the account being billed.
    """
    account = customer.financial_customer
    patient = None
    if patient_id:
        patient = Customer.objects.filter(pk=patient_id, outlet_id=customer.outlet_id).first()
        if patient is None:
            raise FamilyAccountError('The selected patient was not found.')
    elif customer.account_holder_id:
        patient = customer                       # a member was picked directly

    if account.is_family_account:
        if patient is None:
            raise FamilyAccountError(f'Select who this bill is for: "{account.name}" is a shared family account.')
        if patient.pk != account.pk and patient.account_holder_id != account.pk:
            raise FamilyAccountError(f'"{patient.name}" is not a member of "{account.name}".')
        if patient.is_family_account:
            raise FamilyAccountError('Select a person, not the shared account, as the patient.')
    else:
        # an individual, or a person who owns an account with members: no patient (or the owner themselves) means the bill
        # is for the owner; anyone else must be one of their members
        if patient is not None and patient.pk != account.pk and patient.account_holder_id != account.pk:
            raise FamilyAccountError(f'"{patient.name}" is not a member of "{account.name}".')
        if patient is not None and patient.pk == account.pk:
            patient = None
    return account, patient
