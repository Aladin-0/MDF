"""
The Marg stock loader (apps/inventory/marg_import, `manage.py marg_import_stock`).

The rules are tested as pure functions with the cases found in the real export (each one checked there against Marg's own
opening + movements); the database tests prove the three promises: the outlet's stock becomes exactly the sheet, the stock
ledger agrees with it, and nothing of another outlet moves.
"""
from datetime import date
from decimal import Decimal as D

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from openpyxl import load_workbook

from apps.accounts.tests.factories import OutletFactory
from apps.inventory import ledger_health
from apps.inventory.marg_import import apply as A
from apps.inventory.marg_import import files, plan as P, report, rules
from apps.inventory.marg_import.rules import Pack
from apps.inventory.models import Batch, MasterProduct, StockLedger
from apps.inventory.tests.factories import BatchFactory, MasterProductFactory, StockLedgerFactory
from apps.purchases.tests.factories import PurchaseInvoiceFactory, PurchaseItemFactory

AS_ON = date(2026, 11, 24)


# ── rules ────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_a_name_is_matched_on_letters_and_digits_only():
    # Marg's XML drops * / ' and its Excel keeps them
    assert rules.name_key('DISPO VAN 3CC 1*100') == rules.name_key('DISPO VAN 3CC 1100')
    assert rules.name_key("ABDOMINAL BELT FLA.[LARGE] 1'S") == rules.name_key('ABDOMINAL BELT FLA.[LARGE] 1S')
    assert rules.name_key('0915/D SINGLE STICK') == rules.name_key('0915D   single stick')
    assert rules.name_key('KNEE CAP L') != rules.name_key('KNEE CAP XL')


def test_expiry_is_the_last_day_of_the_month_marg_prints():
    assert rules.parse_expiry('01-Jun-28') == date(2028, 6, 30)
    assert rules.parse_expiry('01-Feb-28') == date(2028, 2, 29)
    assert rules.parse_expiry('  -   -') is None
    assert rules.parse_expiry('') is None


@pytest.mark.parametrize('stock, pack, packs, loose', [
    ('7', 10, 7, 0),
    ('3.14', 20, 3, 14),     # ENTROQUIN: opening 74 units = 3 x 20 + 14
    ('1.19', 20, 1, 19),     # OMEE D: 39 units
    ('2.2', 15, 2, 2),       # ALDIAGESIC.P: 32 units (20 would not fit in a pack of 15)
    ('4.3', 6, 4, 3),        # MEDITAPE 6S: 27 units
    ('0.5', 24, 0, 5),       # MEDITAPE 24S: 5 units. NOT half a pack
    ('98.86', 100, 98, 86),
    ('0.1', 2, 0, 1),
    ('4.8', 10, 4, 8),
])
def test_marg_prints_packs_dot_loose(stock, pack, packs, loose):
    q = rules.read_quantity(D(stock), pack)
    assert (q.packs, q.loose, q.clear) == (packs, loose, True)


@pytest.mark.parametrize('stock, pack, choices', [
    ('0.5', 100, (5, 50)),    # Excel drops the last zero: "0.50" and "0.5" are the same cell
    ('19.1', 12, (1, 10)),
    ('46.3', 100, (3, 30)),
    ('0.1', 1, ()),           # a part quantity of something Marg has no pack for
])
def test_an_ambiguous_part_quantity_is_never_guessed(stock, pack, choices):
    q = rules.read_quantity(D(stock), pack)
    assert not q.clear and q.loose is None and q.choices == choices and q.packs == int(D(stock))


def test_prices_follow_marg_cost_and_never_invent_an_mrp():
    p = rules.prices(D('162.75'), D('155'), D('310'), D('5'))        # cost = purchase + 5% GST
    assert (p.landing, p.purchase, p.mrp) == (D('162.75'), D('155.00'), D('310.00'))
    p = rules.prices(D('287.28'), D('570'), D('570'), D('5'))        # "purchase price" is really the MRP
    assert (p.landing, p.purchase) == (D('287.28'), D('273.60'))
    assert rules.prices(D('500'), D('500'), D('0'), D('5')).mrp == D('0.00')
    assert rules.cost_looks_per_piece(D('3'), D('1023'), 100) and not rules.cost_looks_per_piece(D('26.84'), D('112.78'), 10)


def test_what_kind_of_item_it_is():
    assert rules.kind_of('TYNOR KNEE CAP XL 1S', 'TAB') == 'piece'         # "TAB" is Marg's default unit, "CAP" is not a capsule
    assert rules.kind_of('BOUFANT CAP 1', 'TAB') == 'piece'
    assert rules.kind_of('OMEE D CAP 1*20', 'TAB', '1*20') == 'capsule'
    assert rules.kind_of('ACEMIZ MR TAB 1*10TAB', 'TAB', '1*10TAB') == 'tablet'
    assert rules.kind_of('CLAVAM 625MG 10S', 'TAB', '10S') == 'tablet'     # only the strength says so
    assert rules.kind_of('SOMETHING', 'CREA') == 'tube'                    # a unit somebody chose on purpose
    assert rules.kind_of('WHEEL CHAIR FOLDING', 'PCS') == 'piece'


def test_pack_size_comes_from_marg_then_the_catalogue():
    belt = Pack(1, 'tablet', 'strip')                                       # the old import's mix-up
    assert rules.decide_pack('piece', 0, belt) == (Pack(1, 'piece', 'piece'), 'single')
    assert rules.decide_pack('tablet', 0, Pack(1, 'tablet', 'strip')) == (Pack(1, 'tablet', 'strip'), 'single')
    assert rules.decide_pack('tablet', 10, Pack(1, 'tablet', 'strip')) == (Pack(10, 'tablet', 'strip'), 'Marg')
    assert rules.decide_pack('piece', 100, Pack(100, 'piece', 'piece')) == (Pack(100, 'piece', 'box'), 'Marg')   # must sell loose
    assert rules.decide_pack('piece', 2, Pack(50, 'tablet', 'strip')) == (Pack(2, 'tablet', 'strip'), 'Marg')    # only the size is Marg's
    assert rules.decide_pack('piece', 0, Pack(10, 'piece', 'piece')) == (Pack(10, 'piece', 'piece'), 'catalogue')
    assert rules.decide_pack('piece', 0, None) == (Pack(1, 'piece', 'piece'), 'single')
    # a product another outlet uses keeps its label whatever the item looks like
    assert rules.decide_pack('piece', 0, belt, keep_label=True) == (belt, 'single')
    assert rules.usable_conversion(10500) == 0 and rules.usable_conversion(12) == 12 and rules.usable_conversion(1) == 0
    assert rules.valid_hsn('9021') and rules.valid_hsn('30049099') and not rules.valid_hsn('005') and not rules.valid_hsn('')


# ── files ────────────────────────────────────────────────────────────────────────────────────────────────────────

MASTER = """<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
<TALLYMESSAGE><STOCKITEM NAME="OMEE D CAP 120" RESERVEDNAME=""><PARENT>ALKEM &#4; CO & SONS</PARENT><BASEUNITS>TAB</BASEUNITS>
<DENOMINATOR>1*20</DENOMINATOR><CONVERSION>20.0000</CONVERSION><LANGUAGENAME.LIST><GSTDETAILS.LIST><HSNCODE>3004</HSNCODE>
<STATEWISEDETAILS.LIST><RATEDETAILS.LIST><GSTRATEDUTYHEAD>Central Tax</GSTRATEDUTYHEAD><GSTRATE> 2.50</GSTRATE></RATEDETAILS.LIST>
<RATEDETAILS.LIST><GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD><GSTRATE> 5.00</GSTRATE></RATEDETAILS.LIST></STATEWISEDETAILS.LIST>
</GSTDETAILS.LIST></LANGUAGENAME.LIST></STOCKITEM></TALLYMESSAGE>
<TALLYMESSAGE><STOCKITEM NAME="KARELA 1" RESERVEDNAME=""><BASEUNITS>TAB</BASEUNITS></STOCKITEM></TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""

HEAD = ['Code', 'Product Name', 'Unit', 'Current Stock', 'Sales Scheme', '', 'Purc.Scheme', '', 'Cost Price', 'Value', 'M.R.P.',
        'Purchase Price', 'Sales Price', 'Company', 'Manufacturer', 'Rec.Date', 'Batch', 'MFG', 'EXP', 'Supplier', 'Inv.No',
        'Inv.Date', 'Rack No.', 'Barcode']


def line(name, stock, cost, mrp, purchase=None, batch='', exp='  -   -', rack='', company='ACME'):
    r = [''] * 24
    r[0], r[1], r[2], r[3], r[8], r[9], r[10] = 'C1', name, 'TAB.', float(stock), float(cost), float(stock) * float(cost), float(mrp)
    r[11], r[13], r[16], r[18], r[22] = float(cost if purchase is None else purchase), company, batch, exp, rack
    return r


def sheet_of(*lines):
    top = [['S.P.S.TEST PHARMA' + ' ' * 300 + 'SHOP NO.1'] + [''] * 23, ['STOCK REPORT AS ON DATE 24-11-2026'] + [''] * 23, HEAD, [''] * 24]
    return files.parse_stock_rows(top + list(lines) + [[''] * 24, [''] * 9 + [123.45] + [''] * 14])


def item(name, hsn='9021', gst='5', conversion=0, unit='TAB', pack_text='', company='ACME'):
    return files.MargItem(name=name, company=company, unit=unit, pack_text=pack_text, conversion=conversion, hsn=hsn, gst=None if gst is None else D(gst))


def test_the_item_list_is_read_with_margs_broken_xml():
    omee, karela = files.parse_items(MASTER)
    assert (omee.name, omee.company, omee.conversion, omee.hsn, omee.gst, omee.pack_text) == ('OMEE D CAP 120', 'ALKEM  CO & SONS', 20, '3004', D('5.00'), '1*20')
    assert (karela.conversion, karela.hsn, karela.gst) == (0, '', None)


def test_the_stock_report_is_read_by_its_headers_not_by_position():
    s = sheet_of(line('KNEE CAP L', 5, '162.75', 310, 155, batch='XL', exp='01-Jun-28', rack='R-1'))
    assert (s.company, s.as_on, s.total_value, len(s.rows)) == ('S.P.S.TEST PHARMA', AS_ON, D('123.45'), 1)
    r = s.rows[0]
    assert (r.name, r.stock, r.cost, r.mrp, r.purchase_price, r.batch, r.expiry, r.rack, r.line) == ('KNEE CAP L', D('5'), D('162.75'), D('310'), D('155'), 'XL', '01-Jun-28', 'R-1', 5)
    moved = [list(HEAD)]
    moved[0][10], moved[0][11] = moved[0][11], moved[0][10]          # MRP and Purchase Price swapped
    with pytest.raises(files.MargFileError, match='layout changed'):
        files.parse_stock_rows([['X'], ['STOCK REPORT AS ON DATE 24-11-2026']] + moved)


# ── the load ─────────────────────────────────────────────────────────────────────────────────────────────────────

def load(outlet, items, sheet, answers=None):
    plan = P.build_plan(outlet, items, sheet, answers)
    done = A.apply_products(plan)
    done.update(A.replace_stock(plan))
    return plan, done, A.verify(plan)


@pytest.mark.django_db
def test_the_outlets_stock_becomes_exactly_the_sheet():
    outlet = OutletFactory()
    plan, done, checked = load(outlet, [item('KNEE CAP L'), item('ENTROQUIN TAB 120TAB', '3004', '5', conversion=20, pack_text='1*20TAB')], sheet_of(
        line('KNEE CAP L', 5, '162.75', 310, 155, batch='XL', exp='01-Jun-28', rack='R-1'),
        line('ENTROQUIN TAB 1*20TAB', '3.14', 40, 90),
    ))
    assert done['products_created'] == 2 and done['batches_created'] == 2
    cap = Batch.objects.get(outlet=outlet, product__name='KNEE CAP L')
    assert (cap.batch_no, cap.qty_strips, cap.qty_loose, cap.expiry_date, cap.rack_location) == ('XL', 5, 0, date(2028, 6, 30), 'R-1')
    assert (cap.mrp, cap.landing_rate, cap.purchase_rate, cap.pack_size, cap.pack_unit, cap.pack_type) == (D('310'), D('162.75'), D('155'), 1, 'piece', 'piece')
    assert cap.is_opening_stock and cap.is_active and cap.product.hsn_code == '9021' and cap.product.drug_type == 'surgical'
    tab = Batch.objects.get(outlet=outlet, product__name='ENTROQUIN TAB 1*20TAB')     # the sheet's spelling, not the XML's
    assert (tab.batch_no, tab.qty_strips, tab.qty_loose, tab.pack_size, tab.pack_type, tab.expiry_date) == (rules.NO_BATCH, 3, 14, 20, 'strip', rules.NO_EXPIRY)

    # one OPENING row per batch, in packs, at the purchase rate, dated the day of the sheet: ledger and batch agree
    row = StockLedger.objects.get(batch=tab)
    assert (row.txn_type, row.txn_date, row.qty_in, row.rate, row.running_qty) == ('ADJUSTMENT_IN', AS_ON, D('3.7'), tab.purchase_rate, D('3.7'))
    assert row.voucher_type == A.TAKEOVER_VOUCHER       # NOT an OPENING row: the P&L adds those up as opening stock
    cap_row = StockLedger.objects.get(batch=cap)       # purchase rate 155, NOT the landing cost 162.75 (the P&L values closing stock the same way)
    assert (cap_row.rate, cap_row.value_in, cap_row.running_value) == (D('155'), D('775.00'), D('775.00'))
    assert ledger_health.scan(outlet)['counts'] == {'OK': 2, 'A': 0, 'B': 0, 'B2': 0, 'C': 0, 'R': 0}
    assert checked['batches'] == 2 and checked['opening_stock_value'] == checked['stock_at_purchase_rate']
    assert not plan.issues


@pytest.mark.django_db
def test_old_stock_is_replaced_and_a_batch_a_document_points_at_is_kept_empty():
    outlet = OutletFactory()
    product = MasterProductFactory(name='KNEE CAP L', pack_size=1, pack_unit='piece', pack_type='piece')
    billed = BatchFactory(outlet=outlet, product=product, batch_no='OLD-BILLED', qty_strips=9, pack_size=1)
    never_used = BatchFactory(outlet=outlet, product=product, batch_no='OLD-UNUSED', qty_strips=4, pack_size=1)
    PurchaseItemFactory(invoice=PurchaseInvoiceFactory(outlet=outlet), batch=billed)
    StockLedgerFactory(outlet=outlet, product=product, batch=billed)

    _, done, _ = load(outlet, [item('KNEE CAP L')], sheet_of(line('KNEE CAP L', 5, 100, 310, batch='NEW')))

    billed.refresh_from_db()
    assert (billed.qty_strips, billed.qty_loose, billed.is_active) == (0, 0, False)      # the purchase line keeps its batch
    assert not Batch.objects.filter(id=never_used.id).exists()
    assert (done['old_batches_switched_off'], done['old_batches_deleted'], done['ledger_rows_removed']) == (1, 1, 1)
    assert list(Batch.objects.filter(outlet=outlet, is_active=True).values_list('batch_no', 'qty_strips')) == [('NEW', 5)]
    assert StockLedger.objects.filter(outlet=outlet).count() == 1


@pytest.mark.django_db
def test_another_outlet_is_never_touched():
    mine, other = OutletFactory(), OutletFactory()
    shared = MasterProductFactory(name='KNEE CAP L', hsn_code='3004', gst_rate=D('12'), pack_size=1, pack_unit='tablet', pack_type='strip')
    theirs = BatchFactory(outlet=other, product=shared, batch_no='THEIRS', qty_strips=7, pack_size=1)
    StockLedgerFactory(outlet=other, product=shared, batch=theirs)
    before = A.others_fingerprint(mine)

    plan, _, _ = load(mine, [item('KNEE CAP L', hsn='9021', gst='5')], sheet_of(line('KNEE CAP L', 5, 100, 310)))

    assert A.others_fingerprint(mine) == before
    shared.refresh_from_db()
    assert (shared.hsn_code, shared.gst_rate, shared.pack_unit, shared.pack_type) == ('3004', D('12'), 'tablet', 'strip')   # Marg disagrees: still not ours to change
    assert plan.products[rules.name_key('KNEE CAP L')].shared and not plan.products[rules.name_key('KNEE CAP L')].changes
    theirs.refresh_from_db()
    assert theirs.qty_strips == 7 and StockLedger.objects.filter(outlet=other).count() == 1
    mine_batch = Batch.objects.get(outlet=mine)
    assert mine_batch.product_id == shared.id and (mine_batch.pack_unit, mine_batch.pack_type) == ('tablet', 'strip')        # the two copies stay in step


@pytest.mark.django_db
def test_one_product_for_an_item_the_catalogue_has_under_two_spellings():
    outlet = OutletFactory()
    real = MasterProductFactory(name='DISPO VAN 5CC 1*100', pack_size=1, pack_unit='tablet', pack_type='strip')
    stray = MasterProductFactory(name='DISPO VAN 5CC 1100', pack_size=1, pack_unit='piece', pack_type='piece')
    plan, done, _ = load(outlet, [item('DISPO VAN 5CC 1100', conversion=100)], sheet_of(line('DISPO VAN 5CC 1*100', '98.86', 300, 1023)))
    assert done['products_created'] == 0
    b = Batch.objects.get(outlet=outlet)
    assert b.product_id == real.id and (b.qty_strips, b.qty_loose, b.pack_size, b.pack_type) == (98, 86, 100, 'box')
    assert [t.id for t in plan.products[rules.name_key('DISPO VAN 5CC 1100')].twins] == [stray.id]
    real.refresh_from_db()
    assert (real.pack_size, real.pack_unit, real.pack_type) == (100, 'piece', 'box')       # the product's copy follows, like its batch


@pytest.mark.django_db
def test_marg_wins_where_it_says_something_and_a_blank_overwrites_nothing():
    outlet = OutletFactory()
    lamp = MasterProductFactory(name='INFRARED LAMP', hsn_code='9018', gst_rate=D('5'), manufacturer='*', pack_size=1, pack_unit='piece', pack_type='piece')
    karela = MasterProductFactory(name='KARELA 1', hsn_code='3004', gst_rate=D('5'), manufacturer='Real Maker', pack_size=1, pack_unit='piece', pack_type='piece')
    insole = MasterProductFactory(name='SILICON INSOLE', hsn_code='9018', gst_rate=D('5'), pack_size=1, pack_unit='piece', pack_type='piece')
    plan, done, _ = load(outlet, [item('INFRARED LAMP', '8504', '18', company='BEURER'), item('KARELA 1', '', None), item('SILICON INSOLE', '005', '0')],
                         sheet_of(line('INFRARED LAMP', 1, 100, 300), line('KARELA 1', 1, 10, 30), line('SILICON INSOLE', 1, 10, 30)))
    for p in (lamp, karela, insole):
        p.refresh_from_db()
    assert (lamp.hsn_code, lamp.gst_rate, lamp.manufacturer) == ('8504', D('18'), 'BEURER')          # Marg is the shop's current book
    assert (karela.hsn_code, karela.gst_rate, karela.manufacturer) == ('3004', D('5'), 'Real Maker')  # Marg is blank: nothing is lost
    assert (insole.hsn_code, insole.gst_rate) == ('9018', D('5'))                                     # "005" is a slip, not a code
    assert sorted(i.product for i in plan.of(P.TAX_MISSING)) == ['KARELA 1', 'SILICON INSOLE']
    assert done['products_updated'] == 1


@pytest.mark.django_db
def test_what_only_the_shop_can_settle_is_listed_and_never_guessed():
    outlet = OutletFactory()
    plan, _, _ = load(outlet, [item('WALKER BOOT'), item('ALERE STRIPS 100', conversion=100), item('BP APP'), item('COLOPLAST'), item('SYRINGE 5CC', conversion=100), item('GLOVE', conversion=100)], sheet_of(
        line('WALKER BOOT', 1, '2527.5', 0),            # no MRP
        line('ALERE STRIPS 100', '0.5', 900, 2100),     # 5 or 50 loose
        line('GLOVE', '5.9', 250, 1000),                # 5 boxes + 9 or 90
        line('BP APP', -8, 750, 2000),                  # negative
        line('COLOPLAST', 1, '808.5', 715),             # cost above MRP
        line('SYRINGE 5CC', 98, 3, 1023),               # a box of 100 at Rs 3: the cost was typed per piece
    ))
    kinds = {k: [i.product for i in plan.of(k)] for k in (P.MRP_MISSING, P.QTY_UNCLEAR, P.NEGATIVE_STOCK, P.COST_ABOVE_MRP, P.COST_PER_PIECE)}
    assert kinds == {P.MRP_MISSING: ['WALKER BOOT'], P.QTY_UNCLEAR: ['ALERE STRIPS 100', 'GLOVE'], P.NEGATIVE_STOCK: ['BP APP'],
                     P.COST_ABOVE_MRP: ['COLOPLAST'], P.COST_PER_PIECE: ['SYRINGE 5CC']}
    assert len(plan.blocking) == 3
    stock = {b.product.name: (b.qty_strips, b.qty_loose, b.mrp) for b in Batch.objects.filter(outlet=outlet)}
    assert stock == {'WALKER BOOT': (1, 0, D('0')), 'GLOVE': (5, 0, D('1000')), 'COLOPLAST': (1, 0, D('715')), 'SYRINGE 5CC': (98, 0, D('1023'))}
    assert not Batch.objects.filter(outlet=outlet, product__name__in=['ALERE STRIPS 100', 'BP APP']).exists()   # nothing certain to shelve


@pytest.mark.django_db
def test_the_shops_answers_come_back_through_the_same_excel(tmp_path):
    outlet = OutletFactory()
    items = [item('WALKER BOOT'), item('ALERE STRIPS 100', conversion=100), item('KARELA 1', '', None), item('SYRINGE 5CC', conversion=100)]
    sheet = sheet_of(line('WALKER BOOT', 1, '2527.5', 0, batch='5055'), line('ALERE STRIPS 100', '0.5', 900, 2100), line('KARELA 1', 2, 10, 30),
                     line('SYRINGE 5CC', 98, 3, 1023))
    path = tmp_path / 'lists.xlsx'
    report.write_workbook(P.build_plan(outlet, items, sheet), path)

    wb = load_workbook(path)

    def fill(title, header, value):
        ws = wb[title]
        col = [c.value for c in ws[4]].index(header) + 1
        ws.cell(row=5, column=col, value=value)
    assert wb[report.SHEET_MRP]['A5'].value == 'WALKER BOOT' and wb[report.SHEET_QTY]['F5'].value == '5 or 50'
    fill(report.SHEET_MRP, report.A_MRP, 4500)
    fill(report.SHEET_QTY, report.A_LOOSE, 50)
    fill(report.SHEET_TAX, report.A_HSN, 2202)
    fill(report.SHEET_TAX, report.A_GST, 12)
    fill(report.SHEET_PIECE, report.A_COST, 300)
    wb.save(path)

    plan, _, _ = load(outlet, items, sheet, report.read_answers(path))
    assert not plan.blocking and not plan.of(P.TAX_MISSING) and not plan.of(P.COST_PER_PIECE)
    boot = Batch.objects.get(outlet=outlet, product__name='WALKER BOOT')
    alere = Batch.objects.get(outlet=outlet, product__name='ALERE STRIPS 100')
    syringe = Batch.objects.get(outlet=outlet, product__name='SYRINGE 5CC')
    assert boot.mrp == D('4500') and (alere.qty_strips, alere.qty_loose) == (0, 50) and syringe.landing_rate == D('300')
    assert (MasterProduct.objects.get(name='KARELA 1').hsn_code, MasterProduct.objects.get(name='KARELA 1').gst_rate) == ('2202', D('12'))


# ── the command ──────────────────────────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def marg_files(tmp_path, monkeypatch):
    master = tmp_path / 'master.xml'
    master.write_text(MASTER.replace('KARELA 1', 'KNEE CAP L'))
    monkeypatch.setattr(files, 'read_stock', lambda path: sheet_of(line('KNEE CAP L', 5, 100, 310), line('OMEE D CAP 1*20', '1.19', 60, 200)))
    return ['--master', str(master), '--stock', 'stock.xls']


@pytest.mark.django_db
def test_show_only_saves_nothing_and_a_real_load_needs_the_outlets_name(marg_files, tmp_path):
    outlet = OutletFactory(name='Test Pharma')
    old = BatchFactory(outlet=outlet, qty_strips=3)
    call_command('marg_import_stock', '--outlet', str(outlet.id), *marg_files, '--report', str(tmp_path / 'lists.xlsx'))
    assert list(Batch.objects.filter(outlet=outlet)) == [old] and not MasterProduct.objects.filter(name='KNEE CAP L').exists()
    assert (tmp_path / 'lists.xlsx').exists()

    with pytest.raises(CommandError, match='exact name'):
        call_command('marg_import_stock', '--outlet', str(outlet.id), *marg_files, '--apply', '--confirm', 'test pharma')
    call_command('marg_import_stock', '--outlet', str(outlet.id), *marg_files, '--apply', '--confirm', 'Test Pharma')
    assert sorted(Batch.objects.filter(outlet=outlet, is_active=True).values_list('product__name', 'qty_strips', 'qty_loose')) == [
        ('KNEE CAP L', 5, 0), ('OMEE D CAP 1*20', 1, 19)]


@pytest.mark.django_db
def test_a_real_load_refuses_a_live_outlet_and_unanswered_lists(marg_files, monkeypatch):
    outlet = OutletFactory(name='Test Pharma')
    PurchaseInvoiceFactory(outlet=outlet)                      # made a purchase today: it is in use
    args = ['marg_import_stock', '--outlet', str(outlet.id), *marg_files, '--apply', '--confirm', 'Test Pharma']
    with pytest.raises(CommandError, match='looks live'):
        call_command(*args)
    monkeypatch.setattr(files, 'read_stock', lambda path: sheet_of(line('KNEE CAP L', 5, 100, 0)))
    with pytest.raises(CommandError, match='still need the shop'):
        call_command(*args, '--allow-live-outlet')
    assert not Batch.objects.filter(outlet=outlet).exists()


# ══ Phase 2: ledgers, opening balances, suppliers, customers ═════════════════════════════════════════════════════

from apps.accounts.models import Customer, JournalEntry, JournalLine, Ledger, LedgerGroup   # noqa: E402
from apps.accounts.tests.factories import CustomerFactory, SupplierFactory   # noqa: E402
from apps.inventory.marg_import import parties as PT   # noqa: E402
from apps.purchases.models import Distributor   # noqa: E402

G = files.MargGroup


def L(name, parent, opening='0', gstin='', state='Maharashtra'):
    return files.MargLedger(name=name, parent=parent, opening=D(opening), gstin=gstin, pan='', address='STATION ROAD', state=state, pincode='')


def N(number, party, note, day=date(2026, 5, 1)):
    return files.SaleNote(number=number, day=day, party=party, note=note)


MARG_GROUPS = [G('CURRENT ASSETS', ''), G('SUNDRY DEBTORS', 'CURRENT ASSETS'), G('SUNDRY DEBTORS (FIELD STAFF)', 'SUNDRY DEBTORS'),
               G('CURRENT LIABILITIES', ''), G('SUNDRY CREDITORS', 'CURRENT LIABILITIES'), G('SUNDRY CREDITORS (SUPPLIERS)', 'SUNDRY CREDITORS'),
               G('DUTIES & TAXES', 'CURRENT LIABILITIES'), G('TAX - SGST', 'DUTIES  TAXES'), G('CASH-IN-HAND', 'CURRENT ASSETS'),
               G('SALES LOCAL', 'Sales Accounts'), G('PROFIT & LOSS AC', '')]
MARG_LEDGERS = [
    L('DR MEHTA', 'SUNDRY DEBTORS', '-363300'),                                   # owes the shop (Dr)
    L('AMIT.', 'SUNDRY DEBTORS (FIELD STAFF)'),
    L('PHONE PAY', 'SUNDRY DEBTORS', '-38427.96'),                                # a payment mode, not a customer
    L('SHREE SURGICAL SUPPLIERS', 'SUNDRY CREDITORS (SUPPLIERS)', '120000', gstin='27ABCDE1234F1Z5'),
    L('CGST PURCHASE TAX 6 %', 'TAX - SGST', '-468922.81'),
    L('CGST PURCHASE TAX 6 %', 'TAX - SGST', '-77.19'),                           # Marg repeats the name: one ledger
    L('CASH', 'CASH-IN-HAND', '-1000'),                                           # becomes MediFlow's own "Cash"
    L('GST PAYABLE (CGST)', 'DUTIES  TAXES'),                                     # the posting code reads it as "GST Payable CGST"
    L('GST LOCAL SALES 5 %', 'SALES LOCAL'),
    L('PROFIT & LOSS A/C', 'PROFIT  LOSS AC', '1892074.12'),
]
NOTES = [
    N('R1', 'PHONE PAY', 'R1 9876500001RAVI KUMAR'), N('R2', 'CASH', 'R2 9876500001RAVI'), N('R3', 'CASH', 'R3 9876500001RAVI KUMAR'),
    N('R4', 'DR MEHTA', 'R4 9876500002DR MEHTA'), N('R5', 'CASH', 'R5 9876500003'), N('R6', 'CASH', 'R6'),
]


def test_phase2_rules():
    assert PT.note_party('R000001 9876500001RAVI KUMAR') == ('9876500001', 'RAVI KUMAR')
    assert PT.note_party('R016292') is None and PT.note_party('R5 9876500003') == ('9876500003', '')
    assert PT.side(D('-363300')) == (D('363300'), 'Dr') and PT.side(D('120000')) == (D('120000'), 'Cr')
    assert PT.natural_balance(D('5'), 'Dr', 'asset') == D('5') and PT.natural_balance(D('5'), 'Dr', 'liability') == D('-5')
    assert PT.valid_gstin('27abcde1234f1z5') == '27ABCDE1234F1Z5' and PT.valid_gstin('2323') == ''
    assert PT.temp_phone('Dr Mehta') == PT.temp_phone('DR  MEHTA') and PT.temp_phone('X').startswith('TMP-')
    assert PT.app_key('GST PAYABLE (CGST)') == PT.app_key('GST Payable CGST')
    parents = {rules.name_key(g.name): rules.name_key(g.parent) for g in MARG_GROUPS}
    names = {rules.name_key(g.name): g.name for g in MARG_GROUPS}
    assert PT.resolve_group(rules.name_key('SUNDRY DEBTORS (FIELD STAFF)'), parents, names) == ('Sundry Debtors', [])
    assert PT.resolve_group(rules.name_key('TAX - SGST'), parents, names) == ('Duties & Taxes', ['TAX - SGST'])    # "&" dropped by Marg
    assert PT.resolve_group(rules.name_key('Sales Accounts'), parents, names) == ('Sales Account', [])
    assert PT.resolve_group(rules.name_key('PROFIT & LOSS AC'), parents, names) == ('Capital Account', ['PROFIT & LOSS AC'])
    assert PT.resolve_group('NOWHERE', parents, names)[0] == PT.FALLBACK


@pytest.fixture
def books():
    """An outlet with MediFlow's own groups and ledgers, Phase 1 stock, and the October load's leftovers."""
    outlet = OutletFactory(name='Test Pharma')
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    product = MasterProductFactory(name='KNEE CAP L', pack_size=1, pack_unit='piece', pack_type='piece')
    batch = BatchFactory(outlet=outlet, product=product, batch_no='XL', qty_strips=5, pack_size=1, pack_unit='piece', pack_type='piece', is_opening_stock=True)
    StockLedgerFactory(outlet=outlet, product=product, batch=batch, qty_in=5, running_qty=5)
    old_group = LedgerGroup.objects.create(outlet=outlet, name='SUNDRY DEBTORS', nature='asset')
    old_customer = CustomerFactory(outlet=outlet, name='OLD WALKIN')
    old_ledger = Ledger.objects.create(outlet=outlet, name='OLD WALKIN', group=old_group, linked_customer=old_customer)
    old_supplier = SupplierFactory(outlet=outlet, name='OLD SUPPLIER')
    PurchaseInvoiceFactory(outlet=outlet, distributor=old_supplier)
    je = JournalEntry.objects.create(outlet=outlet, source_type='SALE', source_id=old_customer.id, date=date(2026, 5, 1), narration='old')
    JournalLine.objects.create(journal_entry=je, ledger=old_ledger, debit_amount=D('10'), credit_amount=D('0'))
    Ledger.objects.filter(outlet=outlet, name='Bad Debts').update(opening_balance=D('5720'))   # an October merge left a balance
    return outlet, batch


def run_phase2(outlet, sheet=None):
    plan = PT.build_party_plan(outlet, MARG_GROUPS, MARG_LEDGERS, NOTES, sheet)
    stock = PT.outlet_stock_fingerprint(outlet)
    deleted = PT.purge(outlet)
    done = PT.rebuild(plan)
    checked = PT.verify(plan)
    assert PT.outlet_stock_fingerprint(outlet) == stock
    return plan, deleted, done, checked


@pytest.mark.django_db
def test_old_books_go_and_mediflows_own_ledgers_stay(books):
    outlet, batch = books
    builtin_names = set(PT.builtin_ledgers(outlet).values_list('name', flat=True))
    run_phase2(outlet)
    assert not Customer.objects.filter(outlet=outlet, name='OLD WALKIN').exists()
    assert not Distributor.objects.filter(outlet=outlet, name='OLD SUPPLIER').exists()
    assert not JournalEntry.objects.filter(outlet=outlet).exists()
    assert not LedgerGroup.objects.filter(outlet=outlet, name='SUNDRY DEBTORS').exists()          # Marg's capitals group is gone
    assert builtin_names <= set(Ledger.objects.filter(outlet=outlet).values_list('name', flat=True))
    assert Ledger.objects.get(outlet=outlet, name='Bad Debts').opening_balance == 0                 # reset, Marg has no such ledger here
    batch.refresh_from_db()
    assert (batch.qty_strips, batch.is_active) == (5, True)


@pytest.mark.django_db
def test_marg_ledgers_land_where_the_app_looks_for_them(books):
    outlet, _ = books
    plan, _, done, checked = run_phase2(outlet)
    led = {l.name: l for l in Ledger.objects.filter(outlet=outlet).select_related('group', 'group__parent', 'linked_customer', 'linked_distributor')}

    mehta = led['DR MEHTA']
    assert mehta.group.name == 'Sundry Debtors' and mehta.linked_customer.name == 'DR MEHTA' and mehta.linked_customer.phone == '9876500002'
    assert (mehta.opening_balance, mehta.balance_type, mehta.current_balance) == (D('363300'), 'Dr', D('363300'))
    assert mehta.linked_customer.outstanding == D('363300') and mehta.linked_customer.customer_type == 'RETAIL'
    assert led['AMIT.'].group.name == 'Sundry Debtors' and led['AMIT.'].linked_customer.phone.startswith('TMP-')
    assert led['AMIT.'].balance_type == 'Dr' and led['GST LOCAL SALES 5 %'].balance_type == 'Cr'     # zero opening: the group's own side

    supplier = led['SHREE SURGICAL SUPPLIERS']
    assert supplier.group.name == 'Sundry Creditors' and supplier.linked_distributor.gstin == '27ABCDE1234F1Z5'
    assert (supplier.opening_balance, supplier.balance_type, supplier.current_balance) == (D('120000'), 'Cr', D('120000'))
    assert (supplier.linked_distributor.opening_balance, supplier.linked_distributor.balance_type, supplier.linked_distributor.state_code) == (D('120000'), 'CR', '27')

    tax = led['CGST PURCHASE TAX 6 %']                                       # both Marg copies, one ledger
    assert (tax.group.name, tax.group.parent.name, tax.opening_balance, tax.balance_type) == ('TAX - SGST', 'Duties & Taxes', D('469000.00'), 'Dr')
    assert led['GST LOCAL SALES 5 %'].group.name == 'SALES LOCAL' and led['GST LOCAL SALES 5 %'].group.parent.name == 'Sales Account'
    assert led['PROFIT & LOSS A/C'].group.parent.name == 'Capital Account'

    # merged into MediFlow's own ledgers: no second "CASH", PHONE PAY is not a customer
    assert 'CASH' not in led and 'PHONE PAY' not in led and 'GST PAYABLE (CGST)' not in led
    assert (led['Cash'].opening_balance, led['Cash'].balance_type, led['Cash'].group.name) == (D('1000'), 'Dr', 'Cash in Hand')
    assert (led['UPI Collections'].opening_balance, led['UPI Collections'].group.name, led['UPI Collections'].is_system) == (D('38427.96'), 'Bank Accounts', True)
    assert 'GST Payable CGST' in led
    assert not Customer.objects.filter(outlet=outlet, name='PHONE PAY').exists()
    assert (checked['opening_dr'], checked['opening_cr']) == (D('871727.96'), D('2012074.12'))


@pytest.mark.django_db
def test_walk_in_customers_come_from_the_bill_notes(books):
    outlet, _ = books
    run_phase2(outlet)
    walk = {c.phone: c.name for c in Customer.objects.filter(outlet=outlet) if not Ledger.objects.filter(linked_customer=c).exists()}
    assert walk == {'9876500001': 'RAVI KUMAR', '9876500003': 'Customer 9876500003'}     # the most used name; DR MEHTA's mobile is his
    assert Customer.objects.filter(outlet=outlet).count() == 4


@pytest.mark.django_db
def test_stock_batches_get_their_supplier(books):
    outlet, batch = books
    plan, _, done, _ = run_phase2(outlet, sheet_of(line('KNEE CAP L', 5, 100, 310, batch='XL')[:19] + ['SHREE SURGICAL SUPPLIERS'] + [''] * 4))
    batch.refresh_from_db()
    assert batch.supplier.name == 'SHREE SURGICAL SUPPLIERS' and done['batches_given_a_supplier'] == 1 and not plan.unknown_suppliers


@pytest.mark.django_db
def test_phase2_leaves_another_outlet_alone(books):
    outlet, _ = books
    other = OutletFactory()
    call_command('seed_ledgers', outlet_id=str(other.id))
    CustomerFactory(outlet=other)
    PurchaseInvoiceFactory(outlet=other, distributor=SupplierFactory(outlet=other))
    before = PT.others_fingerprint(outlet)
    run_phase2(outlet)
    assert PT.others_fingerprint(outlet) == before


@pytest.mark.django_db
def test_phase2_command_show_only_then_apply(books, tmp_path, monkeypatch):
    outlet, _ = books
    monkeypatch.setattr(files, 'read_masters', lambda p: (MARG_GROUPS, MARG_LEDGERS))
    monkeypatch.setattr(files, 'read_items', lambda p: [])
    monkeypatch.setattr(files, 'read_sale_notes', lambda p: NOTES)
    args = ['marg_import_parties', '--outlet', str(outlet.id), '--master', 'm.xml', '--daybook', 'd.xml', '--report', str(tmp_path / 'p.xlsx')]
    call_command(*args)
    assert Customer.objects.filter(outlet=outlet, name='OLD WALKIN').exists() and (tmp_path / 'p.xlsx').exists()   # nothing saved
    with pytest.raises(CommandError, match='looks live'):                    # the fixture's purchase was made today
        call_command(*args, '--apply', '--confirm', 'Test Pharma')
    call_command(*args, '--apply', '--confirm', 'Test Pharma', '--allow-live-outlet')
    assert not Customer.objects.filter(outlet=outlet, name='OLD WALKIN').exists()
    assert Ledger.objects.get(outlet=outlet, name='DR MEHTA').group.name == 'Sundry Debtors'


@pytest.mark.django_db
def test_phase2_can_run_again(books):
    """The live switch-over repeats the load with that evening's files: a second run must give the same books."""
    outlet, _ = books
    groups = MARG_GROUPS + [G('PROVISIONS', 'CURRENT LIABILITIES')]
    ledgers = MARG_LEDGERS + [L('BAD DEBTS', 'PROVISIONS', '-5720')]      # merges into MediFlow's "Bad Debts", which moves into PROVISIONS

    def once():
        plan = PT.build_party_plan(outlet, groups, ledgers, NOTES)
        PT.purge(outlet)
        PT.rebuild(plan)
        return PT.verify(plan)
    first = once()
    bad = Ledger.objects.get(outlet=outlet, name='Bad Debts')
    assert (bad.group.name, bad.group.parent.name, bad.opening_balance) == ('PROVISIONS', 'Current Liabilities', D('5720'))
    second = once()
    assert first == second
    assert Ledger.objects.filter(outlet=outlet, name='DR MEHTA').count() == 1 and Customer.objects.filter(outlet=outlet).count() == 4


# ══ Phase 3: the daybook ═════════════════════════════════════════════════════════════════════════════════════════

from apps.accounts.models import Voucher, VoucherLine   # noqa: E402
from apps.billing.models import SaleInvoice, SalesReturn   # noqa: E402
from apps.inventory.marg_import import books as BK   # noqa: E402
from apps.purchases.models import PurchaseInvoice   # noqa: E402


def IT(name, amount, rate='1000', qty='1', tax_class='LS-GST 5 %', alloc='GST LOCAL SALES 5 %', batch='', actual=None):
    a = D(amount)
    return files.MargItemLine(name=name, rate=D(rate), billed=D(qty), actual=D(actual or qty), amount=a, batch=batch, discount=D('0'),
                              tax_class=tax_class, alloc_ledger=alloc, alloc_amount=a if alloc else None)


def V(kind, number, party, lines, items=(), note='', day=date(2026, 6, 1), amount_layout=False):
    return files.MargVoucher(kind=kind, number=number, day=day, party=party, note=note, lines=tuple((n, D(a)) for n, a in lines),
                             items=tuple(items), amount_layout=amount_layout)


def test_journal_lines_correct_margs_export():
    fixes = []
    ok = BK.journal_lines(V('Sales', 'R1', 'PHONE PAY', [('PHONE PAY', '-550'), ('CASH', '-100'), ('SGST SALES TAX 2.5 %', '15.48'), ('CGST SALES TAX 2.5 %', '15.48')],
                            [IT('KNEE CAP L', '619.04')]), fixes)
    assert sum(a for _, a in ok.lines) == 0 and fixes == []
    paise = BK.journal_lines(V('Sales', 'R2', 'CASH', [('CASH', '-650'), ('SGST SALES TAX 2.5 %', '15.48'), ('CGST SALES TAX 2.5 %', '15.48')], [IT('KNEE CAP L', '618.95')]), fixes)
    assert ('Round Off', D('0.09')) in paise.lines and fixes[-1].kind == 'rounding'
    # R000136: the gel bag was sold tax-free on "LOCAL SALES TAX PAID" AND again through its item line
    double = BK.journal_lines(V('Sales', 'R3', 'CASH', [('CASH', '-370'), ('LOCAL SALES TAX PAID', '201.96'), ('SGST SALES TAX 9 %', '12.82'), ('CGST SALES TAX 9 %', '12.82')],
                                [IT('HOT WATER BAG', '142.40', tax_class='LS-GST 18 %', alloc='GST LOCAL SALES 18 %'),
                                 IT('GEL HEATING BAG', '202.07', tax_class='LS-GST 18 %', alloc='GST LOCAL SALES 18 %')]), fixes)
    assert double.dropped == {1} and ('LOCAL SALES TAX PAID', D('201.96')) in double.lines and ('GST LOCAL SALES 18 %', D('202.07')) not in double.lines
    assert sum(a for _, a in double.lines) == 0
    odd = BK.journal_lines(V('Purchase', 'P1', 'ACME SURGICALS', [('ACME SURGICALS', '7655'), ('SGST PURCHASE TAX 2.5 %', '-174.13'), ('CGST PURCHASE TAX 2.5 %', '-174.13')],
                             [IT('WALKER', '-6965', alloc='GST LOCAL PURCHASE 5 %')]), fixes)
    assert (BK.DIFF_LEDGER, D('-341.74')) in odd.lines and fixes[-1].kind == 'difference'
    assert BK.tax_kind('SGST SALES TAX 2.5 %') == ('S', D('5.0')) and BK.tax_kind('IGST SALES TAX 18 %') == ('I', D('18')) and BK.tax_kind('CASH') is None
    assert BK.item_rate(IT('X', '1', tax_class='CS-GST 5 %')) == (D('5'), True)
    assert BK.share(D('10.00'), [D('1'), D('1'), D('1')]) == [D('3.34'), D('3.33'), D('3.33')]


@pytest.mark.django_db
def test_the_daybook_becomes_bills_vouchers_and_journal(books):
    outlet, live_batch = books
    from apps.accounts.tests.factories import StaffFactory
    StaffFactory(outlet=outlet, role='admin')
    MasterProductFactory(name='GLOVE BOX', pack_size=1, pack_unit='piece', pack_type='piece', mrp=1000)
    taxes = [L(n, 'TAX - SGST') for n in ('SGST SALES TAX 2.5 %', 'CGST SALES TAX 2.5 %', 'SGST PURCHASE TAX 2.5 %', 'CGST PURCHASE TAX 2.5 %')]
    extra = [L('CARD(SWIPE )', 'SUNDRY DEBTORS'), L('SMALL SUPPLIER', 'SUNDRY CREDITORS (SUPPLIERS)')]
    plan = PT.build_party_plan(outlet, MARG_GROUPS, MARG_LEDGERS + taxes + extra, NOTES)
    PT.purge(outlet)
    PT.rebuild(plan)
    from apps.purchases.models import PurchaseInvoice as PI   # the fixture's purchase is old data: Phase 2 removed it
    assert not PI.objects.filter(outlet=outlet).exists()
    stock = PT.outlet_stock_fingerprint(outlet)
    daybook = [
        V('Sales', 'R1', 'PHONE PAY', [('PHONE PAY', '-550'), ('CASH', '-100'), ('SGST SALES TAX 2.5 %', '15.48'), ('CGST SALES TAX 2.5 %', '15.48')],
          [IT('KNEE CAP L', '619.04', batch='HEAVY')], note='R1 9876500001RAVI KUMAR'),
        V('Sales', 'R2', 'DR MEHTA', [('DR MEHTA', '-1050'), ('SGST SALES TAX 2.5 %', '25'), ('CGST SALES TAX 2.5 %', '25')], [IT('GLOVE BOX', '1000', qty='2')]),
        V('Sale Return', 'CN1', 'CASH', [('CASH', '700'), ('SGST SALES TAX 2.5 %', '-16.67'), ('CGST SALES TAX 2.5 %', '-16.67')], [IT('KNEE CAP L', '-666.66')]),
        V('Purchase', 'INV/9', 'SHREE SURGICAL SUPPLIERS', [('SHREE SURGICAL SUPPLIERS', '2100'), ('SGST PURCHASE TAX 2.5 %', '-50'), ('CGST PURCHASE TAX 2.5 %', '-50')],
          [IT('GLOVE BOX', '-2000', qty='2', actual='3', alloc='GST LOCAL SALES 5 %')]),
        V('Payment', 'P1', 'SHREE SURGICAL SUPPLIERS', [('SHREE SURGICAL SUPPLIERS', '-1000'), ('CASH', '1000')]),
        V('Journal', 'P1', 'CASH', [('CASH', '-5'), ('GST LOCAL SALES 5 %', '5')]),         # same number as the payment
        V('Sales', 'R3', 'CARD(SWIPE )', [('CARD(SWIPE )', '-525'), ('SGST SALES TAX 2.5 %', '12.5'), ('CGST SALES TAX 2.5 %', '12.5')], [IT('GLOVE BOX', '500')]),
        # Small Supplier: an older bill of 1000 and a newer one of 500, 1000 paid -> the NEWER bill is the unpaid one
        V('Purchase', 'S-OLD', 'SMALL SUPPLIER', [('SMALL SUPPLIER', '1000')], [IT('GLOVE BOX', '-1000', tax_class='', alloc='GST LOCAL SALES 5 %')], day=date(2026, 5, 1)),
        V('Purchase', 'S-NEW', 'SMALL SUPPLIER', [('SMALL SUPPLIER', '500')], [IT('GLOVE BOX', '-500', tax_class='', alloc='GST LOCAL SALES 5 %')], day=date(2026, 6, 1)),
        V('Payment', 'P2', 'SMALL SUPPLIER', [('SMALL SUPPLIER', '-1000'), ('CASH', '1000')]),
    ]
    bk = BK.build_books(outlet, daybook)
    BK.purge_books(outlet)
    done = BK.write_books(bk, BK.Ledgers(outlet), BK.History(outlet))
    dues = BK.settle(outlet)
    checked = BK.verify(bk)
    assert done['journal_entries'] == 10 and checked['sales'] == 3 and checked['sales_billed'] == D('2225.00')
    r3 = SaleInvoice.objects.get(outlet=outlet, invoice_no='R3')
    assert (r3.payment_mode, r3.card_paid, r3.cash_paid) == ('card', D('525'), D('0'))
    old, new = (PurchaseInvoice.objects.get(outlet=outlet, invoice_no=n) for n in ('S-OLD', 'S-NEW'))
    assert (old.outstanding, old.amount_paid, new.outstanding, new.amount_paid) == (D('0'), D('1000'), D('500'), D('0'))

    r1 = SaleInvoice.objects.get(outlet=outlet, invoice_no='R1')
    assert (r1.payment_mode, r1.cash_paid, r1.upi_paid, r1.grand_total, r1.taxable_amount, r1.cgst_amount) == ('split', D('100'), D('550'), D('650'), D('619.04'), D('15.48'))
    assert r1.customer.phone == '9876500001' and r1.billed_by is not None
    item = r1.items.get()
    assert (item.batch.batch_no, item.batch.is_active, item.batch.qty_strips, item.batch_no, item.gst_rate, item.gst_amount) == (BK.HISTORY_BATCH, False, 0, 'HEAVY', D('5'), D('30.96'))
    r2 = SaleInvoice.objects.get(outlet=outlet, invoice_no='R2')
    assert (r2.payment_mode, r2.credit_given, r2.amount_due, r2.customer.name) == ('credit', D('1050'), D('1050'), 'DR MEHTA')
    assert SalesReturn.objects.get(outlet=outlet).refund_mode == 'cash'

    p = PurchaseInvoice.objects.get(outlet=outlet, invoice_no='INV/9')
    assert (p.status, p.grand_total, p.gst_amount, p.distributor.name) == ('POSTED', D('2100'), D('100'), 'SHREE SURGICAL SUPPLIERS')
    assert p.items.get().free_qty == 1
    # the supplier: opened owing 120000, billed 2100, paid 1000 -> 121100 owed, and the bill itself is still unpaid
    supplier = Ledger.objects.get(outlet=outlet, name='SHREE SURGICAL SUPPLIERS')
    assert supplier.current_balance == D('121100') and (p.outstanding, p.amount_paid) == (D('2100'), D('0'))
    mehta = Ledger.objects.get(outlet=outlet, name='DR MEHTA')
    assert mehta.current_balance == D('364350') and Customer.objects.get(outlet=outlet, name='DR MEHTA').outstanding == D('364350')

    assert sorted(Voucher.objects.filter(outlet=outlet).values_list('voucher_no', flat=True)) == ['P1', 'P1-J', 'P2']
    assert VoucherLine.objects.filter(voucher__outlet=outlet).count() == 6
    for je in JournalEntry.objects.filter(outlet=outlet):
        lines = je.lines.all() if hasattr(je, 'lines') else JournalLine.objects.filter(journal_entry=je)
        assert sum(l.debit_amount for l in lines) == sum(l.credit_amount for l in lines)
    assert PT.outlet_stock_fingerprint(outlet) == stock      # old bills never move stock
    live_batch.refresh_from_db()
    assert live_batch.qty_strips == 5

    # run again (the switch-over evening repeats it): the same books, nothing doubled
    BK.purge_books(outlet)
    BK.write_books(bk, BK.Ledgers(outlet), BK.History(outlet))
    BK.settle(outlet)
    assert BK.verify(bk) == checked and Ledger.objects.get(outlet=outlet, name='DR MEHTA').current_balance == D('364350')


@pytest.mark.django_db
def test_the_pl_opening_stock_is_margs_own_1_april_figure():
    """The P&L adds up OPENING rows as "Opening Stock": they must be Marg's stock of 1 April, not today's stock again."""
    import dataclasses
    outlet = OutletFactory()
    cap = dataclasses.replace(item('KNEE CAP L'), opening_qty=D('6'), opening_value=D('2414.16'), opening_rate=D('402.36'))
    gone = dataclasses.replace(item('OLD BELT'), opening_qty=D('2'), opening_value=D('500'), opening_rate=D('250'))   # sold out since
    plan, done, checked = load(outlet, [cap, gone], sheet_of(line('KNEE CAP L', 5, '162.75', 310, 155)))
    opening = StockLedger.objects.filter(outlet=outlet, txn_type='OPENING')
    assert sorted((o.product.name, o.txn_date, o.batch, o.value_in) for o in opening) == [
        ('KNEE CAP L', date(2026, 4, 1), None, D('2414.16')), ('OLD BELT', date(2026, 4, 1), None, D('500.00'))]
    assert checked['marg_opening_stock'] == D('2914.16') and done['marg_opening_rows'] == 2
    assert ledger_health.scan(outlet)['counts']['OK'] == 1        # the batch and its ledger still agree
