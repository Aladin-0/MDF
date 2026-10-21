"""
Journal Service: Auto-posts double-entry accounting journal entries
for sales, purchases, vouchers, and credit payment collections.

All functions use transaction.atomic() for all-or-nothing consistency.
"""

import logging
from decimal import Decimal

from django.db import models, transaction

from apps.accounts.models import JournalEntry, JournalLine, Ledger, LedgerGroup
from apps.accounts.services import LedgerService

logger = logging.getLogger(__name__)


# ── Standard GST rate mapping ──────────────────────────────────────────────────
# Maps total GST rate → (CGST component rate, SGST component rate)
# Both components are equal halves of the total rate.
GST_RATE_TO_COMPONENTS = {
    Decimal('5'):  (Decimal('2.5'), Decimal('2.5')),
    Decimal('12'): (Decimal('6'),   Decimal('6')),
    Decimal('18'): (Decimal('9'),   Decimal('9')),
    Decimal('28'): (Decimal('14'),  Decimal('14')),
    Decimal('40'): (Decimal('20'),  Decimal('20')),
}

# Standard rates for snapping purchase invoice inferred rates
STANDARD_GST_RATES = [Decimal('5'), Decimal('12'), Decimal('18'), Decimal('28'), Decimal('40')]

# Outlet home state (Maharashtra). Used as fallback when outlet.state can't be read.
_DEFAULT_HOME_STATE = 'Maharashtra'


def _is_interstate(party_state: str, outlet_state: str) -> bool:
    """
    Return True if the transaction is INTERSTATE (→ IGST applies).
    Return False if INTRASTATE (→ CGST + SGST applies).

    Rules:
      - Both states must be non-empty for a definitive comparison.
      - If either state is blank/None → default to INTRASTATE (safe fallback, no IGST crash).
      - Comparison is case-insensitive and strips whitespace.
    """
    if not party_state or not outlet_state:
        return False  # safe fallback: intrastate
    return party_state.strip().lower() != outlet_state.strip().lower()


def _normalize_ledger_name(s: str) -> str:
    import re
    return re.sub(r'[^A-Z0-9%]', '', (s or '').upper())


def _resolve_system_ledger(outlet, name: str):
    """
    Robust resolver for system ledgers that handles:
    1. Case-insensitive exact match (e.g. 'Cash' -> 'CASH', 'Round Off' -> 'ROUND OFF')
    2. Normalized alphanumeric match (e.g. 'GST Payable CGST' -> 'GST PAYABLE (CGST)')
    3. Context-aware alias fallback:
       - 'Cash': any ledger under 'Cash in Hand'
       - 'Sales Account': 'Sales', 'SALE A/C', or created in 'Sales Accounts' group
       - 'Purchase Account': 'PURCHASE A/C', 'Purchase', or created in 'Purchase Accounts' group
       - 'Purchase Returns': 'PURCHASE RETURN ENTRY...', or fallback to Purchase Account
       - 'UPI Collections': 'PAYTM PHONE PAY', or any bank account, or fallback to Cash
       - 'Card/POS Settlement': 'SWIPE CARD', or any bank account, or fallback to Cash
       - 'Round Off': 'ROUND OFF', 'SHORT & EXESS', or created in 'Direct Expenses'
       - Rate-specific GST (e.g. 'CGST Payable 2.5%'): 'CGST SALES TAX 2.5 %', etc.
    """
    if not name or not outlet:
        return None

    qs = Ledger.objects.filter(outlet=outlet)

    # 1. Exact case-insensitive match
    match = qs.filter(name__iexact=name).first()
    if match:
        return match

    # 2. Normalized alphanumeric match
    target_norm = _normalize_ledger_name(name)
    if target_norm:
        for l in qs:
            if _normalize_ledger_name(l.name) == target_norm:
                return l

    # 3. Role-based alias heuristics
    name_upper = name.upper()

    # Cash
    if 'CASH' in name_upper:
        cash_l = qs.filter(group__name='Cash in Hand').first()
        if cash_l:
            return cash_l

    # Sales Account
    if 'SALES' in name_upper:
        sales_l = qs.filter(name__iexact='Sales Account').first() or qs.filter(name__iexact='Sales').first()
        if not sales_l:
            sales_grp = LedgerGroup.objects.filter(outlet=outlet, name__in=['Sales Accounts', 'Sales Account']).first()
            if not sales_grp:
                sales_grp = LedgerGroup.objects.create(outlet=outlet, name='Sales Accounts', nature='income', is_system=True)
            sales_l, _ = Ledger.objects.get_or_create(
                outlet=outlet,
                name='Sales Account',
                defaults={'group': sales_grp, 'balance_type': 'Cr', 'is_system': True}
            )
        return sales_l

    # Purchase Account
    if 'PURCHASE' in name_upper and 'RETURN' not in name_upper:
        pur_l = qs.filter(name__iexact='PURCHASE A/C').first() or qs.filter(name__iexact='Purchase Account').first() or qs.filter(name__iexact='Purchase').first()
        if not pur_l:
            pur_l = qs.filter(group__name__in=['Purchase Accounts', 'Purchase Account', 'Purchase']).first()
        if not pur_l:
            pur_grp = LedgerGroup.objects.filter(outlet=outlet, name__in=['Purchase Accounts', 'Purchase Account']).first()
            if not pur_grp:
                pur_grp = LedgerGroup.objects.create(outlet=outlet, name='Purchase Accounts', nature='expense', is_system=True)
            pur_l, _ = Ledger.objects.get_or_create(
                outlet=outlet,
                name='Purchase Account',
                defaults={'group': pur_grp, 'balance_type': 'Dr', 'is_system': True}
            )
        return pur_l

    # Purchase Returns
    if 'PURCHASE' in name_upper and 'RETURN' in name_upper:
        ret_l = qs.filter(name__icontains='PURCHASE RETURN').first()
        if ret_l:
            return ret_l
        return _resolve_system_ledger(outlet, 'Purchase Account')

    # UPI Collections
    if 'UPI' in name_upper or 'ONLINE' in name_upper:
        upi_l = (
            qs.filter(group__name__in=['Bank Accounts', 'Bank Account'], name__icontains='PHONE PAY').first() or
            qs.filter(group__name__in=['Bank Accounts', 'Bank Account'], name__icontains='PAYTM').first() or
            qs.filter(group__name__in=['Bank Accounts', 'Bank Account'], name__icontains='UPI').first() or
            qs.filter(group__name__in=['Bank Accounts', 'Bank Account']).first()
        )
        if upi_l:
            return upi_l
        return _resolve_system_ledger(outlet, 'Cash')

    # Card / POS Settlement
    if 'CARD' in name_upper or 'POS' in name_upper or 'SWIPE' in name_upper:
        card_l = qs.filter(group__name__in=['Bank Accounts', 'Bank Account']).filter(
            models.Q(name__icontains='SWIPE') | models.Q(name__icontains='CARD') | models.Q(name__icontains='POS')
        ).first()
        if not card_l:
            card_l = qs.filter(group__name__in=['Bank Accounts', 'Bank Account']).first()
        if card_l:
            return card_l
        return _resolve_system_ledger(outlet, 'Cash')

    # Round Off
    if 'ROUND' in name_upper:
        ro_l = qs.filter(name__icontains='ROUND').first()
        if not ro_l:
            ro_l = qs.filter(name__iexact='SHORT & EXESS').first()
        if not ro_l:
            exp_grp = LedgerGroup.objects.filter(outlet=outlet, name__in=['Direct Expenses', 'Indirect Incomes', 'Indirect Expenses']).first()
            if not exp_grp:
                exp_grp = LedgerGroup.objects.create(outlet=outlet, name='Direct Expenses', nature='expense', is_system=True)
            ro_l, _ = Ledger.objects.get_or_create(
                outlet=outlet,
                name='Round Off',
                defaults={'group': exp_grp, 'balance_type': 'Cr', 'is_system': True}
            )
        return ro_l

    # GST Payables (Rate specific or generic)
    if 'CGST' in name_upper or 'SGST' in name_upper or 'IGST' in name_upper:
        tax_type = 'CGST' if 'CGST' in name_upper else ('SGST' if 'SGST' in name_upper else 'IGST')
        import re
        rate_match = re.search(r'(\d+(?:\.\d+)?)', name)
        rate_str = rate_match.group(1) if rate_match else None

        if rate_str:
            gst_rate_l = qs.filter(name__icontains=tax_type).filter(name__icontains='SALES').filter(name__icontains=rate_str).first()
            if not gst_rate_l:
                gst_rate_l = qs.filter(name__icontains=tax_type).filter(name__icontains=rate_str).first()
            if gst_rate_l:
                return gst_rate_l

        # Generic GST fallback e.g. 'GST PAYABLE (CGST)'
        generic_l = qs.filter(name__icontains=tax_type).filter(name__icontains='PAYABLE').first()
        if not generic_l:
            generic_l = qs.filter(group__name__in=['Duties & Taxes', 'Duties and Taxes']).filter(name__icontains=tax_type).first()
        if generic_l:
            return generic_l

        dt_grp = LedgerGroup.objects.filter(outlet=outlet, name__in=['Duties & Taxes', 'Duties and Taxes']).first()
        if not dt_grp:
            dt_grp = LedgerGroup.objects.create(outlet=outlet, name='Duties & Taxes', nature='liability', is_system=True)
        gen_name = f"GST Payable ({tax_type})"
        created_l, _ = Ledger.objects.get_or_create(
            outlet=outlet,
            name=gen_name,
            defaults={'group': dt_grp, 'balance_type': 'Cr', 'is_system': True}
        )
        return created_l

    return None


def _get_ledger(outlet, name):
    """
    Fetch a system ledger by name within an outlet with smart alias matching.
    Raises Ledger.DoesNotExist with a clear message if not found.
    """
    ledger = _resolve_system_ledger(outlet, name)
    if ledger:
        return ledger
    raise Ledger.DoesNotExist(
        f"Ledger '{name}' not found for outlet '{outlet.name}' ({outlet.id}). "
        f"Run: python manage.py seed_ledgers"
    )


def _get_ledger_safe(outlet, name, fallback_name=None):
    """
    Fetch a ledger by name, returning fallback or auto-creating before raising.
    Used for rate-specific GST and system accounts.
    """
    ledger = _resolve_system_ledger(outlet, name)
    if ledger:
        return ledger

    if fallback_name:
        fallback_l = _resolve_system_ledger(outlet, fallback_name)
        if fallback_l:
            return fallback_l

    logger.warning(
        f"GST/System ledger '{name}' (fallback: '{fallback_name}') not found "
        f"for outlet '{outlet.name}'."
    )
    raise ValueError(f"Required GST/System ledger '{name}' not found")


def _snap_to_standard_rate(rate):
    """
    Round a computed GST rate to the nearest standard rate (5, 12, 18, 28, 40).
    Used when inferring rate from purchase invoice totals.
    Returns None if the rate is too far from any standard rate.
    """
    if rate <= 0:
        return None
    closest = min(STANDARD_GST_RATES, key=lambda r: abs(r - rate))
    # Accept if within 1 percentage point of a standard rate
    if abs(closest - rate) <= Decimal('1'):
        return closest
    return None


def _get_customer_ledger(outlet, customer):
    """Fetch the Sundry Debtors ledger for a customer (via linked_customer FK or exact name)."""
    if not customer:
        return None
    l = Ledger.objects.filter(
        outlet=outlet, linked_customer=customer
    ).first()
    if not l and hasattr(customer, 'name') and customer.name:
        l = Ledger.objects.filter(
            outlet=outlet, name__iexact=customer.name
        ).first()
    return l


def _get_distributor_ledger(outlet, distributor):
    """Fetch the Sundry Creditors ledger for a distributor (via linked_distributor FK or exact name)."""
    if not distributor:
        return None
    l = Ledger.objects.filter(
        outlet=outlet, linked_distributor=distributor
    ).first()
    if not l and hasattr(distributor, 'name') and distributor.name:
        l = Ledger.objects.filter(
            outlet=outlet, name__iexact=distributor.name
        ).first()
    return l


def _guard_double_posting(outlet, source_type, source_id):
    """
    Check if JournalEntry already exists for this transaction.
    Returns True if entry exists (prevent double-posting), False if safe to post.
    """
    return JournalEntry.objects.filter(
        outlet=outlet, source_type=source_type, source_id=source_id
    ).exists()


def _create_lines_and_update_balances(je, lines):
    """Create JournalLines and update ledger current_balance for each line."""
    for item in lines:
        line_type = item[0]
        ledger = item[1]
        amount = item[2]
        desc = item[3] if len(item) > 3 else ''

        if line_type == 'debit':
            JournalLine.objects.create(
                journal_entry=je,
                ledger=ledger,
                debit_amount=amount,
                credit_amount=Decimal('0'),
                description=desc or ''
            )
            LedgerService.update_balance(ledger.id, amount, Decimal('0'))
        else:  # credit
            JournalLine.objects.create(
                journal_entry=je,
                ledger=ledger,
                debit_amount=Decimal('0'),
                credit_amount=amount,
                description=desc or ''
            )
            LedgerService.update_balance(ledger.id, Decimal('0'), amount)


def _build_sale_gst_lines(outlet, sale_invoice):
    """
    Build GST credit lines for a sale invoice, using rate-specific ledgers.

    Interstate vs Intrastate determination:
      - Read outlet.state and customer.state (from sale_invoice.customer).
      - If customer state != outlet state → INTERSTATE → IGST Payable only.
      - If same state or either state is blank → INTRASTATE → CGST + SGST Payable.
      - If igst_amount > 0 on the invoice → always force IGST path.

    Rate strategy:
      1. Read gst_rate directly from each SaleItem (no floating-point division).
      2. Group gst_amount by rate bucket to handle mixed-rate invoices.
      3. For each rate bucket, post to rate-specific ledger.
      4. If rate-specific ledger not found → fallback to generic.

    NEVER raises — errors are logged and generic fallback is used.
    """
    lines = []

    igst_amount = sale_invoice.igst_amount or Decimal('0')
    cgst_amount = sale_invoice.cgst_amount or Decimal('0')
    sgst_amount = sale_invoice.sgst_amount or Decimal('0')

    try:
        # ── Determine interstate or intrastate ──────────────────────────────
        outlet_state = getattr(outlet, 'state', '') or ''
        customer = getattr(sale_invoice, 'customer', None)
        customer_state = ''
        if customer:
            customer_state = getattr(customer, 'state', '') or ''

        interstate = _is_interstate(customer_state, outlet_state)

        if igst_amount > 0 or interstate:
            # ── INTERSTATE: post to IGST Payable ─────────────────────────
            # Use invoice-level igst_amount if > 0, otherwise use cgst+sgst total as proxy
            total_igst = igst_amount if igst_amount > 0 else (cgst_amount + sgst_amount)

            # Determine IGST rate from invoice header field
            igst_rate = sale_invoice.igst or Decimal('0')
            snapped_rate = _snap_to_standard_rate(igst_rate) if igst_rate > 0 else None

            if snapped_rate:
                igst_ledger = _get_ledger_safe(outlet, f'IGST Payable {snapped_rate}%', 'GST Payable IGST')
            else:
                # Try to infer from sale items
                try:
                    total_rate = None
                    items = list(sale_invoice.items.all())
                    rates = set()
                    for item in items:
                        r = item.gst_rate or Decimal('0')
                        if r > 0:
                            rates.add(r)
                    if len(rates) == 1:
                        total_rate = rates.pop()
                        snapped_rate = _snap_to_standard_rate(total_rate)
                except Exception:
                    pass

                if snapped_rate:
                    igst_ledger = _get_ledger_safe(outlet, f'IGST Payable {snapped_rate}%', 'GST Payable IGST')
                else:
                    igst_ledger = _get_ledger_safe(outlet, 'GST Payable IGST')

            if igst_ledger and total_igst > 0:
                lines.append(('credit', igst_ledger, total_igst))

        else:
            # ── INTRASTATE: CGST + SGST per rate bucket ───────────────────
            if cgst_amount > 0 or sgst_amount > 0:
                # Build rate-bucket map: {total_gst_rate: gst_amount}
                rate_buckets = {}
                try:
                    items = list(sale_invoice.items.all())
                    for item in items:
                        rate = item.gst_rate or Decimal('0')
                        if rate > 0:
                            gst_amt = item.gst_amount or Decimal('0')
                            rate_buckets[rate] = rate_buckets.get(rate, Decimal('0')) + gst_amt
                except Exception as e:
                    logger.warning(
                        f"Sale {sale_invoice.id}: could not read items for GST rate inference: {e}. "
                        f"Falling back to invoice-level cgst/sgst amounts."
                    )

                if rate_buckets:
                    # Post per rate bucket using rate-specific ledgers.
                    # KEY FIX: use invoice header cgst_amount/sgst_amount as the
                    # authoritative totals (they are server-re-derived), and distribute
                    # proportionally across rate buckets using item amounts as weights.
                    # This ensures sum(posted) == header totals exactly — no rounding drift.
                    header_cgst = cgst_amount  # authoritative, from invoice header
                    header_sgst = sgst_amount  # authoritative, from invoice header
                    total_item_gst = sum(v for v in rate_buckets.values() if v > 0)

                    rate_list = [(r, g) for r, g in rate_buckets.items() if g > 0]
                    posted_cgst = Decimal('0')
                    posted_sgst = Decimal('0')

                    for idx, (total_rate, bucket_gst) in enumerate(rate_list):
                        is_last = (idx == len(rate_list) - 1)

                        components = GST_RATE_TO_COMPONENTS.get(total_rate)
                        if components:
                            cgst_rate, sgst_rate = components
                        else:
                            half = (total_rate / 2).quantize(Decimal('0.01'))
                            cgst_rate, sgst_rate = half, half

                        if is_last:
                            # Last bucket absorbs remainder — guarantees exact total
                            bucket_cgst = header_cgst - posted_cgst
                            bucket_sgst = header_sgst - posted_sgst
                        elif total_item_gst > 0:
                            # Proportional split based on each bucket's share of item GST
                            proportion = bucket_gst / total_item_gst
                            bucket_cgst = (header_cgst * proportion).quantize(Decimal('0.01'))
                            bucket_sgst = (header_sgst * proportion).quantize(Decimal('0.01'))
                        else:
                            bucket_cgst = (bucket_gst / 2).quantize(Decimal('0.01'))
                            bucket_sgst = bucket_gst - bucket_cgst

                        if bucket_cgst > 0:
                            cgst_ledger = _get_ledger_safe(
                                outlet, f'CGST Payable {cgst_rate}%', 'GST Payable CGST'
                            )
                            if cgst_ledger:
                                lines.append(('credit', cgst_ledger, bucket_cgst))
                                posted_cgst += bucket_cgst

                        if bucket_sgst > 0:
                            sgst_ledger = _get_ledger_safe(
                                outlet, f'SGST Payable {sgst_rate}%', 'GST Payable SGST'
                            )
                            if sgst_ledger:
                                lines.append(('credit', sgst_ledger, bucket_sgst))
                                posted_sgst += bucket_sgst

                else:
                    # No items with rates — use invoice-level CGST/SGST totals
                    cgst_rate_pct = sale_invoice.cgst or Decimal('0')
                    sgst_rate_pct = sale_invoice.sgst or Decimal('0')

                    if cgst_rate_pct > 0:
                        cgst_ledger = _get_ledger_safe(
                            outlet, f'CGST Payable {cgst_rate_pct}%', 'GST Payable CGST'
                        )
                    else:
                        cgst_ledger = _get_ledger_safe(outlet, 'GST Payable CGST')

                    if sgst_rate_pct > 0:
                        sgst_ledger = _get_ledger_safe(
                            outlet, f'SGST Payable {sgst_rate_pct}%', 'GST Payable SGST'
                        )
                    else:
                        sgst_ledger = _get_ledger_safe(outlet, 'GST Payable SGST')

                    if cgst_amount > 0 and cgst_ledger:
                        lines.append(('credit', cgst_ledger, cgst_amount))
                    if sgst_amount > 0 and sgst_ledger:
                        lines.append(('credit', sgst_ledger, sgst_amount))

    except ValueError:
        # A required ledger was missing; re-raise to fail the save properly
        raise
    except Exception as e:
        logger.error(
            f"Sale {sale_invoice.id}: error building GST lines: {e}. "
            f"Attempting hard fallback to generic GST Payable ledgers."
        )
        # Hard fallback: generic ledgers, amounts from invoice header
        try:
            if igst_amount > 0:
                igst_ledger = _get_ledger_safe(outlet, 'GST Payable IGST')
                if igst_ledger:
                    lines = [('credit', igst_ledger, igst_amount)]
            else:
                lines = []
                if cgst_amount > 0:
                    cgst_ledger = _get_ledger_safe(outlet, 'GST Payable CGST')
                    if cgst_ledger:
                        lines.append(('credit', cgst_ledger, cgst_amount))
                if sgst_amount > 0:
                    sgst_ledger = _get_ledger_safe(outlet, 'GST Payable SGST')
                    if sgst_ledger:
                        lines.append(('credit', sgst_ledger, sgst_amount))
        except ValueError:
            raise
        except Exception as e2:
            logger.error(
                f"Sale {sale_invoice.id}: hard fallback also failed: {e2}. "
                f"No GST lines will be posted."
            )
            lines = []

    return lines


def _build_purchase_gst_lines(outlet, purchase_invoice, gst_amount, distributor_ledger=None):
    """
    Build GST debit lines for a purchase invoice, using rate-specific ledgers.

    Interstate vs Intrastate determination:
      - Read outlet.state and distributor_ledger.state.
      - If distributor_ledger state != outlet state → INTERSTATE → IGST Input only.
      - If same state or either state is blank → INTRASTATE → CGST + SGST Input.

    Rate strategy:
      - Infer total GST rate by dividing gst_amount / taxable_amount * 100.
      - Snap to nearest standard rate (5, 12, 18, 28, 40) within ±1%.
      - Post to rate-specific ledger; fallback to generic if not found.

    NEVER raises.
    """
    lines = []
    if gst_amount <= 0:
        return lines

    try:
        # ── Determine interstate or intrastate ──────────────────────────────
        outlet_state = getattr(outlet, 'state', '') or ''
        distributor_state = ''
        if distributor_ledger:
            distributor_state = getattr(distributor_ledger, 'state', '') or ''
            
        # Fallback if ledger state is empty (e.g. legacy ledgers or sync issues)
        if not distributor_state:
            distributor = getattr(purchase_invoice, 'distributor', None)
            if distributor:
                distributor_state = getattr(distributor, 'state', '') or ''
            # Hard fallback to linked_distributor
            elif distributor_ledger and getattr(distributor_ledger, 'linked_distributor', None):
                distributor_state = distributor_ledger.linked_distributor.state or ''

        interstate = _is_interstate(distributor_state, outlet_state)

        # ── Rate inference ──────────────────────────────────────────────────
        taxable = purchase_invoice.taxable_amount or Decimal('0')
        snapped_rate = None
        if taxable > 0:
            inferred_rate = (gst_amount / taxable * 100).quantize(Decimal('0.01'))
            snapped_rate = _snap_to_standard_rate(inferred_rate)

        if interstate:
            # ── INTERSTATE: post to IGST Input ──────────────────────────
            if snapped_rate and snapped_rate in GST_RATE_TO_COMPONENTS:
                # For IGST, the full rate = snapped_rate (not halved)
                igst_ledger = _get_ledger_safe(
                    outlet, f'IGST Input {snapped_rate}%', 'GST Input (IGST)'
                )
            else:
                igst_ledger = _get_ledger_safe(outlet, 'GST Input (IGST)')

            if igst_ledger:
                lines.append(('debit', igst_ledger, gst_amount))

        else:
            # ── INTRASTATE: post to CGST + SGST Input ────────────────────
            cgst_input = (gst_amount / 2).quantize(Decimal('0.01'))
            sgst_input = gst_amount - cgst_input

            if snapped_rate and snapped_rate in GST_RATE_TO_COMPONENTS:
                cgst_rate, sgst_rate = GST_RATE_TO_COMPONENTS[snapped_rate]
                cgst_ledger = _get_ledger_safe(
                    outlet, f'CGST Input {cgst_rate}%', 'GST Input (CGST)'
                )
                sgst_ledger = _get_ledger_safe(
                    outlet, f'SGST Input {sgst_rate}%', 'GST Input (SGST)'
                )
            else:
                cgst_ledger = _get_ledger_safe(outlet, 'GST Input (CGST)')
                sgst_ledger = _get_ledger_safe(outlet, 'GST Input (SGST)')

            if cgst_ledger:
                lines.append(('debit', cgst_ledger, cgst_input))
            if sgst_ledger:
                lines.append(('debit', sgst_ledger, sgst_input))

    except ValueError:
        raise
    except Exception as e:
        logger.error(
            f"Purchase {purchase_invoice.id}: error building GST input lines: {e}. "
            f"Attempting hard fallback."
        )
        try:
            cgst_c = (gst_amount / 2).quantize(Decimal('0.01'))
            sgst_c = gst_amount - cgst_c
            cgst_ledger = _get_ledger_safe(outlet, 'GST Input (CGST)')
            sgst_ledger = _get_ledger_safe(outlet, 'GST Input (SGST)')
            if cgst_ledger:
                lines.append(('debit', cgst_ledger, cgst_c))
            if sgst_ledger:
                lines.append(('debit', sgst_ledger, sgst_c))
        except ValueError:
            raise
        except Exception as e2:
            logger.error(
                f"Purchase {purchase_invoice.id}: hard fallback also failed: {e2}. "
                f"No GST input lines will be posted."
            )

    return lines


@transaction.atomic
def post_sale_invoice(sale_invoice):
    """
    Post a sale invoice to the general ledger.
    Uses individual payment fields (cash_paid, upi_paid, card_paid, credit_given)
    to support any split-payment combination.

    GST amounts are read DIRECTLY from the invoice — never recalculated.
    Rate-specific GST Payable ledgers are used (CGST Payable 9%, SGST Payable 9%, etc).
    Fallback to generic GST Payable CGST/SGST if rate-specific ledger not found.
    GST posting failure NEVER crashes the invoice save.

    Journal entry (intrastate, split-payment example):
      Dr. Cash                      invoice.cash_paid         [if > 0]
      Dr. UPI Collections           invoice.upi_paid          [if > 0]
      Dr. Card/POS Settlement       invoice.card_paid         [if > 0]
      Dr. Customer Ledger           invoice.credit_given      [if > 0]
      Cr. Sales Account             invoice.taxable_amount
      Cr. CGST Payable {rate}%      cgst portion              [intrastate]
      Cr. SGST Payable {rate}%      sgst portion              [intrastate]
      -- OR (interstate) --
      Cr. IGST Payable {rate}%      invoice.igst_amount
    """
    try:
        outlet = sale_invoice.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'SALE', sale_invoice.id):
            logger.info(f"Sale {sale_invoice.id} already journaled, skipping")
            return

        # Read all amounts directly from the invoice — never recalculate
        taxable_amount = sale_invoice.taxable_amount or Decimal('0')
        cgst_amount = sale_invoice.cgst_amount or Decimal('0')
        sgst_amount = sale_invoice.sgst_amount or Decimal('0')
        igst_amount = sale_invoice.igst_amount or Decimal('0')
        grand_total = sale_invoice.grand_total or Decimal('0')
        cash_paid = sale_invoice.cash_paid or Decimal('0')
        upi_paid = sale_invoice.upi_paid or Decimal('0')
        card_paid = sale_invoice.card_paid or Decimal('0')
        credit_given = sale_invoice.credit_given or Decimal('0')
        round_off = sale_invoice.round_off or Decimal('0')

        lines = []

        # ── DEBIT side: Multi-Tender Routing ──
        customer_ledger = None
        if sale_invoice.customer:
            customer_ledger = _get_customer_ledger(outlet, sale_invoice.customer)
            if not customer_ledger:
                raise ValueError(
                    f"Sale {sale_invoice.id}: has customer {sale_invoice.customer_id} but no customer "
                    f"ledger found. Run sync_customer_ledgers first."
                )

        # Helper to resolve tender ledger
        def _resolve_tender_ledger(p):
            if p.ledger:
                return p.ledger
            meth = (p.method or '').lower()
            if meth == 'cash':
                return _get_ledger(outlet, 'Cash')
            elif meth == 'upi':
                return _get_ledger(outlet, 'UPI Collections')
            elif meth == 'card':
                return _get_ledger(outlet, 'Card/POS Settlement')
            elif meth in ('bank_transfer', 'cheque'):
                return _get_ledger_safe(outlet, 'Bank Account', fallback_name='Cash')
            elif meth == 'credit':
                return None
            return _get_ledger(outlet, 'Cash')

        invoice_payments = list(sale_invoice.payments.all())

        def _get_method_label(meth_raw):
            meth = (meth_raw or 'Payment').upper()
            if meth == 'CASH':
                return 'Cash'
            elif meth == 'UPI':
                return 'UPI'
            elif meth == 'CARD':
                return 'Card'
            elif meth == 'CREDIT':
                return 'Credit'
            elif meth == 'CHEQUE':
                return 'Cheque'
            elif meth == 'BANK_TRANSFER':
                return 'Bank Transfer'
            return meth_raw.title() if meth_raw else 'Payment'

        if customer_ledger:
            # 1. Debit the customer for the full grand total
            invoice_desc = f"Sale Invoice {sale_invoice.invoice_no}"
            if grand_total > 0:
                lines.append(('debit', customer_ledger, grand_total, invoice_desc))
            elif grand_total < 0:
                lines.append(('credit', customer_ledger, abs(grand_total), invoice_desc))
            
            # 2. Credit the customer for instant payments and debit the respective asset accounts
            expected_paid = cash_paid + upi_paid + card_paid
            non_credit_pmts = [p for p in invoice_payments if (p.method or '').lower() != 'credit']
            payments_valid = bool(non_credit_pmts and abs(sum(p.amount for p in non_credit_pmts) - expected_paid) <= Decimal('0.05'))
            if payments_valid:
                for p in non_credit_pmts:
                    tl = _resolve_tender_ledger(p)
                    if tl and p.amount > 0:
                        meth_label = _get_method_label(p.method)
                        pay_desc = f"Payment ({meth_label}) for {sale_invoice.invoice_no}"
                        lines.append(('debit', tl, p.amount, pay_desc))
                        lines.append(('credit', customer_ledger, p.amount, pay_desc))
            else:
                if cash_paid > 0:
                    cash_ledger = _get_ledger(outlet, 'Cash')
                    c_desc = f"Payment (Cash) for {sale_invoice.invoice_no}"
                    lines.append(('debit', cash_ledger, cash_paid, c_desc))
                    lines.append(('credit', customer_ledger, cash_paid, c_desc))

                if upi_paid > 0:
                    upi_ledger = _get_ledger(outlet, 'UPI Collections')
                    u_desc = f"Payment (UPI) for {sale_invoice.invoice_no}"
                    lines.append(('debit', upi_ledger, upi_paid, u_desc))
                    lines.append(('credit', customer_ledger, upi_paid, u_desc))

                if card_paid > 0:
                    card_ledger = _get_ledger(outlet, 'Card/POS Settlement')
                    card_desc = f"Payment (Card) for {sale_invoice.invoice_no}"
                    lines.append(('debit', card_ledger, card_paid, card_desc))
                    lines.append(('credit', customer_ledger, card_paid, card_desc))
        else:
            # Fallback for walk-in (no customer attached)
            walk_in_payments_valid = bool(invoice_payments and abs(sum(p.amount for p in invoice_payments) - grand_total) <= Decimal('0.05'))
            if walk_in_payments_valid:
                for p in invoice_payments:
                    tl = _resolve_tender_ledger(p)
                    if tl and p.amount > 0:
                        meth_label = _get_method_label(p.method)
                        pay_desc = f"Sale ({meth_label}) {sale_invoice.invoice_no}"
                        lines.append(('debit', tl, p.amount, pay_desc))
            else:
                scalar_sum = cash_paid + upi_paid + card_paid
                if scalar_sum > 0:
                    if cash_paid > 0:
                        cash_ledger = _get_ledger(outlet, 'Cash')
                        lines.append(('debit', cash_ledger, cash_paid, f"Sale (Cash) {sale_invoice.invoice_no}"))

                    if upi_paid > 0:
                        upi_ledger = _get_ledger(outlet, 'UPI Collections')
                        lines.append(('debit', upi_ledger, upi_paid, f"Sale (UPI) {sale_invoice.invoice_no}"))

                    if card_paid > 0:
                        card_ledger = _get_ledger(outlet, 'Card/POS Settlement')
                        lines.append(('debit', card_ledger, card_paid, f"Sale (Card) {sale_invoice.invoice_no}"))
                elif grand_total > 0:
                    pm = (sale_invoice.payment_mode or 'cash').lower()
                    if pm == 'upi':
                        tl = _get_ledger(outlet, 'UPI Collections')
                    elif pm == 'card':
                        tl = _get_ledger(outlet, 'Card/POS Settlement')
                    else:
                        tl = _get_ledger(outlet, 'Cash')
                    lines.append(('debit', tl, grand_total, f"Sale ({pm.title()}) {sale_invoice.invoice_no}"))

        # ── CREDIT side: Sales Account ──
        sales_ledger = _get_ledger(outlet, 'Sales Account')
        lines.append(('credit', sales_ledger, taxable_amount, f"Revenue from {sale_invoice.invoice_no}"))

        # ── CREDIT side: GST — rate-specific ledgers with fallback ──
        # _build_sale_gst_lines never raises
        gst_lines = _build_sale_gst_lines(outlet, sale_invoice)
        lines.extend(gst_lines)

        # ── Handle round_off for double-entry balance ──
        if round_off > 0:
            # Invoice rounded UP: customer paid more than exact → shop gains → Cr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('credit', round_off_ledger, round_off, f"Round Off {sale_invoice.invoice_no}"))
        elif round_off < 0:
            # Invoice rounded DOWN: customer paid less than exact → shop absorbs → Dr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('debit', round_off_ledger, abs(round_off), f"Round Off {sale_invoice.invoice_no}"))

        # ── Auto-balance: absorb sub-₹0.05 floating-point GST rounding drift ──
        # Item-level gst_amount sums can drift from invoice header cgst/sgst totals
        # by a few paise due to per-item rounding. Absorb this into Round Off so
        # that correctly-computed invoices never raise a false imbalance error.
        _pre_check_dr = sum(l[2] for l in lines if l[0] == 'debit')
        _pre_check_cr = sum(l[2] for l in lines if l[0] == 'credit')
        _drift = _pre_check_cr - _pre_check_dr  # positive = Cr heavy; negative = Dr heavy
        if Decimal('0') < abs(_drift) <= Decimal('0.05'):
            try:
                _ro_ledger = _get_ledger(outlet, 'Round Off')
                if _drift > 0:
                    lines.append(('debit', _ro_ledger, _drift, 'Round Off Adjustment'))
                else:
                    lines.append(('credit', _ro_ledger, abs(_drift), 'Round Off Adjustment'))
            except Ledger.DoesNotExist:
                pass  # Let the balance check below surface the error if Round Off missing

        # ── Verify double-entry balance (strict — all amounts must balance) ──
        total_debit = sum(l[2] for l in lines if l[0] == 'debit')
        total_credit = sum(l[2] for l in lines if l[0] == 'credit')
        if abs(total_debit - total_credit) > Decimal('0.01'):
            raise ValueError(
                f"Sale {sale_invoice.id}: double-entry imbalance — "
                f"Dr ₹{total_debit} vs Cr ₹{total_credit} "
                f"(round_off={round_off}, taxable={taxable_amount}, "
                f"cgst={cgst_amount}, sgst={sgst_amount}, igst={igst_amount}, "
                f"grand_total={grand_total}). "
                f"Check that invoice amounts sum to grand_total correctly."
            )

        # ── Create JournalEntry ──
        invoice_date = sale_invoice.invoice_date
        entry_date = invoice_date.date() if hasattr(invoice_date, 'date') else invoice_date
        narration = f"Sale Invoice {sale_invoice.invoice_no} on {entry_date}"
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='SALE',
            source_id=sale_invoice.id,
            date=entry_date,
            narration=narration
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(
            f"Posted journal {je.id} for SALE {sale_invoice.id} "
            f"outlet {outlet.id} grand_total={grand_total}"
        )

    except Ledger.DoesNotExist as e:
        logger.error(f"Ledger not found for sale {sale_invoice.id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to post journal for sale {sale_invoice.id}: {e}")
        raise


@transaction.atomic
def post_purchase_invoice(purchase_invoice, distributor_ledger=None):
    """
    Post a purchase invoice to the general ledger (Step 1 — Invoice Posting).

    Always credits the Distributor Ledger regardless of purchase_type, establishing
    vendor billing volume and enabling GST reconciliation. For cash purchases a
    second journal (Step 2 — Payment Posting) is posted by atomic_purchase_save()
    immediately after, which debits Distributor and credits Cash to settle the
    liability created here.

    Rate-specific GST Input ledgers are used (CGST Input 6%, SGST Input 6%, etc).
    Fallback to generic GST Input (CGST) / GST Input (SGST) if not found.
    GST posting failure NEVER crashes the purchase save.

    Journal entry (both cash and credit purchases, intrastate):
      Dr. Purchase Account                 taxable_amount
      Dr. CGST Input {rate}%               gst_amount / 2
      Dr. SGST Input {rate}%               gst_amount / 2
      Dr/Cr Round Off                      abs(round_off)   [if non-zero]
      Cr. Distributor Ledger               grand_total

    Args:
        purchase_invoice: The PurchaseInvoice to post.
        distributor_ledger: Optional Ledger object for the creditor. When provided
            (partyLedgerId flow), it is used directly. When None, the ledger is
            looked up via the distributor FK (legacy flow). A missing ledger is a
            hard error — the caller's transaction rolls back.
    """
    try:
        outlet = purchase_invoice.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'PURCHASE', purchase_invoice.id):
            logger.info(f"Purchase {purchase_invoice.id} already journaled, skipping")
            return

        lines = []
        grand_total = purchase_invoice.grand_total
        taxable_amount = purchase_invoice.taxable_amount
        gst_amount = purchase_invoice.gst_amount or Decimal('0')

        # Cr Distributor Ledger — always, for both cash and credit purchases
        if distributor_ledger is None:
            distributor_ledger = _get_distributor_ledger(outlet, purchase_invoice.distributor)

        if distributor_ledger is None:
            raise ValueError(
                f"Purchase {purchase_invoice.id}: no Sundry Creditors ledger found for "
                f"distributor '{purchase_invoice.distributor}'. "
                f"Pass the party_ledger explicitly from atomic_purchase_save(), or run "
                f"sync_distributor_ledgers to link existing distributors."
            )

        # Dr Purchase Account
        purchase_ledger = _get_ledger(outlet, 'Purchase Account')
        subtotal = getattr(purchase_invoice, 'subtotal', taxable_amount) or taxable_amount
        lines.append(('debit', purchase_ledger, subtotal))

        # Dr GST Input — rate-specific with fallback, never raises
        if gst_amount > 0:
            gst_lines = _build_purchase_gst_lines(outlet, purchase_invoice, gst_amount, distributor_ledger)
            lines.extend(gst_lines)

        # Dr Cess Account
        cess_amount = getattr(purchase_invoice, 'cess_amount', Decimal('0')) or Decimal('0')
        if cess_amount > 0:
            cess_ledger = _get_ledger(outlet, 'Cess Account')
            lines.append(('debit', cess_ledger, cess_amount))

        # Dr Freight Inward
        freight = getattr(purchase_invoice, 'freight', Decimal('0')) or Decimal('0')
        if freight > 0:
            freight_ledger = _get_ledger(outlet, 'Freight Inward')
            lines.append(('debit', freight_ledger, freight))

        # Cr Discount Received (Item Discounts + Bulk Invoice Discount)
        discount_amount = getattr(purchase_invoice, 'discount_amount', Decimal('0')) or Decimal('0')
        invoice_discount = getattr(purchase_invoice, 'invoice_discount', Decimal('0')) or Decimal('0')
        total_discount = discount_amount + invoice_discount
        # Guarantee mathematical integrity: if subtotal exceeds taxable_amount, ensure
        # all discount is recognized on the credit side to match the debit to Purchase Account.
        implied_discount = subtotal - taxable_amount
        if implied_discount > total_discount:
            total_discount = implied_discount
        if total_discount > 0:
            discount_ledger = _get_ledger(outlet, 'Discount Received')
            lines.append(('credit', discount_ledger, total_discount))

        # Round Off — bridges the gap between (taxable + gst) and grand_total
        round_off = purchase_invoice.round_off or Decimal('0')
        if round_off > 0:
            # grand_total > taxable+gst → credit side exceeds debit → Dr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('debit', round_off_ledger, round_off))
        elif round_off < 0:
            # grand_total < taxable+gst → debit side exceeds credit → Cr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('credit', round_off_ledger, abs(round_off)))

        # Ledger Adjustment — balances the gap between (taxable+gst+round_off) and grand_total
        ledger_adj = purchase_invoice.ledger_adjustment or Decimal('0')
        if ledger_adj != Decimal('0'):
            ledger_adj_account = _get_ledger(outlet, 'Ledger Adjustment')
            if ledger_adj < Decimal('0'):
                # User added credit (e.g. +₹200 stored as -200) → reduces payable
                # Dr. Ledger Adjustment (adds to debit side to balance)
                lines.append(('debit', ledger_adj_account, abs(ledger_adj)))
            else:
                # User subtracted from invoice (e.g. -₹200 stored as +200) → increases payable
                # Cr. Ledger Adjustment (adds to credit side to balance)
                lines.append(('credit', ledger_adj_account, ledger_adj))

        lines.append(('credit', distributor_ledger, grand_total))

        # ── Auto-balance: absorb sub-₹0.05 floating-point GST rounding drift ──
        _pre_check_dr = sum(amt for t, _, amt in lines if t == 'debit')
        _pre_check_cr = sum(amt for t, _, amt in lines if t == 'credit')
        _drift = _pre_check_cr - _pre_check_dr  # positive = Cr heavy; negative = Dr heavy
        if Decimal('0') < abs(_drift) <= Decimal('0.05'):
            try:
                _ro_ledger = _get_ledger(outlet, 'Round Off')
                if _drift > 0:
                    lines.append(('debit', _ro_ledger, _drift))
                else:
                    lines.append(('credit', _ro_ledger, abs(_drift)))
            except Ledger.DoesNotExist:
                pass

        # Verify double-entry balance before writing anything
        total_debit = sum(amt for t, _, amt in lines if t == 'debit')
        total_credit = sum(amt for t, _, amt in lines if t == 'credit')
        if abs(total_debit - total_credit) > Decimal('0.01'):
            raise ValueError(
                f"Purchase {purchase_invoice.id}: double-entry imbalance — "
                f"Dr ₹{total_debit} vs Cr ₹{total_credit} "
                f"(taxable={taxable_amount}, gst={gst_amount}, round_off={round_off}, "
                f"ledger_adjustment={ledger_adj}, grand_total={grand_total}). "
                f"Check that invoice amounts sum correctly."
            )

        # Create JournalEntry
        invoice_date = purchase_invoice.invoice_date
        entry_date = invoice_date.date() if hasattr(invoice_date, 'date') else invoice_date
        narration = f"Purchase Invoice {purchase_invoice.invoice_no} on {entry_date}"
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='PURCHASE',
            source_id=purchase_invoice.id,
            date=entry_date,
            narration=narration
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(
            f"Posted journal {je.id} for PURCHASE {purchase_invoice.id} "
            f"outlet {outlet.id} grand_total={grand_total}"
        )

    except Ledger.DoesNotExist as e:
        logger.error(f"Ledger not found for purchase {purchase_invoice.id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to post journal for purchase {purchase_invoice.id}: {e}")
        raise


@transaction.atomic
def post_voucher(voucher):
    """
    Create a journal entry for an existing voucher (audit trail only).

    Note: Ledger balance updates are already done by VoucherService.create_voucher()
    via LedgerService.update_balance(). This function only creates the JournalEntry
    and JournalLine records for audit purposes, without double-updating balances.
    """
    try:
        outlet = voucher.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'VOUCHER', voucher.id):
            logger.info(f"Voucher {voucher.id} already journaled, skipping")
            return

        # Create JournalEntry
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='VOUCHER',
            source_id=voucher.id,
            date=voucher.date,
            narration=voucher.narration or f"Voucher {voucher.voucher_no}"
        )

        # Create JournalLines mirroring VoucherLines
        # Balance already updated by VoucherService — do NOT call update_balance here
        for vline in voucher.lines.all():
            JournalLine.objects.create(
                journal_entry=je,
                ledger=vline.ledger,
                debit_amount=vline.debit,
                credit_amount=vline.credit
            )

        logger.info(
            f"Posted journal {je.id} for VOUCHER {voucher.id} outlet {outlet.id}"
        )

    except Exception as e:
        logger.error(f"Failed to post journal for voucher {voucher.id}: {e}")
        raise


@transaction.atomic
def post_credit_payment(outlet, customer, amount, payment_mode, source_id, narration):
    """
    Post a credit payment collection to the general ledger.
    Called when a customer pays back their outstanding Udhari/credit balance.

    Journal entry:
      Dr. Cash / UPI Collections / Card/POS Settlement    amount
      Cr. Customer Ledger (Sundry Debtors)                amount
    """
    try:
        # Guard against double-posting
        if _guard_double_posting(outlet, 'CREDIT_PAYMENT', source_id):
            logger.info(f"CREDIT_PAYMENT {source_id} already journaled, skipping")
            return

        lines = []
        mode = (payment_mode or 'cash').lower()

        # ── DEBIT side: which collection ledger received the money ──
        if mode in ('upi', 'upi_transfer', 'phonepe', 'gpay', 'paytm', 'neft', 'imps'):
            collection_ledger = _get_ledger(outlet, 'UPI Collections')
        elif mode in ('card', 'pos', 'swipe', 'credit_card', 'debit_card'):
            collection_ledger = _get_ledger(outlet, 'Card/POS Settlement')
        else:
            # Default: cash
            collection_ledger = _get_ledger(outlet, 'Cash')

        lines.append(('debit', collection_ledger, amount))

        # ── CREDIT side: Customer Ledger (Sundry Debtors) ──
        customer_ledger = _get_customer_ledger(outlet, customer)
        if not customer_ledger:
            raise ValueError(
                f"CREDIT_PAYMENT {source_id}: no customer ledger found for "
                f"customer {customer.id} ({customer.name}). "
                f"Run sync_customer_ledgers first."
            )
        lines.append(('credit', customer_ledger, amount))

        # ── Create JournalEntry ──
        from datetime import datetime
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='CREDIT_PAYMENT',
            source_id=source_id,
            date=datetime.now().date(),
            narration=narration
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(
            f"Posted journal {je.id} for CREDIT_PAYMENT {source_id} "
            f"outlet {outlet.id} amount={amount}"
        )

    except Ledger.DoesNotExist as e:
        logger.error(f"Ledger not found for credit payment {source_id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to post journal for credit payment {source_id}: {e}")
        raise


@transaction.atomic
def reverse_journal(source_type, source_id, outlet_id, narration_prefix='REVERSAL OF'):
    """
    Reverse (contra-post) a previous journal entry.
    Called when a Credit Note (sale return) or Debit Note (purchase return) is created.

    This function:
      1. Finds the original JournalEntry
      2. For each JournalLine: flips debit/credit and reverses the ledger balance
      3. Creates a new JournalEntry with source_type='RETURN'

    The original entry is NEVER deleted — it remains for the audit trail.
    """
    try:
        from datetime import datetime

        # Find original journal
        original_je = JournalEntry.objects.get(
            outlet_id=outlet_id,
            source_type=source_type,
            source_id=source_id
        )

        # Check if it already exists to make it idempotent
        if JournalEntry.objects.filter(
            outlet_id=outlet_id,
            source_type='RETURN',
            source_id=source_id
        ).exists():
            return

        # Create reversal JournalEntry
        reversal_je = JournalEntry.objects.create(
            outlet_id=outlet_id,
            source_type='RETURN',
            source_id=source_id,
            date=datetime.now().date(),
            narration=f"{narration_prefix} {original_je.narration}"
        )

        # For each original JournalLine, create a flipped reversal line
        for original_line in original_je.lines.all():
            # Create reversal line with debit/credit flipped
            JournalLine.objects.create(
                journal_entry=reversal_je,
                ledger=original_line.ledger,
                debit_amount=original_line.credit_amount,  # flip
                credit_amount=original_line.debit_amount   # flip
            )

            # Reverse the ledger balance:
            # If original was debit (increased asset balance), credit to reverse it
            # If original was credit (increased liability balance), debit to reverse it
            LedgerService.update_balance(
                original_line.ledger.id,
                original_line.credit_amount,   # debit with the original credit amount
                original_line.debit_amount     # credit with the original debit amount
            )

        logger.info(
            f"Posted reversal journal {reversal_je.id} for {source_type} {source_id} "
            f"outlet {outlet_id}"
        )

    except JournalEntry.DoesNotExist:
        logger.warning(f"No journal entry found for {source_type} {source_id}, skipping reversal")
    except Exception as e:
        logger.error(f"Failed to reverse journal for {source_type} {source_id}: {e}")
        raise


@transaction.atomic
def post_debit_note(debit_note, party_ledger=None):
    """
    Post a Purchase Return (Debit Note) to the general ledger.

    Rate-specific GST Input ledgers are used (CGST Input 6%, SGST Input 6%, etc).
    Fallback to generic GST Input (CGST) / GST Input (SGST) if not found.

    Journal entry:
      Dr. Distributor Ledger (Sundry Creditors)     debit_note.total_amount
      Cr. Purchase Returns Account                  debit_note.subtotal
      Cr. CGST Input {rate}%                        debit_note.gst_amount / 2
      Cr. SGST Input {rate}%                        debit_note.gst_amount / 2
    """
    try:
        outlet = debit_note.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'RETURN', debit_note.id):
            logger.info(f"Debit Note {debit_note.id} already journaled, skipping")
            return

        lines = []

        # Safely convert all money fields to strict Decimals
        total_amount = Decimal(str(debit_note.total_amount or '0'))
        subtotal = Decimal(str(debit_note.subtotal or '0'))
        gst_amount = Decimal(str(debit_note.gst_amount or '0'))

        # 1. Debit the Distributor (Reduces the liability we owe them)
        if party_ledger is None:
            party_ledger = _get_distributor_ledger(outlet, debit_note.distributor)

        if party_ledger is None:
            raise ValueError(f"No Sundry Creditors ledger found for distributor '{debit_note.distributor}'.")

        lines.append(('debit', party_ledger, total_amount))

        # 2. Credit the Purchase Returns Account (Reversing the expense)
        try:
            return_ledger = _get_ledger(outlet, 'Purchase Returns')
        except Ledger.DoesNotExist:
            # Fallback to general Purchase Account if a specific Returns account isn't seeded
            return_ledger = _get_ledger(outlet, 'Purchase Account')

        lines.append(('credit', return_ledger, subtotal))

        # 3. Credit the GST Input (Reversing the GST Input originally claimed)
        # Use rate-specific ledgers with fallback — never raises
        if gst_amount > 0:
            cgst_credit = (gst_amount / Decimal('2')).quantize(Decimal('0.01'))
            sgst_credit = gst_amount - cgst_credit

            # Infer rate from debit note amounts
            snapped_rate = None
            if subtotal > 0:
                inferred_rate = (gst_amount / subtotal * 100).quantize(Decimal('0.01'))
                snapped_rate = _snap_to_standard_rate(inferred_rate)

            if snapped_rate and snapped_rate in GST_RATE_TO_COMPONENTS:
                cgst_rate, sgst_rate = GST_RATE_TO_COMPONENTS[snapped_rate]
                cgst_ledger = _get_ledger_safe(
                    outlet, f'CGST Input {cgst_rate}%', 'GST Input (CGST)'
                )
                sgst_ledger = _get_ledger_safe(
                    outlet, f'SGST Input {sgst_rate}%', 'GST Input (SGST)'
                )
            else:
                cgst_ledger = _get_ledger_safe(outlet, 'GST Input (CGST)')
                sgst_ledger = _get_ledger_safe(outlet, 'GST Input (SGST)')

            if cgst_ledger:
                lines.append(('credit', cgst_ledger, cgst_credit))
            if sgst_ledger:
                lines.append(('credit', sgst_ledger, sgst_credit))

        # Verify double-entry balance
        total_debit = sum(amt for t, _, amt in lines if t == 'debit')
        total_credit = sum(amt for t, _, amt in lines if t == 'credit')
        if abs(total_debit - total_credit) > Decimal('0.01'):
            raise ValueError(
                f"Debit Note {debit_note.id}: double-entry imbalance — "
                f"Dr ₹{total_debit} vs Cr ₹{total_credit} "
                f"(subtotal={subtotal}, gst={gst_amount}, total={total_amount})."
            )

        # Create JournalEntry
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='RETURN',
            source_id=debit_note.id,
            date=debit_note.date,
            narration=f"Purchase Return / Debit Note {debit_note.debit_note_no or ''}"
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(f"Posted journal {je.id} for DEBIT NOTE {debit_note.id}")

    except Exception as e:
        logger.error(f"Failed to post journal for debit note {debit_note.id}: {e}")
        raise