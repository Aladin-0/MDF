"""
Sale integrity rules shared by the create and revise paths.

Follows docs/testing_architecture.md: exact Decimal assertions for money (never floats),
isolated test DB, deterministic fixtures.
"""
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.billing.models import SaleInvoice
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice
from apps.billing.utils.item_amounts import resolve_item_amounts, split_amounts, MAX_ROUND_OFF
from apps.billing.utils.pricing import line_cost_floor
from apps.inventory.models import Batch


def D(value) -> Decimal:
    return Decimal(str(value))


class ResolveItemAmountsTests(SimpleTestCase):
    def test_complete_payload_passes_through_untouched(self):
        got = resolve_item_amounts({'gstRate': 12, 'taxableAmount': 84.75, 'gstAmount': 15.25, 'totalAmount': 100})
        self.assertEqual(got, {'gst_rate': D(12), 'taxable': D('84.75'), 'gst': D('15.25'), 'total': D(100)})

    def test_total_only_is_split_using_the_gst_rate(self):
        got = resolve_item_amounts({'totalAmount': 1120, 'gstRate': 12})
        self.assertEqual((got['taxable'], got['gst'], got['total']), (D('1000.00'), D('120.00'), D(1120)))

    def test_gst_rate_falls_back_to_the_product_rate_but_a_sent_rate_wins(self):
        self.assertEqual(resolve_item_amounts({'totalAmount': 118}, default_gst_rate=18)['taxable'], D('100.00'))
        self.assertEqual(resolve_item_amounts({'totalAmount': 105, 'gstRate': 5}, default_gst_rate=18)['taxable'], D('100.00'))
        self.assertEqual(resolve_item_amounts({'totalAmount': 100, 'gstRate': 0}, default_gst_rate=18)['gst'], D('0.00'))

    def test_taxable_and_gst_without_total_sum_to_the_total(self):
        got = resolve_item_amounts({'taxableAmount': 200, 'gstAmount': 24})
        self.assertEqual(got['total'], D(224))

    def test_zero_total_with_taxable_and_gst_uses_their_sum(self):
        got = resolve_item_amounts({'totalAmount': 0, 'taxableAmount': 90, 'gstAmount': 0})
        self.assertEqual((got['taxable'], got['gst'], got['total']), (D(90), D(0), D(90)))

    def test_nothing_sent_prices_the_line_from_rate_qty_and_discount(self):
        # 2 strips + 5 loose of a 10-pack = 2.5 packs at 90, 10% off.
        got = resolve_item_amounts({'rate': 90, 'qtyStrips': 2, 'qtyLoose': 5, 'discountPct': 10}, pack_size=10)
        self.assertEqual(got['total'], D('202.50'))

    def test_wholesale_rates_are_tax_exclusive_so_gst_is_added_on_top(self):
        retail = resolve_item_amounts({'rate': 100, 'qtyStrips': 1, 'gstRate': 12}, sale_type='RETAIL')
        wholesale = resolve_item_amounts({'rate': 100, 'qtyStrips': 1, 'gstRate': 12}, sale_type='WHOLESALE')
        self.assertEqual(retail['total'], D('100.00'))
        self.assertEqual((wholesale['total'], wholesale['taxable'], wholesale['gst']),
                         (D('112.00'), D('100.00'), D('12.00')))

    def test_no_rate_and_no_amounts_is_an_all_zero_free_line(self):
        got = resolve_item_amounts({'qtyStrips': 3})
        self.assertEqual((got['taxable'], got['gst'], got['total']), (D(0), D(0), D(0)))

    def test_derived_parts_always_add_back_to_the_total(self):
        for total, rate in [('99.99', 18), ('0.07', 5), ('12345.67', 28), ('1.00', 12)]:
            got = resolve_item_amounts({'totalAmount': total, 'gstRate': rate})
            self.assertEqual(got['taxable'] + got['gst'], D(total))


class SplitAmountsTests(SimpleTestCase):
    def test_parts_add_back_to_the_whole_and_the_last_part_takes_the_remainder(self):
        whole = {'gst_rate': D(12), 'taxable': D('89.29'), 'gst': D('10.71'), 'total': D('100.00')}
        parts = split_amounts(whole, [1, 1, 1])
        for key in ('taxable', 'gst', 'total'):
            self.assertEqual(sum(p[key] for p in parts), whole[key])
        self.assertEqual([p['total'] for p in parts], [D('33.33'), D('33.33'), D('33.34')])

    def test_weights_apportion_proportionally(self):
        whole = {'gst_rate': D(0), 'taxable': D(500), 'gst': D(0), 'total': D(500)}
        parts = split_amounts(whole, [3, 2])
        self.assertEqual([p['total'] for p in parts], [D('300.00'), D('200.00')])

    def test_single_allocation_is_unchanged(self):
        whole = {'gst_rate': D(0), 'taxable': D(50), 'gst': D(0), 'total': D(50)}
        self.assertEqual(split_amounts(whole, [4]), [whole])


class LineCostFloorTests(SimpleTestCase):
    def _batch(self, **kw):
        base = dict(purchase_rate=D(80), landing_rate=D(0), ptr=D(0), pts=D(0), pack_size=10)
        base.update(kw)
        return SimpleNamespace(**base)

    def test_retail_floor_is_landing_cost_else_ptr_else_purchase_rate(self):
        self.assertEqual(line_cost_floor(self._batch(landing_rate=D(90)), 'RETAIL', 1, 0, 0)['line_floor'], D('90.00'))
        self.assertEqual(line_cost_floor(self._batch(ptr=D(85)), 'RETAIL', 1, 0, 0)['line_floor'], D('85.00'))
        floor = line_cost_floor(self._batch(), 'RETAIL', 1, 0, 0)
        self.assertEqual((floor['line_floor'], floor['label']), (D('80.00'), 'landing cost'))

    def test_wholesale_floor_is_the_purchase_rate(self):
        floor = line_cost_floor(self._batch(landing_rate=D(95)), 'WHOLESALE', 2, 0, 0)
        self.assertEqual((floor['line_floor'], floor['label']), (D('160.00'), 'purchase rate'))

    def test_gst_is_added_unless_the_cost_already_includes_it(self):
        self.assertEqual(line_cost_floor(self._batch(), 'RETAIL', 1, 0, 12)['line_floor'], D('89.60'))
        self.assertEqual(line_cost_floor(self._batch(), 'RETAIL', 1, 0, 12, landing_cost_include_gst=True)['line_floor'], D('80.00'))

    def test_loose_units_count_as_a_fraction_of_a_pack(self):
        self.assertEqual(line_cost_floor(self._batch(), 'RETAIL', 0, 5, 0)['line_floor'], D('40.00'))

    def test_free_only_lines_and_costless_batches_have_no_floor(self):
        self.assertEqual(line_cost_floor(self._batch(), 'RETAIL', 0, 0, 0)['line_floor'], D('0'))
        self.assertEqual(line_cost_floor(self._batch(purchase_rate=D(0)), 'RETAIL', 1, 0, 0)['line_floor'], D('0'))


class ReviseIntegrityTests(BaseRevisionTestCase):
    """The fixture batch costs 8 per strip (see base.py)."""

    def _revise(self, invoice, items, grand_total, **extra):
        self.authenticate_as(self.manager)
        payload = {
            'customerId': str(self.customer.id), 'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST', 'revisionReasonText': 'integrity test',
            'grandTotal': grand_total, 'subtotal': grand_total, 'cashPaid': grand_total, 'items': items,
        }
        payload.update(extra)
        return self.client.post(reverse('sale-revise', kwargs={'sale_id': invoice.id}), payload, format='json')

    def _invoice(self):
        return make_test_invoice(self.outlet, self.billing_staff, self.customer,
                                 items=[{'batch': self.batch, 'qty': 5, 'rate': 10}], status='finalized', paid=0)

    def _item(self, **extra):
        item = {'productId': str(self.medicine.id), 'batchId': str(self.batch.id), 'qtyStrips': 1, 'qtyLoose': 0}
        item.update(extra)
        return item

    def test_a_bill_cannot_be_revised_below_its_cost(self):
        invoice = self._invoice()
        before = SaleInvoice.objects.get(pk=invoice.pk).grand_total

        response = self._revise(invoice, [self._item(rate=5, totalAmount=5)], 5)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Loss Sale Prevented', response.data['detail'])
        invoice.refresh_from_db()
        self.assertEqual(invoice.grand_total, before)  # nothing changed

    def test_a_bill_can_be_revised_down_to_exactly_its_cost(self):
        invoice = self._invoice()
        response = self._revise(invoice, [self._item(rate=8, totalAmount=8)], 8)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.grand_total, Decimal('8.00'))

    def test_gst_is_derived_server_side_when_the_client_omits_item_amounts(self):
        self.medicine.gst_rate = Decimal('12.00')
        self.medicine.save()
        invoice = self._invoice()

        # Retail rates are tax-inclusive (and capped at MRP 100): 100 = 89.29 taxable + 10.71 GST at 12%.
        response = self._revise(invoice, [self._item(rate=100)], 100)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        item = invoice.items.get()
        self.assertEqual((item.taxable_amount, item.gst_amount, item.total_amount, item.gst_rate),
                         (Decimal('89.29'), Decimal('10.71'), Decimal('100.00'), Decimal('12.00')))
        self.assertEqual(invoice.taxable_amount, Decimal('89.29'))
        self.assertEqual(invoice.cgst_amount + invoice.sgst_amount, Decimal('10.71'))

    def test_a_grand_total_that_disagrees_with_the_lines_is_refused(self):
        invoice = self._invoice()
        response = self._revise(invoice, [self._item(rate=10, totalAmount=10)], D(10) + MAX_ROUND_OFF + 1)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid Round Off', response.data['detail'])

    def test_a_line_fulfilled_from_several_batches_is_not_counted_once_per_batch(self):
        """FEFO splits one billed line over batches. Each stored row used to carry the full line amounts,
        multiplying taxable value and GST by the number of batches."""
        invoice = make_test_invoice(self.outlet, self.billing_staff, self.customer,
                                    items=[{'batch': self.batch, 'qty': 1, 'rate': 10}], status='finalized', paid=0)
        # A revise first returns the old line's 1 strip to this batch: 2 + 1 = 3 strips available here,
        # so a 5-strip line must take 3 from this batch and 2 from the next-expiring one.
        self.batch.refresh_from_db()
        self.batch.qty_strips = 2
        self.batch.save()
        second = Batch.objects.create(
            outlet=self.outlet, product=self.medicine, batch_no='B-SECOND',
            expiry_date=timezone.now().date() + timedelta(days=400), mrp=Decimal('100.00'),
            purchase_rate=Decimal('8.00'), pack_size=10, pack_type='strip', qty_strips=10, qty_loose=0,
        )

        response = self._revise(invoice, [{'productId': str(self.medicine.id), 'qtyStrips': 5, 'qtyLoose': 0,
                                           'rate': 100, 'totalAmount': 500}], 500)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        rows = list(invoice.items.order_by('batch_no'))
        self.assertEqual(len(rows), 2, 'expected the line to be split over two batches')
        self.assertEqual(sum(r.total_amount for r in rows), Decimal('500.00'))
        self.assertEqual(sum(r.taxable_amount + r.gst_amount for r in rows), Decimal('500.00'))
        self.assertEqual(invoice.grand_total, Decimal('500.00'))
        self.assertEqual({r.batch_id for r in rows}, {self.batch.id, second.id})


class CreateIntegrityTests(BaseRevisionTestCase):
    """The create path must persist what it validated and hold the same integrity rules as revise."""

    URL_NAME = 'sale-list-create'

    def _create(self, items, grand_total, **extra):
        self.authenticate_as(self.manager)
        payload = {
            'outletId': str(self.outlet.id), 'customerId': str(self.customer.id),
            'grandTotal': grand_total, 'subtotal': grand_total, 'cashPaid': grand_total, 'paymentMode': 'cash',
            'invoiceDate': '2026-08-01', 'items': items,
        }
        payload.update(extra)
        return self.client.post(reverse(self.URL_NAME), payload, format='json')

    def _item(self, **extra):
        item = {'productId': str(self.medicine.id), 'batchId': str(self.batch.id), 'qtyStrips': 1, 'qtyLoose': 0}
        item.update(extra)
        return item

    def test_extra_discount_is_stored_on_the_lines_not_booked_as_round_off(self):
        """Client sends the pre-discount line (100) plus extraDiscountPct 10 and bills 90. The server prices the
        row at 90 for validation, so it must store 90 too; previously it stored 100 and booked -10 as round-off,
        overstating taxable value and GST."""
        response = self._create([self._item(rate=100, taxableAmount=100, gstAmount=0, totalAmount=100)], 90,
                                extraDiscountPct=10)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = SaleInvoice.objects.get(pk=response.data['id'])
        item = invoice.items.get()
        self.assertEqual((item.total_amount, item.taxable_amount, item.gst_amount),
                         (Decimal('90.00'), Decimal('90.00'), Decimal('0.00')))
        self.assertEqual(invoice.taxable_amount, Decimal('90.00'))
        self.assertEqual(invoice.round_off, Decimal('0.00'))
        self.assertEqual(invoice.grand_total, Decimal('90.00'))

    def test_the_pos_payload_is_stored_exactly_as_sent(self):
        """Paisa-exact taxable/GST from the POS (already discounted) must not be re-derived."""
        response = self._create([self._item(rate=100, gstRate=12, taxableAmount=80.36, gstAmount=9.64,
                                             totalAmount=90)], 90)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        item = SaleInvoice.objects.get(pk=response.data['id']).items.get()
        self.assertEqual((item.taxable_amount, item.gst_amount, item.total_amount),
                         (Decimal('80.36'), Decimal('9.64'), Decimal('90.00')))

    def test_rounding_up_to_the_limit_is_accepted_and_beyond_it_is_refused(self):
        line = self._item(rate=100, taxableAmount=100, gstAmount=0, totalAmount=100)
        ok = self._create([line], 98)  # -2.00 is exactly the limit
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED, ok.data)
        self.assertEqual(SaleInvoice.objects.get(pk=ok.data['id']).round_off, -MAX_ROUND_OFF)

        stock_before = Batch.objects.get(pk=self.batch.pk).qty_strips
        bad = self._create([line], D(100) - MAX_ROUND_OFF - Decimal('0.01'))
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad.data['code'], 'INVALID_ROUND_OFF')
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).qty_strips, stock_before)  # rolled back
        self.assertEqual(SaleInvoice.objects.count(), 1)

    def test_gst_is_derived_when_the_client_omits_item_amounts(self):
        self.medicine.gst_rate = Decimal('12.00')
        self.medicine.save()
        response = self._create([self._item(rate=100)], 100)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        item = SaleInvoice.objects.get(pk=response.data['id']).items.get()
        self.assertEqual((item.taxable_amount, item.gst_amount, item.total_amount, item.gst_rate),
                         (Decimal('89.29'), Decimal('10.71'), Decimal('100.00'), Decimal('12.00')))

    def test_a_line_fulfilled_from_several_batches_is_split_not_duplicated(self):
        self.batch.qty_strips = 3
        self.batch.save()
        Batch.objects.create(
            outlet=self.outlet, product=self.medicine, batch_no='B-SECOND',
            expiry_date=timezone.now().date() + timedelta(days=400), mrp=Decimal('100.00'),
            purchase_rate=Decimal('8.00'), pack_size=10, pack_type='strip', qty_strips=10, qty_loose=0,
        )

        response = self._create([{'productId': str(self.medicine.id), 'qtyStrips': 5, 'qtyLoose': 0, 'rate': 100,
                                  'taxableAmount': 500, 'gstAmount': 0, 'totalAmount': 500}], 500)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = SaleInvoice.objects.get(pk=response.data['id'])
        rows = list(invoice.items.order_by('batch_no'))
        self.assertEqual(len(rows), 2)
        self.assertEqual(sorted(r.total_amount for r in rows), [Decimal('200.00'), Decimal('300.00')])
        self.assertEqual(sum(r.taxable_amount + r.gst_amount for r in rows), Decimal('500.00'))
        self.assertEqual(invoice.taxable_amount, Decimal('500.00'))
        self.assertEqual(invoice.round_off, Decimal('0.00'))

    def test_a_loss_sale_is_still_refused_on_create(self):
        response = self._create([self._item(rate=5, taxableAmount=5, gstAmount=0, totalAmount=5)], 5)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'LOSS_SALE_PREVENTED')
