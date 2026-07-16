const fs = require('fs');
let code = fs.readFileSync('apps/frontend/components/billing-v3/RightBillingRail.tsx', 'utf8');

// Remove local state
code = code.replace(
    /const \[localPaymentMethod, setLocalPaymentMethod\] = useState<'cash' \| 'upi' \| 'card' \| 'credit'>\('cash'\);\n\s*const \[cashReceived, setCashReceived\] = useState<string>\(''\);/,
    `const paymentMethod = draft?.payment?.method || 'cash';
    const cashReceived = draft?.payment?.cashTendered ? String(draft.payment.cashTendered) : '';

    const setPaymentMethod = (mode: any) => {
        useBillingStore.getState().setPayment({ method: mode });
    };

    const setCashReceived = (val: string) => {
        useBillingStore.getState().setPayment({ cashTendered: val === '' ? 0 : Number(val) });
    };`
);

// Replace localPaymentMethod with paymentMethod
code = code.replace(/localPaymentMethod/g, 'paymentMethod');
code = code.replace(/setLocalPaymentMethod/g, 'setPaymentMethod');

// Remove args from saveBill
code = code.replace(/await saveBill\(\{\s*method: paymentMethod,[\s\S]*?creditGiven: 0\s*\}\);/, `// Ensure final grandTotal is updated before saving
            useBillingStore.getState().setPayment({
                amount: totals.grandTotal,
                cashReturned: paymentMethod === 'cash' ? balance : 0,
            });
            await saveBill();`);

fs.writeFileSync('apps/frontend/components/billing-v3/RightBillingRail.tsx', code);
