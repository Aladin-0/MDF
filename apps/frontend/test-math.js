const draft = {
    cart: [{
        rate: 703,
        mrp: 740,
        totalQty: 1,
        gstRate: 5,
        scheduleType: 'OTC'
    }],
    extraDiscountPct: 0
};

const extraDiscPct = draft.extraDiscountPct || 0;
const discountFactor = extraDiscPct > 0 ? 1 - extraDiscPct / 100 : 1;

let subtotal = 0;
let totalRateAmount = 0;
let taxableAmount = 0;
let cgstAmount = 0;
let sgstAmount = 0;
let totalQty = 0;

draft.cart.forEach(item => {
    const rawTotal = item.rate * item.totalQty;
    const gstRate = item.gstRate || 0;

    subtotal += item.mrp * item.totalQty;
    totalRateAmount += rawTotal;
    totalQty += item.totalQty;

    const discountedTotal = rawTotal * discountFactor;

    const itemTaxable = gstRate > 0
        ? Number((discountedTotal / (1 + gstRate / 100)).toFixed(2))
        : Number(discountedTotal.toFixed(2));
    const itemGst = Number((discountedTotal - itemTaxable).toFixed(2));

    taxableAmount += itemTaxable;

    const itemCgst = Math.floor(itemGst * 100 / 2) / 100;
    const itemSgst = Number((itemGst - itemCgst).toFixed(2));
    cgstAmount += itemCgst;
    sgstAmount += itemSgst;
});

const exactTotal = taxableAmount + cgstAmount + sgstAmount;
const grandTotal = Math.round(exactTotal);

console.log({
    subtotal,
    totalRateAmount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    exactTotal,
    grandTotal
});
