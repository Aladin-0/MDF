"""
Phase 2 of the Marg reload: ledgers, opening balances, suppliers and customers of ONE outlet.

The outlet's old books are deleted and rebuilt from Marg (the owner chose delete-and-reload over patching, 2026-11-25):

  delete   returns, bills, purchases, vouchers, journal entries, drafts, credit accounts, customers, suppliers,
           and every ledger / group that is not one of MediFlow's own built-ins. Stock from Phase 1 is kept.
  rebuild  Marg's groups UNDER MediFlow's built-in groups, every Marg ledger with its 1 April opening balance,
           a supplier for every creditor, a customer for every debtor and for every mobile number on a bill note,
           and each stock batch's supplier from the stock report.

Why under the built-in groups: the app finds customers, suppliers, cash and bank ONLY by those exact names
(`group__name='Sundry Debtors'` and so on). The October load kept Marg's own "SUNDRY DEBTORS" (capitals), so the
app did not see its 136 customer ledgers. The reports add up a group's sub-groups, so Marg's sub-groups can stay.
"""
import hashlib
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from decimal import Decimal

from django.apps import apps as django_apps
from django.db.models import Count, Q, Sum

from apps.accounts.models import Customer, Ledger, LedgerGroup
from apps.inventory.models import Batch, MasterProduct, StockLedger
from apps.purchases.models import Distributor

from .files import MargLedger
from .rules import name_key

ZERO = Decimal('0')

# Marg group (by name_key) -> MediFlow's built-in group. FLAT: every ledger anywhere below goes straight into the
# built-in group, because the app looks those ledgers up by the group's exact name and does not look into sub-groups.
FLAT = {
    'SUNDRYDEBTORS': 'Sundry Debtors', 'SUNDRYCREDITORS': 'Sundry Creditors', 'CASHINHAND': 'Cash in Hand',
    'BANKACCOUNTS': 'Bank Accounts', 'BANKOCCAC': 'Bank OD',
}
ROOT = {
    'CAPITALACCOUNT': 'Capital Account', 'CURRENTASSETS': 'Current Assets', 'CURRENTLIABILITIES': 'Current Liabilities',
    'FIXEDASSETS': 'Fixed Assets', 'INVESTMENTS': 'Investments', 'LOANSLIABILITY': 'Loans (Liability)',
    'DIRECTEXPENSES': 'Direct Expenses', 'INDIRECTEXPENSES': 'Indirect Expenses', 'DIRECTINCOMES': 'Direct Incomes',
    'INDIRECTINCOMES': 'Indirect Incomes', 'DUTIESTAXES': 'Duties & Taxes', 'SUSPENSEACCOUNTTEMPORARYACS': 'Suspense Account',
    'BRANCHDIVISIONS': 'Branch / Division', 'PURCHASEACCOUNTS': 'Purchase Account', 'PURCHASEACCOUNT': 'Purchase Account',
    'SALESACCOUNTS': 'Sales Account', 'SALESACCOUNT': 'Sales Account',
}
# Marg top-level groups with no MediFlow twin: where they hang (a sub-group keeps its Marg name)
HOME = {'MISCEXPENSESASSET': 'Current Assets', 'PROFITLOSSAC': 'Capital Account', 'REVENUEACCOUNT': 'Indirect Incomes'}
FALLBACK = 'Suspense Account'
# Marg keeps the payment modes as debtor ledgers; MediFlow has its own ledger for each, which its new bills post to
PAYMENT_LEDGERS = {'PHONEPAY': 'UPI Collections', 'CARDSWIPE': 'Card/POS Settlement'}

_MOBILE = re.compile(r'(?<!\d)([6-9]\d{9})(?!\d)')
_GSTIN = re.compile(r'^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$')
_PAN = re.compile(r'^[A-Z]{5}\d{4}[A-Z]$')


def norm(name) -> str:
    """A ledger's identity: Marg uses the same spelling in the masters and the bills ("TEA & NASTA"); case and spacing aside."""
    return ' '.join((name or '').upper().split())


def app_key(name) -> str:
    """How the posting code compares ledger names (accounts/journal_service._normalize_ledger_name): A-Z, 0-9 and % only."""
    return re.sub(r'[^A-Z0-9%]', '', (name or '').upper())


def valid_gstin(v) -> str:
    v = (v or '').strip().upper()
    return v if _GSTIN.match(v) else ''


def valid_pan(v) -> str:
    v = (v or '').strip().upper()
    return v if _PAN.match(v) else ''


def side(marg_amount: Decimal) -> tuple[Decimal, str]:
    """Marg writes a debit as a negative number."""
    return abs(marg_amount), 'Dr' if marg_amount < 0 else 'Cr'


def opening_side(marg_amount: Decimal, nature: str) -> tuple[Decimal, str]:
    """`side`, except that a zero opening takes the group's own side: the ledger statement reads the ledger's side to
    decide which way its balance runs, so a customer or cash ledger marked 'Cr' showed its balance as a minus credit."""
    if not marg_amount:
        return Decimal('0'), 'Dr' if nature in ('asset', 'expense') else 'Cr'
    return side(marg_amount)


def natural_balance(amount: Decimal, dr_cr: str, nature: str) -> Decimal:
    """`Ledger.current_balance` is kept in the group's own direction (accounts/services.py update_balance)."""
    up = (dr_cr == 'Dr') == (nature in ('asset', 'expense'))
    return amount if up else -amount


def note_party(note: str):
    """"R000001 9876500001RAVI KUMAR" -> ('9876500001', 'RAVI KUMAR'). No mobile -> None."""
    m = _MOBILE.search(note or '')
    if not m:
        return None
    return m.group(1), ' '.join(note[m.end():].strip(' -.,:').split()).upper()


def temp_phone(name) -> str:
    """The app's own placeholder for a customer with no mobile (`TMP-` + 8 hex), stable for the same name."""
    return 'TMP-' + hashlib.sha1(norm(name).encode()).hexdigest()[:8]


def state_code(gstin, state) -> str:
    if gstin:
        return gstin[:2]
    return '27' if norm(state) == 'MAHARASHTRA' else ''


# ── the plan ─────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class LedgerPlan:
    marg: MargLedger           # the first of Marg's copies (Marg repeats a few names exactly)
    opening: Decimal           # all copies added up, Marg's sign
    copies: int
    group: str                 # the built-in group, or the Marg sub-group it goes in
    builtin_root: str
    into_builtin: str = ''     # the MediFlow built-in ledger it is merged into ('' = a ledger of its own)
    role: str = ''             # 'customer' / 'supplier' / ''


@dataclass
class PartyPlan:
    outlet: object
    groups: dict = field(default_factory=dict)       # Marg sub-group display name -> (parent name, nature)
    group_order: list = field(default_factory=list)
    ledgers: dict = field(default_factory=dict)      # norm(name) -> LedgerPlan
    customers: list = field(default_factory=list)    # dicts for Customer(...), with 'ledger' key for debtors
    suppliers: dict = field(default_factory=dict)    # norm(name) -> dict for Distributor(...)
    batch_suppliers: list = field(default_factory=list)   # (batch id, supplier norm)
    unknown_suppliers: Counter = field(default_factory=Counter)
    notes: list = field(default_factory=list)

    def totals(self) -> dict:
        dr = sum((-lp.opening for lp in self.ledgers.values() if lp.opening < 0), ZERO)
        cr = sum((lp.opening for lp in self.ledgers.values() if lp.opening > 0), ZERO)
        return {
            'ledgers': len(self.ledgers), 'merged_into_builtin': sum(1 for lp in self.ledgers.values() if lp.into_builtin),
            'subgroups': len(self.groups), 'suppliers': len(self.suppliers),
            'customers_from_ledgers': sum(1 for c in self.customers if c.get('ledger')),
            'customers_from_bill_notes': sum(1 for c in self.customers if not c.get('ledger')),
            'opening_dr': dr, 'opening_cr': cr, 'batches_given_a_supplier': len(self.batch_suppliers),
        }


def builtin_groups(outlet) -> dict:
    return {g.name: g for g in LedgerGroup.objects.filter(outlet=outlet, is_system=True)}


def builtin_ledgers(outlet):
    """MediFlow's own ledgers: seeded as system ledgers, never a customer's or supplier's account."""
    return Ledger.objects.filter(outlet=outlet, is_system=True, linked_customer__isnull=True, linked_distributor__isnull=True)


def resolve_group(key, parents: dict, names: dict):
    """
    Where a Marg group's ledgers go: (built-in group name, [Marg sub-groups top-down]).
    `parents` = group key -> parent key, `names` = group key -> display name.
    """
    chain, k, seen = [], key, set()
    while k and k not in seen:
        seen.add(k)
        chain.append(k)
        k = parents.get(k, '')
    for k in chain:                         # nearest first
        if k in FLAT:
            return FLAT[k], []
    for i, k in enumerate(chain):
        if k in ROOT:
            return ROOT[k], [names[c] for c in reversed(chain[:i]) if c in names]
    top = chain[-1] if chain else ''
    return HOME.get(top, FALLBACK), [names[c] for c in reversed(chain) if c in names]


def build_party_plan(outlet, groups, ledgers, notes, sheet=None) -> PartyPlan:
    plan = PartyPlan(outlet=outlet)
    builtin_g = builtin_groups(outlet)
    missing = sorted({*FLAT.values(), *ROOT.values(), *HOME.values(), FALLBACK} - set(builtin_g))
    if missing:
        raise ValueError(f'MediFlow\'s built-in groups are missing on this outlet: {missing}. Run seed_ledgers first.')
    # a Marg ledger that the posting code would take for one of MediFlow's own ("GST PAYABLE (CGST)" = "GST Payable CGST")
    # becomes that ledger: two would make the code pick either one
    builtin_l = {app_key(l.name): l.name for l in builtin_ledgers(outlet)}

    parents = {name_key(g.name): name_key(g.parent) for g in groups}
    names = {name_key(g.name): g.name for g in groups}
    taken = {norm(n) for n in builtin_g}

    # Marg repeats a few ledger names exactly: bills cannot tell the copies apart, so they become one ledger
    by_name = defaultdict(list)
    for lg in ledgers:
        by_name[norm(lg.name)].append(lg)
    for key, copies in by_name.items():
        first = copies[0]
        root, chain = resolve_group(name_key(first.parent), parents, names)
        nature = builtin_g[root].nature
        parent = root
        for sub in chain:
            label = sub if norm(sub) not in taken or sub in plan.groups else f'{sub} (Marg)'
            if label not in plan.groups:
                plan.groups[label] = (parent, nature)
                plan.group_order.append(label)
                taken.add(norm(label))
            parent = label
        lp = LedgerPlan(marg=first, opening=sum((c.opening for c in copies), ZERO), copies=len(copies), group=parent, builtin_root=root)
        if len({name_key(c.parent) for c in copies}) > 1:
            plan.notes.append(f'Marg has "{first.name}" {len(copies)} times in different groups; kept as one ledger in {parent}.')
        nk = name_key(first.name)
        if nk in PAYMENT_LEDGERS:
            # created in Bank Accounts when the outlet has never posted a UPI / card bill (the app makes them on first use)
            lp.into_builtin = builtin_l.get(app_key(PAYMENT_LEDGERS[nk]), PAYMENT_LEDGERS[nk])
            lp.group = 'Bank Accounts'
        elif app_key(first.name) in builtin_l:
            lp.into_builtin = builtin_l[app_key(first.name)]
        elif root == 'Sundry Debtors':
            lp.role = 'customer'
        elif root == 'Sundry Creditors':
            lp.role = 'supplier'
        plan.ledgers[key] = lp

    # customers: credit customers from the ledgers, everyone else from the mobile numbers on the bill notes
    debtor_phones = defaultdict(Counter)
    names_of = defaultdict(Counter)
    last_seen = {}
    for n in notes:
        if n.kind != 'Sales':
            continue
        got = note_party(n.note)
        if not got:
            continue
        mobile, who = got
        if plan.ledgers.get(norm(n.party), None) and plan.ledgers[norm(n.party)].role == 'customer':
            debtor_phones[norm(n.party)][mobile] += 1
        names_of[mobile][who] += 1
        last_seen[mobile] = max(last_seen.get(mobile, n.day), n.day)
    used = set()
    for key, lp in plan.ledgers.items():
        if lp.role != 'customer':
            continue
        phones = [p for p, _ in debtor_phones[key].most_common() if p not in used]
        phone = phones[0] if phones else temp_phone(lp.marg.name)
        used.add(phone)
        gstin = valid_gstin(lp.marg.gstin)
        amount, dr_cr = side(lp.opening)
        plan.customers.append(dict(
            ledger=key, name=lp.marg.name[:255], phone=phone, address=lp.marg.address or None, state=lp.marg.state or None,
            gstin=gstin or None, pan=valid_pan(lp.marg.pan) or None, state_code=state_code(gstin, lp.marg.state) or '27',
            # retail even with a GSTIN: a wholesale customer must carry a drug licence number (Customer.clean), which Marg does not
            # have, and the customer could then never be edited and saved
            customer_type='RETAIL', outstanding=amount if dr_cr == 'Dr' else ZERO,
        ))
    for mobile in sorted(names_of):
        if mobile in used:
            continue
        named = [(n, c) for n, c in names_of[mobile].items() if n]
        name = max(named, key=lambda nc: (nc[1], len(nc[0])))[0] if named else f'Customer {mobile}'
        plan.customers.append(dict(name=name[:255], phone=mobile, customer_type='RETAIL', state_code='27'))

    for key, lp in plan.ledgers.items():
        if lp.role != 'supplier':
            continue
        gstin = valid_gstin(lp.marg.gstin)
        amount, dr_cr = side(lp.opening)
        plan.suppliers[key] = dict(
            name=lp.marg.name[:255], gstin=gstin or None, address=lp.marg.address, state=lp.marg.state,
            state_code=state_code(gstin, lp.marg.state) or None, opening_balance=amount, balance_type=dr_cr.upper(), is_active=True,
        )

    if sheet is not None:
        _plan_batch_suppliers(plan, sheet)
    return plan


def _plan_batch_suppliers(plan, sheet):
    by_key = {name_key(n): k for k, n in ((k, s['name']) for k, s in plan.suppliers.items())}
    rows = {(name_key(r.name), norm(r.batch or 'NO-BATCH')): r.supplier for r in sheet.rows}
    for b in Batch.objects.filter(outlet=plan.outlet, is_active=True).select_related('product'):
        supplier = rows.get((name_key(b.product.name if b.product else ''), norm(b.batch_no)))
        if not supplier:
            continue
        key = norm(supplier) if norm(supplier) in plan.suppliers else by_key.get(name_key(supplier))
        if key:
            plan.batch_suppliers.append((b.id, key))
        else:
            plan.unknown_suppliers[supplier] += 1


# ── delete ───────────────────────────────────────────────────────────────────────────────────────────────────────

# (model, filter to this outlet). Order matters only where a row PROTECTs another; cascades take the lines with them.
PURGE = [
    ('billing.SalesReturn', 'outlet'),
    ('billing.ReceiptAllocation', 'invoice__outlet'),
    ('billing.PaymentAllocation', 'invoice__outlet'),
    ('accounts.CreditNote', 'outlet'),
    ('accounts.DebitNote', 'outlet'),
    ('billing.BillRevision', 'outlet'),
    ('billing.Quotation', 'outlet'),
    ('billing.DraftInvoice', 'outlet'),
    ('billing.SaleInvoice', 'outlet'),
    ('purchases.PurchaseInvoice', 'outlet'),
    ('accounts.Voucher', 'outlet'),
    ('accounts.JournalEntry', 'outlet'),
    ('billing.InvoicePayment', 'outlet'),
    ('billing.LedgerEntry', 'outlet'),
    ('billing.ReceiptEntry', 'outlet'),
    ('billing.PaymentEntry', 'outlet'),
    ('billing.ExpenseEntry', 'outlet'),
    ('billing.CreditAccount', 'outlet'),
    ('billing.NotificationLog', 'outlet'),
    ('accounts.PostDatedCheque', 'customer__outlet'),
    ('reports.DailyCashReport', 'outlet'),
]
# Kept: staff, outlet settings, MediFlow's built-in groups and ledgers, Phase 1 stock and its stock ledger, POs (refused
# if any exist: they point at suppliers), fixed monthly expenses, the audit trail, GST returns data.
REFUSE_IF_PRESENT = [('purchases.PurchaseOrder', 'outlet'), ('inventory.StockAdjustment', 'outlet')]


def purge(outlet) -> dict:
    from .apply import ImportRefused
    for label, path in REFUSE_IF_PRESENT:
        n = django_apps.get_model(label)._base_manager.filter(**{path: outlet}).count()
        if n:
            raise ImportRefused(f'{outlet.name} has {n} {label} row(s); they would block or lose data. Settle them first.')
    done = Counter()
    for label, path in PURGE:
        _, per_model = django_apps.get_model(label)._base_manager.filter(**{path: outlet}).delete()
        for m, n in per_model.items():
            done[m] += n
    customers = Customer.objects.filter(outlet=outlet)
    _, per_model = customers.filter(account_holder__isnull=False).delete()     # family members before their account
    done.update(per_model)
    _, per_model = customers.delete()
    done.update(per_model)
    _, per_model = Distributor.objects.filter(outlet=outlet).delete()
    done.update(per_model)
    _, per_model = Ledger.objects.filter(outlet=outlet).exclude(id__in=builtin_ledgers(outlet).values('id')).delete()
    done.update(per_model)
    builtin_ledgers(outlet).update(opening_balance=ZERO, current_balance=ZERO)
    builtin_ledgers(outlet).filter(group__nature__in=('asset', 'expense')).update(balance_type='Dr')
    builtin_ledgers(outlet).exclude(group__nature__in=('asset', 'expense')).update(balance_type='Cr')
    # a built-in ledger an earlier run put in a Marg sub-group (Bad Debts in PROVISIONS) goes back to the built-in group above it
    for l in builtin_ledgers(outlet).filter(group__is_system=False).select_related('group'):
        g, seen = l.group, set()
        while g is not None and not g.is_system and g.id not in seen:
            seen.add(g.id)
            g = g.parent
        l.group = g or LedgerGroup.objects.get(outlet=outlet, name=FALLBACK)
        l.save(update_fields=['group'])
    LedgerGroup.objects.filter(outlet=outlet, is_system=False).update(parent=None)
    _, per_model = LedgerGroup.objects.filter(outlet=outlet, is_system=False).delete()
    done.update(per_model)
    # the batches Phase 1 switched off because old bills pointed at them: nothing points at them any more
    stale = Batch.objects.filter(outlet=outlet, is_active=False, qty_strips=0, qty_loose=0)
    referenced = set()
    for rel in Batch._meta.related_objects:
        if rel.related_model is not StockLedger:
            referenced.update(rel.related_model._base_manager.filter(**{f'{rel.field.name}__in': stale}).values_list(f'{rel.field.name}_id', flat=True))
    StockLedger.objects.filter(batch__in=stale).update(batch=None)
    _, per_model = stale.exclude(id__in=referenced).delete()
    done.update(per_model)
    return dict(done)


def tidy_twins(items) -> int:
    """
    Products of this item list that the catalogue holds twice (Marg's XML drops `*`): a copy nothing at all points at
    any more (no outlet's batch, purchase line, alias, PO...) is deleted. The copy in use stays.
    """
    keys = {name_key(it.name) for it in items}
    groups = defaultdict(list)
    for p in MasterProduct.objects.only('id', 'name'):
        if name_key(p.name) in keys:
            groups[name_key(p.name)].append(p.id)
    ids = [i for v in groups.values() if len(v) > 1 for i in v]
    used = set()
    for rel in MasterProduct._meta.related_objects:
        used.update(rel.related_model._base_manager.filter(**{f'{rel.field.name}__in': ids}).values_list(f'{rel.field.name}_id', flat=True))
    doomed = []
    for v in groups.values():
        if len(v) > 1:
            keep = [i for i in v if i in used] or v[:1]
            doomed += [i for i in v if i not in keep and i not in used]
    MasterProduct.objects.filter(id__in=doomed).delete()
    return len(doomed)


# ── rebuild ──────────────────────────────────────────────────────────────────────────────────────────────────────

def rebuild(plan: PartyPlan) -> dict:
    outlet = plan.outlet
    groups = builtin_groups(outlet)
    for label in plan.group_order:
        parent, nature = plan.groups[label]
        groups[label] = LedgerGroup.objects.create(outlet=outlet, name=label[:100], parent=groups[parent], nature=nature, is_system=False)

    suppliers = {k: Distributor.objects.create(outlet=outlet, **v) for k, v in plan.suppliers.items()}
    customers = {}
    made = []
    for c in plan.customers:
        c = dict(c)
        key = c.pop('ledger', None)
        obj = Customer(outlet=outlet, **c)
        made.append(obj)
        if key:
            customers[key] = obj
    Customer.objects.bulk_create(made, batch_size=1000)

    builtin_l = {l.name: l for l in builtin_ledgers(outlet).select_related('group')}
    new = []
    merged = 0
    for key, lp in plan.ledgers.items():
        group = groups[lp.group]
        amount, dr_cr = opening_side(lp.opening, group.nature)
        if lp.into_builtin:
            l = builtin_l.get(lp.into_builtin)
            if l is None:
                l = builtin_l[lp.into_builtin] = Ledger.objects.create(
                    outlet=outlet, name=lp.into_builtin, group=group, balance_type='Dr', is_system=True)
            if l.opening_balance:      # two Marg ledgers landed on one built-in (CASH + a payment mode): add them up
                prev = natural_balance(l.opening_balance, l.balance_type, l.group.nature)
                total = prev + natural_balance(amount, dr_cr, group.nature)
                amount, dr_cr = abs(total), ('Dr' if (total >= 0) == (group.nature in ('asset', 'expense')) else 'Cr')
            l.group, l.opening_balance, l.balance_type = group, amount, dr_cr
            l.current_balance = natural_balance(amount, dr_cr, group.nature)
            l.save(update_fields=['group', 'opening_balance', 'balance_type', 'current_balance'])
            merged += 1
            continue
        m = lp.marg
        gstin = valid_gstin(m.gstin)
        new.append(Ledger(
            outlet=outlet, name=m.name[:255], group=group, opening_balance=amount, balance_type=dr_cr,
            current_balance=natural_balance(amount, dr_cr, group.nature), gstin=gstin, address=m.address, state=m.state[:50],
            pincode=m.pincode[:10], pan_no=valid_pan(m.pan), ledger_type='registered' if gstin else 'unregistered',
            linked_customer=customers.get(key), linked_distributor=suppliers.get(key), is_system=False,
        ))
    Ledger.objects.bulk_create(new, batch_size=500)

    linked = 0
    for batch_id, key in plan.batch_suppliers:
        linked += Batch.objects.filter(id=batch_id).update(supplier=suppliers[key])
    return {'groups_created': len(plan.group_order), 'ledgers_created': len(new), 'ledgers_merged_into_builtin': merged,
            'suppliers_created': len(suppliers), 'customers_created': len(made), 'batches_given_a_supplier': linked}


# ── check ────────────────────────────────────────────────────────────────────────────────────────────────────────

def verify(plan: PartyPlan) -> dict:
    from .apply import ImportRefused
    outlet, problems = plan.outlet, []
    left = {label: django_apps.get_model(label)._base_manager.filter(**{path: outlet}).count() for label, path in PURGE}
    left = {k: v for k, v in left.items() if v}
    if left:
        problems.append(f'rows left after the delete: {left}')

    ledgers = {norm(l.name): l for l in Ledger.objects.filter(outlet=outlet).select_related('group', 'linked_customer', 'linked_distributor')}
    dr = cr = ZERO
    for l in ledgers.values():
        if l.balance_type == 'Dr':
            dr += l.opening_balance
        else:
            cr += l.opening_balance
    want = plan.totals()
    if (dr, cr) != (want['opening_dr'], want['opening_cr']):
        problems.append(f"opening balances: database Dr {dr} / Cr {cr}, Marg Dr {want['opening_dr']} / Cr {want['opening_cr']}")
    for key, lp in plan.ledgers.items():
        l = ledgers.get(norm(lp.into_builtin) if lp.into_builtin else key)
        if l is None:
            problems.append(f'ledger missing: {lp.marg.name}')
            continue
        if lp.role == 'customer' and not (l.linked_customer and l.group.name == 'Sundry Debtors'):
            problems.append(f'{lp.marg.name}: not a customer ledger under Sundry Debtors')
        if lp.role == 'supplier' and not (l.linked_distributor and l.group.name == 'Sundry Creditors'):
            problems.append(f'{lp.marg.name}: not a supplier ledger under Sundry Creditors')
    dupes = [n for n, c in Counter(norm(n) for n in LedgerGroup.objects.filter(outlet=outlet).values_list('name', flat=True)).items() if c > 1]
    if dupes:
        problems.append(f'two groups with the same name: {dupes[:5]}')
    customers = Customer.objects.filter(outlet=outlet).count()
    if customers != len(plan.customers):
        problems.append(f'{customers} customers, the plan has {len(plan.customers)}')
    if problems:
        raise ImportRefused('The result does not add up: ' + '; '.join(problems[:12]))
    return {'opening_dr': dr, 'opening_cr': cr, 'ledgers': len(ledgers), 'customers': customers,
            'suppliers': Distributor.objects.filter(outlet=outlet).count()}


def outlet_stock_fingerprint(outlet) -> dict:
    """Phase 1's stock, which Phase 2 must not move (only the batch's supplier is filled in)."""
    live = Batch.objects.filter(outlet=outlet, is_active=True)
    return {**live.aggregate(n=Count('id'), packs=Sum('qty_strips'), loose=Sum('qty_loose'), landing=Sum('landing_rate'), mrp=Sum('mrp')),
            'opening_rows': StockLedger.objects.filter(outlet=outlet).aggregate(n=Count('id'), v=Sum('value_in'))}


def others_fingerprint(outlet) -> dict:
    from .apply import others_fingerprint as stock_side
    out = stock_side(outlet)
    for label in ('accounts.Customer', 'accounts.Ledger', 'accounts.LedgerGroup', 'purchases.Distributor', 'accounts.Voucher',
                  'accounts.JournalEntry', 'billing.SaleInvoice', 'purchases.PurchaseInvoice', 'billing.SalesReturn'):
        out[label] = django_apps.get_model(label)._base_manager.filter(~Q(outlet=outlet)).count()
    out['ledger opening sum'] = Ledger.objects.filter(~Q(outlet=outlet)).aggregate(s=Sum('opening_balance'))['s']
    return out
