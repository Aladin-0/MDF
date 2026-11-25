"""
A line the distributor gave entirely free (Qty 0, Free 3) is a real purchase line; a line with neither paid nor free packs is not.
The screen's rule is `hasQuantity` (lib/purchaseLine.ts); this is the server's copy (`check_line_quantities`).
"""
from decimal import Decimal

from apps.inventory.models import Batch, MasterProduct
from apps.purchases.services import PurchaseServiceError
from apps.purchases.tests.test_purchase_update_integrity import PurchaseUpdateBase


class FreeOnlyLineTests(PurchaseUpdateBase):
    def setUp(self):
        super().setUp()
        self.strip10 = MasterProduct.objects.create(name='Strip Ten', mrp=Decimal('100'), pack_size=10)

    def fline(self, batch_no, qty, free, **kw):
        line = self.line(self.strip10, batch_no, qty, **kw)
        line['freeQty'] = free
        line['pkg'] = 10
        return line

    def test_a_wholly_free_line_is_saved_and_adds_stock(self):
        inv = self.create(self.ledger_a, 'FREE-1', [self.line(self.strip10, 'PAID', 10), self.fline('FREEB', 0, 3)])
        free_item = inv.items.get(batch_no='FREEB')
        assert free_item.qty == 0 and free_item.free_qty == 3 and free_item.actual_qty == 30
        assert Batch.objects.get(outlet=self.outlet, product=self.strip10, batch_no='FREEB').qty_strips == 3

    def test_a_line_with_nothing_coming_in_is_refused_with_its_line(self):
        with self.assertRaises(PurchaseServiceError) as cm:
            self.create(self.ledger_a, 'FREE-2', [self.line(self.strip10, 'PAID', 10), self.fline('NONE', 0, 0)])
        assert cm.exception.code == 'INVALID_QTY' and cm.exception.item_index == 1
        assert not Batch.objects.filter(batch_no__in=['PAID', 'NONE']).exists()

    def test_negative_quantities_are_still_refused(self):
        with self.assertRaisesRegex(PurchaseServiceError, 'negative'):
            self.create(self.ledger_a, 'FREE-3', [self.fline('NEG', -1, 3)])

    def test_an_edit_may_make_a_line_wholly_free_but_not_empty(self):
        inv = self.create(self.ledger_a, 'FREE-4', [self.line(self.strip10, 'E1', 5)])
        self.edit(inv, self.ledger_a, [self.fline('E1', 0, 5)])
        with self.assertRaisesRegex(PurchaseServiceError, 'quantity'):
            self.edit(inv, self.ledger_a, [self.fline('E1', 0, 0)])
