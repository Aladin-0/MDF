"""
PUT /customers/<id>/: editing a customer.

Each test pins down a way an edit used to be lost or refused: the ledger kept the old name and address (billing shows
the ledger's copy), a customer imported with a landline number could not be edited at all, and bad dates crashed.
"""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

D = Decimal


@pytest.fixture
def shop(db):
    from apps.billing.tests.factories import make_test_outlet
    from apps.accounts.tests.factories import StaffFactory
    from apps.accounts.models import Customer, Ledger, LedgerGroup

    outlet = make_test_outlet('Main')
    outlet.gstin, outlet.drug_license_no = '27AAAAA0000A1Z5', 'DL-MAIN'    # these are unique per outlet
    outlet.save(update_fields=['gstin', 'drug_license_no'])
    other = make_test_outlet('Other')
    staff = StaffFactory(outlet=outlet, role='billing_staff')
    debtors = LedgerGroup.objects.get(outlet=outlet, name='Sundry Debtors')

    def person(name, phone, *, ledger_name='auto', holder=None, out=outlet, **fields):
        c = Customer.objects.create(outlet=out, name=name, phone=phone, account_holder=holder, **fields)
        if ledger_name is not None and holder is None and out == outlet:
            Ledger.objects.create(outlet=out, linked_customer=c, group=debtors, phone=phone, address=fields.get('address') or '',
                                  name=f'{name} ({phone})' if ledger_name == 'auto' else ledger_name)
        return c

    client = APIClient()
    client.force_authenticate(user=staff)

    def put(customer, **body):
        return client.put(f'/api/v1/customers/{customer.id}/', {'outletId': str(outlet.id), **body}, format='json')

    return outlet, other, person, put, client


def ledger_of(customer):
    from apps.accounts.models import Ledger
    return Ledger.objects.get(linked_customer=customer)


@pytest.mark.django_db
def test_a_new_name_mobile_and_address_reach_the_ledger_that_billing_shows(shop):
    outlet, other, person, put, client = shop
    abdul = person('ABDUL SALAM', '8888853110', address='SAVERA PARK, CSN, 431001')

    r = put(abdul, name='Abdul Salam Khan', phone='9123456780', address='New Colony, CSN', gstin='27AABCA1234A1Z5')

    assert r.status_code == 200, r.content
    ledger = ledger_of(abdul)
    assert (ledger.name, ledger.phone, ledger.address, ledger.gstin) == (
        'Abdul Salam Khan (9123456780)', '9123456780', 'New Colony, CSN', '27AABCA1234A1Z5')
    # the response tells the billing screen what to show without another request
    assert (r.json()['ledgerId'], r.json()['ledgerName']) == (str(ledger.id), 'Abdul Salam Khan (9123456780)')


@pytest.mark.django_db
def test_an_older_ledger_named_by_the_name_alone_keeps_that_style(shop):
    outlet, other, person, put, client = shop
    asha = person('Asha', '9000000002', ledger_name='Asha')
    assert put(asha, name='Asha Patil').status_code == 200
    assert ledger_of(asha).name == 'Asha Patil'


@pytest.mark.django_db
def test_a_ledger_name_typed_by_hand_in_accounts_is_left_alone(shop):
    outlet, other, person, put, client = shop
    asha = person('Asha', '9000000002', ledger_name='ASHA MEDICAL STORES - CREDIT A/C')
    assert put(asha, name='Asha Patil', address='MG Road').status_code == 200
    ledger = ledger_of(asha)
    assert (ledger.name, ledger.address) == ('ASHA MEDICAL STORES - CREDIT A/C', 'MG Road')   # details still follow


@pytest.mark.django_db
def test_a_ledger_name_another_ledger_already_uses_does_not_fail_the_save(shop):
    outlet, other, person, put, client = shop
    person('Ravi', '9000000007', ledger_name='Ravi Kumar')              # someone else's ledger already has the plain name
    ravi = person('Ravi', '9000000008', ledger_name='Ravi')
    assert put(ravi, name='Ravi Kumar').status_code == 200
    assert ledger_of(ravi).name == 'Ravi Kumar (9000000008)'             # falls back to the name + mobile form


@pytest.mark.django_db
def test_a_customer_imported_with_a_landline_number_can_still_be_edited(shop):
    """The number they already had was re-checked on every save, so nothing on such a record could be changed."""
    outlet, other, person, put, client = shop
    old = person('Old Import', '02402331234', address='')

    r = put(old, name='Old Import', phone='02402331234', address='Station Road')     # number untouched
    assert r.status_code == 200, r.content
    old.refresh_from_db()
    assert (old.address, old.phone) == ('Station Road', '02402331234')

    assert put(old, phone='12345').status_code == 400                               # a CHANGED number must be a mobile
    assert put(old, phone='9876543210').status_code == 200
    old.refresh_from_db()
    assert old.phone == '9876543210'
    assert ledger_of(old).name == 'Old Import (9876543210)'


@pytest.mark.django_db
def test_every_field_the_form_sends_is_saved(shop):
    """The browser used to send only nine of them: state, licence numbers, email, gender and relationship never arrived."""
    outlet, other, person, put, client = shop
    c = person('Wholesale Party', '9000000010')
    r = put(c, name='Wholesale Party', phone='9000000010', address='Plot 4, MIDC', state='Gujarat', dob='1980-05-17',
            gstin='24AABCA1234A1Z5', email='party@example.com', isChronic=True, fixedDiscount=7.5, creditLimit=50000,
            dlNo20b='GJ-20B-1', dlNo21b='GJ-21B-2', dlExpiry='2028-03-31', gender='male', relationship='')
    assert r.status_code == 200, r.content
    c.refresh_from_db()
    assert (c.state, str(c.dob), c.gstin, c.email, c.is_chronic, c.fixed_discount, c.credit_limit) == (
        'Gujarat', '1980-05-17', '24AABCA1234A1Z5', 'party@example.com', True, D('7.50'), D('50000.00'))
    assert (c.dl_no_20b, c.dl_no_21b, str(c.dl_expiry), c.gender) == ('GJ-20B-1', 'GJ-21B-2', '2028-03-31', 'male')
    body = r.json()
    assert (body['state'], body['dlNo20b'], body['dlExpiry'], body['email']) == ('Gujarat', 'GJ-20B-1', '2028-03-31', 'party@example.com')


@pytest.mark.django_db
def test_only_the_fields_that_are_sent_change_and_a_null_clears(shop):
    outlet, other, person, put, client = shop
    c = person('Keeps', '9000000011', address='Old Road', gstin='27AABCA1234A1Z5', dl_no_20b='MH-1', fixed_discount=D('5'))
    assert put(c, address='New Road').status_code == 200
    c.refresh_from_db()
    assert (c.address, c.gstin, c.dl_no_20b, c.fixed_discount, c.name) == ('New Road', '27AABCA1234A1Z5', 'MH-1', D('5.00'), 'Keeps')

    assert put(c, gstin=None, dlNo20b=None).status_code == 200
    c.refresh_from_db()
    assert (c.gstin, c.dl_no_20b) == (None, None)
    assert ledger_of(c).gstin == ''


@pytest.mark.django_db
def test_an_edit_cannot_make_an_exact_copy_of_another_customer(shop):
    outlet, other, person, put, client = shop
    person('Asha', '9000000002')
    twin = person('Asha', '9000000003')
    r = put(twin, phone='9000000002')
    assert r.status_code == 400 and 'already exists' in r.json()['detail']
    assert put(twin, address='Still editable').status_code == 200          # other fields of an existing record stay editable


@pytest.mark.django_db
def test_a_family_members_edit_leaves_the_owners_ledger_and_limit_alone(shop):
    outlet, other, person, put, client = shop
    rahul = person('Rahul', '9000000001', credit_limit=D('2000'))
    priya = person('Priya', '9000000001', holder=rahul)

    r = put(priya, name='Priya Sharma', phone='9000000001', creditLimit=2000)   # the form shows a member the OWNER's limit
    assert r.status_code == 200, r.content
    priya.refresh_from_db()
    assert (priya.name, priya.credit_limit) == ('Priya Sharma', D('0.00'))      # not copied onto the member
    assert ledger_of(rahul).name == 'Rahul (9000000001)'
    assert (r.json()['ledgerName'], r.json()['creditLimit']) == ('Rahul (9000000001)', 2000.0)


@pytest.mark.django_db
def test_bad_dates_are_refused_not_crashed(shop):
    outlet, other, person, put, client = shop
    c = person('Dates', '9000000012')
    assert put(c, dob='17/05/1980').status_code == 400
    assert put(c, dlExpiry='next year').status_code == 400
    assert put(c, dob='', dlExpiry=None).status_code == 200


@pytest.mark.django_db
def test_the_outlet_defaults_to_the_users_own_and_other_outlets_stay_closed(shop):
    outlet, other, person, put, client = shop
    mine = person('Mine', '9000000013')
    r = client.put(f'/api/v1/customers/{mine.id}/', {'address': 'No outlet sent'}, format='json')
    assert r.status_code == 200, r.content

    theirs = person('Theirs', '9000000014', out=other)
    assert client.put(f'/api/v1/customers/{theirs.id}/', {'address': 'x'}, format='json').status_code == 404
    assert client.put(f'/api/v1/customers/{theirs.id}/', {'outletId': str(other.id), 'address': 'x'}, format='json').status_code == 403
