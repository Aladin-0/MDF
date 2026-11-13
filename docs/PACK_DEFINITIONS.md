# Pack size, unit and type (and selling loose)

Read this before touching pack size / unit / type, `qty_loose`, loose selling, or the product / batch
edit screens.

## The model

A pack is described by three fields, stored **twice**:

* `MasterProduct` — the catalogue entry (global, shared by all outlets).
* `Batch` — a copy on every stock batch (per outlet). **Billing sells from the batch**: stock maths, the
  Loose box, the sale validation and the printed bill all read the batch's copy.

`pack_size` = how many counted units are in one pack (10 tablets per strip). `pack_unit` is only a label
(Tablet, Piece, ml). `pack_type` is the container (strip, box, bottle...).

## The rule (one place)

`apps/inventory/pack_rules.py`:

```
allows_loose(pack_size, pack_type)  =  pack_size > 1  and  pack_type in LOOSE_PACK_TYPES
LOOSE_PACK_TYPES = strip, blister, box, packet, other
```

Bottles, vials, tubes, jars... with a size above 1 mean a volume/weight (100 ml), not 100 sellable
items, so they sell whole only. To change who may be sold loose, edit `LOOSE_PACK_TYPES`
(and the same set in `apps/frontend/lib/packRules.ts`); nothing else.

The API sends the answer as **`allowsLoose`** on every product and batch. The frontend uses that flag
(`lib/packRules.ts allowsLoose()` only falls back to the same rule for old payloads). Never write a new
`packType === 'strip'` / `packSize > 1` check in the UI or the services.

## Keeping the two copies in step

* Editing a **product's** pack (`PUT /products/<id>/`) copies unit and type to **all** of its batches
  (every outlet) and, if the pack size itself changed, the size too; loose stock is re-folded
  (`qty_loose < pack_size`). The response carries `batchesUpdated`. Saving the product again repairs a
  batch that drifted earlier.
* A batch's pack **size** may legitimately differ (a purchase can change it), so an unrelated product edit
  never overwrites it.
* Editing one **batch** (`PUT /batches/<id>/`, the inline edit on the product page) changes only that
  batch, and is enough to fix billing for it: the sale is validated against the batch.
* `manage.py repair_pack_definitions [--apply] [--outlet <id>]` finds/repairs batches already out of step
  (dry run by default; it only *reports* size differences and invalid products).

## Validation on every write

`pack_errors()` runs on product create/update and batch update, on the pack **as it will be after the
edit** (so fixing one field is fine, and an unrelated edit never trips over an old bad pack). It refuses:
size < 1, empty unit, a type that is not in `PACK_TYPE_LABELS`, and the strip/blister-counted-in-pieces
mix-up (type `strip` with unit Piece / Box / Bottle...). The lists the UI offers
(`constants/productBehavior.ts`) must equal `PACK_TYPE_LABELS`.

## What went wrong before (so it is not reintroduced)

* The product edit changed only the product; the batches billing sells from kept the wrong pack, so the
  edit "did nothing" at the counter. The `batches` rows the modal sends are not used by the server.
* The sale check read the **product's** copy while the screen and the stock maths used the **batch's**.
* Three copies of a "runtime correction" (`_canonical_pack_type`) quietly reinterpreted bad data instead of
  rejecting it, plus a one-time migration (`inventory/0016`) for the same symptom. Do not add another.
* The edit modal rewrote unit/size on load (an effect on `packType`), so just opening and saving a bottle
  turned it into size 1 / Piece. Defaults now apply only when the user picks a type.
* Server field errors were thrown as the JSON body, but the modal read `err.response`, so every validation
  message showed as "Unknown error". Use `lib/apiError.ts apiErrorMessage`.

## PKG on a purchase line (units per pack)

`PKG` on a purchase line = how many units are in one pack of what the supplier delivered. It decides how much stock the line adds (`actual_qty = (qty + free) x PKG`) and, for a new batch, the pack size billing sells from. One rule, in `apps/inventory/pack_rules.py` (`parse_purchase_pkg`, `MAX_PURCHASE_PKG = 1000`) and mirrored by `lib/purchasePack.ts` (`parsePkg`, `MAX_PKG`):

* **A whole number from 1 to 1000. Never guessed.** Blank, 0, negative, a decimal or text is refused (the server code was `int(pkg or 1)`: 0 and "" became 1, 7.5 was cut to 7, -5 was stored as the batch's pack size; the schema and the payload builder also turned a blank into 1). A line that does not send `pkg` at all gets the product's own pack size.
* **The server works out `actual_qty`**; the browser's figure is ignored.
* **A batch that already holds stock cannot be re-sized by a purchase** (`_adopt_pack_size` in `purchases/services.py`, both save and edit): the batch stores packs, so a new pack size would silently re-label every pack on the shelf (100 strips of 10 = 1,000 units became 1,500 units that do not exist). Allowed only when the batch holds nothing but what THIS purchase put in (no earlier purchases, nothing sold, no loose). Otherwise `PACK_SIZE_CONFLICT`: enter the batch's size, use a different batch number, or correct the batch in Inventory first. A different BATCH of the same product may have its own pack size (a supplier may send another pack). The same batch twice on one invoice must agree.
* The API answers a refused line with `{error: {code: 'INVALID_PKG' | 'PACK_SIZE_CONFLICT', message, itemIndex}}`; the screen marks that line's PKG and puts the cursor there (the phone opens that line).
* **The catalogue's size is a hint, not a lock.** 83% of the catalogue has pack size 1 ("never filled in"), so the clerk entering the real size on the purchase line is the normal case and gets no warning. When the catalogue has a real size above 1 and the line differs (catalogue 10, line 15) the box says `Catalogue: 10` and saving asks once ("Check the pack sizes": each such line with the units it would add). When EDITING a saved purchase only lines whose PKG changed are asked about. The edit screen gets `productPackSize` with each line for this.
* The grid's PKG box and the phone's PKG field take whole numbers and stop at the first non-digit (`15.5` is 15, never 155); a PKG over 200 shows "Very large pack: check".
* A purchase never changes the product's own pack size. Fixing a wrong catalogue size is done on the product (Inventory), which re-folds its batches (above).
* Tests: `apps/purchases/tests/test_purchase_pkg.py`, `lib/__tests__/purchasePack.test.ts`, the PKG blocks of `components/purchases/__tests__/NewPurchaseFormUX.test.tsx` and `components/purchases/mobile/*.test.tsx`.

