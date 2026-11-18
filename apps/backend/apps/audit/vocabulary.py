"""
The controlled list of things the audit trail records, and how each reads as a sentence.

EVERY event has a `code` from CODES. The code decides the category (money / stock / people / settings / data / documents), the
default severity and the sentence ("Asha cancelled bill INV-2026-001751 (₹1,240)"). Add a new kind of event here, once; the
screens, the filters, the export and the rules all read this file. Wording is the same everywhere because it is written here.

`render()` never raises: a missing value becomes "…" and an unknown code becomes a generic line, so describing an event can
never break the action that caused it.
"""
from dataclasses import dataclass
from string import Formatter

CATEGORIES = {
    'money': 'Money', 'stock': 'Stock', 'people': 'People and access', 'settings': 'Settings', 'data': 'Data', 'documents': 'Documents', 'other': 'Other',
}

SEVERITIES = ('info', 'notice', 'warning', 'critical')


@dataclass(frozen=True)
class Spec:
    category: str
    label: str                  # short noun phrase, for filters and the export
    template: str               # "{actor} cancelled bill {entity}{amount_text}"
    severity: str = 'info'
    module: str = ''


# {actor} {entity} {amount_text} {reason_text_part} come from the recorder; anything else from metadata (e.g. {count}, {from_}, {to}).
CODES = {
    # ── money ──
    'bill.created': Spec('money', 'Bill created', '{actor} created bill {entity}{amount_text}{pay_text}', 'info', 'billing'),
    'bill.edited': Spec('money', 'Bill edited', '{actor} edited bill {entity}{amount_text}{reason_part}', 'notice', 'billing'),
    'bill.reissued': Spec('money', 'Bill cancelled and re-issued', '{actor} cancelled and re-issued bill {entity}{amount_text}{reason_part}', 'warning', 'billing'),
    'bill.corrected_after_payment': Spec('money', 'Paid bill corrected', '{actor} corrected paid bill {entity}{amount_text}{reason_part}', 'warning', 'billing'),
    'bill.cancelled': Spec('money', 'Bill cancelled', '{actor} cancelled bill {entity}{amount_text}{reason_part}', 'warning', 'billing'),
    'bill.printed': Spec('documents', 'Bill printed', '{actor} printed bill {entity}', 'info', 'billing'),
    'discount.given': Spec('money', 'Discount given', '{actor} gave a {pct}% discount on bill {entity}{amount_text}', 'notice', 'billing'),
    'return.created': Spec('money', 'Sale return', '{actor} recorded a return {entity}{amount_text}{reason_part}', 'notice', 'billing'),
    'return.manual_override': Spec('money', 'Return without a bill', '{actor} made a return {entity} without the usual checks{amount_text}{reason_part}', 'warning', 'billing'),
    'payment.received': Spec('money', 'Payment received', '{actor} received a payment from {entity}{amount_text}', 'info', 'billing'),
    'credit_limit.changed': Spec('money', 'Credit limit changed', '{actor} changed the credit limit of {entity} from {from_} to {to}', 'notice', 'billing'),
    'purchase.created': Spec('money', 'Purchase recorded', '{actor} recorded purchase {entity}{amount_text}', 'info', 'purchases'),
    'purchase.edited': Spec('money', 'Purchase edited', '{actor} edited purchase {entity}{amount_text}{reason_part}', 'notice', 'purchases'),
    'voucher.created': Spec('money', 'Voucher created', '{actor} created voucher {entity}{amount_text}', 'info', 'accounts'),
    'voucher.edited': Spec('money', 'Voucher edited', '{actor} edited voucher {entity}{amount_text}{reason_part}', 'notice', 'accounts'),
    'debit_note.edited': Spec('money', 'Debit note edited', '{actor} edited debit note {entity}{amount_text}{reason_part}', 'notice', 'accounts'),
    'sale_return.edited': Spec('money', 'Sale return edited', '{actor} edited sale return {entity}{amount_text}{reason_part}', 'notice', 'billing'),
    # ── stock ──
    'stock.adjusted': Spec('stock', 'Stock adjusted', '{actor} adjusted the stock of {entity} ({detail}){reason_part}', 'notice', 'inventory'),
    'stock.written_off': Spec('stock', 'Stock written off', '{actor} wrote off {entity}{amount_text}{reason_part}', 'warning', 'inventory'),
    'stock.bulk_written_off': Spec('stock', 'Bulk stock write-off', '{actor} removed {count} batches from stock{amount_text}{reason_part}', 'warning', 'inventory'),
    'batch.edited': Spec('stock', 'Batch edited', '{actor} edited batch {entity} ({detail})', 'info', 'inventory'),
    'product.edited': Spec('stock', 'Product edited', '{actor} edited product {entity}', 'info', 'inventory'),
    'supplier.assigned': Spec('stock', 'Supplier assigned', '{actor} set the supplier of {count} batch(es) to {entity}', 'info', 'inventory'),
    'ledger.repaired': Spec('stock', 'Stock ledger repaired', '{actor} repaired the stock ledger of {count} batches', 'notice', 'inventory'),
    # ── people and access ──
    'login.succeeded': Spec('people', 'Signed in', '{actor} signed in{device_part}', 'info', 'auth'),
    'login.failed': Spec('people', 'Failed sign-in', 'Failed sign-in for {entity}{device_part}', 'notice', 'auth'),
    'logout': Spec('people', 'Signed out', '{actor} signed out', 'info', 'auth'),
    'staff.created': Spec('people', 'Staff added', '{actor} added {entity} as {role}', 'notice', 'staff'),
    'staff.edited': Spec('people', 'Staff edited', '{actor} edited {entity}', 'info', 'staff'),
    'staff.role_changed': Spec('people', 'Role or access changed', '{actor} changed the role of {entity} from {from_} to {to}', 'warning', 'staff'),
    'staff.pin_changed': Spec('people', 'PIN or password changed', '{actor} changed the {what} of {entity}', 'notice', 'staff'),
    'staff.deactivated': Spec('people', 'Staff removed', '{actor} removed {entity}', 'notice', 'staff'),
    'staff.reactivated': Spec('people', 'Staff reactivated', '{actor} reactivated {entity}', 'warning', 'staff'),
    # ── settings ──
    'settings.changed': Spec('settings', 'Settings changed', '{actor} changed {what}', 'notice', 'settings'),
    'settings.secret_changed': Spec('settings', 'Key or secret changed', '{actor} changed {what} (the value is not recorded)', 'warning', 'settings'),
    'audit.policy_changed': Spec('settings', 'Audit settings changed', '{actor} changed the audit settings ({what})', 'notice', 'audit'),
    # ── data ──
    'data.exported': Spec('data', 'Data exported', '{actor} exported {what} ({count} rows)', 'info', 'data'),
    'data.imported': Spec('data', 'Data imported', '{actor} imported {what} ({count} rows)', 'notice', 'data'),
    'audit.exported': Spec('data', 'Audit trail exported', '{actor} exported the audit trail ({count} rows)', 'notice', 'audit'),
    'audit.purged': Spec('data', 'Old audit records removed', 'Audit records older than {days} days were removed ({count} rows)', 'info', 'audit'),
    'audit.flag_reviewed': Spec('other', 'Flag reviewed', '{actor} marked a flag as {status}: {entity}', 'info', 'audit'),
}

# What older code recorded, as (module, action) or (module, action, entity_type) -> code. Used by the backfill, the orchestrator and log_activity.
LEGACY = {
    ('auth', 'LOGIN'): 'login.succeeded', ('auth', 'LOGIN_FAILED'): 'login.failed', ('auth', 'LOGOUT'): 'logout',
    ('staff', 'CREATE'): 'staff.created', ('staff', 'UPDATE'): 'staff.edited', ('staff', 'DELETE'): 'staff.deactivated',
    ('inventory', 'ADJUST'): 'stock.adjusted', ('inventory', 'UPDATE', 'Batch'): 'batch.edited', ('inventory', 'UPDATE', 'Product'): 'product.edited',
    ('inventory', 'UPDATE', 'MasterProduct'): 'product.edited', ('inventory', 'UPDATE'): 'batch.edited',
    ('billing', 'PRINT'): 'bill.printed', ('payments', 'CREATE'): 'payment.received', ('billing', 'UPDATE'): 'bill.edited',
    ('billing', 'standard_correction'): 'bill.edited', ('billing', 'direct_revise'): 'bill.edited', ('billing', 'correction'): 'bill.edited',
    ('billing', 'financial_change'): 'bill.edited', ('billing', 'paid_bill_correction'): 'bill.corrected_after_payment',
    ('billing', 'cancel_reissue'): 'bill.reissued', ('billing', 'cancel_and_reissue'): 'bill.reissued', ('billing', 'return_aware_correction'): 'bill.edited',
    ('billing', 'create_manual_override_return'): 'return.manual_override',
    ('purchases', 'CREATE'): 'purchase.created', ('purchases', 'UPDATE'): 'purchase.edited',
    ('accounts', 'CREATE'): 'voucher.created', ('accounts', 'UPDATE'): 'voucher.edited',
}


def infer_code(module: str, action: str, entity_type: str = '') -> str:
    """The code for something an older call site recorded. '' when we do not know it (the row then keeps its own wording)."""
    m, a = (module or '').lower(), action or ''
    for key in ((m, a, entity_type), (m, a), (m, a.upper(), entity_type), (m, a.upper())):
        if key in LEGACY:
            return LEGACY[key]
    return ''


def spec_of(code: str):
    return CODES.get(code)


def category_of(code: str, module: str = '') -> str:
    s = CODES.get(code)
    if s:
        return s.category
    return {'billing': 'money', 'purchases': 'money', 'accounts': 'money', 'inventory': 'stock', 'auth': 'people', 'staff': 'people',
            'settings': 'settings', 'core': 'settings'}.get((module or '').lower(), 'other')


class _Safe(dict):
    def __missing__(self, key):
        return '…'


def money(value) -> str:
    """₹1,24,000 / ₹1,240.50: Indian digit grouping, no trailing .00."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return ''
    whole, _, frac = f'{abs(v):.2f}'.partition('.')
    head, tail = whole[:-3], whole[-3:]
    while len(head) > 2:
        head, tail = head[:-2], head[-2:] + ',' + tail
    grouped = (head + ',' + tail) if head else tail
    return ('-' if v < 0 else '') + '₹' + grouped + ('' if frac == '00' else '.' + frac)


def render(code: str, ctx: dict) -> str:
    """The sentence for an event. `ctx` holds actor, entity, amount, reason and anything the template names. Never raises."""
    try:
        spec = CODES.get(code)
        actor = (ctx.get('actor') or 'Someone').strip() or 'Someone'
        entity = (ctx.get('entity') or '').strip()
        amount = ctx.get('amount')
        parts = _Safe(ctx)
        parts.update(
            actor=actor, entity=entity or 'a record',
            amount_text=f' ({money(amount)})' if amount not in (None, '') and money(amount) else '',
            reason_part=f'. Reason: "{ctx["reason"]}"' if ctx.get('reason') else '',
            device_part=f' on {ctx["device"]}' if ctx.get('device') else '',
            pay_text=f', paid by {ctx["payment_mode"]}' if ctx.get('payment_mode') else '',
        )
        for k in ('from_', 'to', 'detail', 'what', 'count', 'role', 'pct', 'status', 'days'):
            parts.setdefault(k, '…')
        if spec:
            return ' '.join(Formatter().vformat(spec.template, (), parts).split())
        label = (ctx.get('label') or code or 'did something').replace('_', ' ').replace('.', ' ')
        return f'{actor}: {label}{" " + entity if entity else ""}'.strip()
    except Exception:
        return f'{ctx.get("actor") or "Someone"}: {code or "an action"}'
