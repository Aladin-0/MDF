const axios = require('axios');

async function testRevise() {
  try {
    const loginRes = await axios.post('http://localhost:8000/api/v1/auth/token/', { username: 'admin', password: 'password' });
    const token = loginRes.data.access;
    
    const invoiceRes = await axios.get('http://localhost:8000/api/v1/sales/f65314de-c78e-4729-82a1-3617a86d1f1b/', { headers: { Authorization: `Bearer ${token}` } });
    const fullInvoice = invoiceRes.data;
    
    const itemsData = fullInvoice.items.map(item => ({
        batchId: item.batchId, name: item.name, batchNo: item.batchNo, expiryDate: item.expiryDate, productId: item.productId,
        qtyStrips: 1, qtyLoose: 0, saleMode: item.saleMode, mrp: item.mrp || 0, saleRate: item.saleRate || item.rate || 0,
        packSize: item.packSize || 1, rate: item.rate, discountPct: item.discountPct, gstRate: item.gstRate, scheduleType: item.scheduleType || 'OTC',
        taxableAmount: item.taxableAmount, gstAmount: item.gstAmount, totalAmount: item.totalAmount
    }));

    const payload = {
        outletId: fullInvoice.outletId, paymentMode: fullInvoice.paymentMode, isReturn: false, cashPaid: fullInvoice.grandTotal, upiPaid: 0, cardPaid: 0, creditGiven: 0, amountDue: 0,
        customer: fullInvoice.customer?.id || null, doctor: fullInvoice.doctor?.id || null, hospitalName: fullInvoice.hospitalName || "", prescriptionNo: fullInvoice.prescriptionNo || "",
        patientName: fullInvoice.patientName || "", patientAddress: fullInvoice.patientAddress || "", items: itemsData, subtotal: fullInvoice.subtotal, discountAmount: fullInvoice.discountAmount,
        taxableAmount: fullInvoice.taxableAmount, cgstAmount: fullInvoice.cgstAmount, sgstAmount: fullInvoice.sgstAmount, igstAmount: 0, cgst: fullInvoice.cgst, sgst: fullInvoice.sgst, igst: 0, roundOff: fullInvoice.roundOff,
        grandTotal: fullInvoice.grandTotal, revisionAction: 'header_correction', revisionReasonCode: 'CUSTOMER_REQUEST', revisionReasonText: 'Test'
    };

    const reviseRes = await axios.post('http://localhost:8000/api/v1/sales/f65314de-c78e-4729-82a1-3617a86d1f1b/revise/', payload, { headers: { Authorization: `Bearer ${token}` } });
    console.log("Revise Response:", reviseRes.data);
  } catch (err) {
    if (err.response) console.error("Error from API:", err.response.status, err.response.data);
    else console.error("Error:", err.message);
  }
}
testRevise();
