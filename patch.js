const fs = require('fs');
let code = fs.readFileSync('apps/frontend/hooks/useSaveBill.ts', 'utf8');

code = code.replace(
    /const getPaid = \(method: string\) => {([\s\S]*?)return 0;\n\s+};/,
    `const getPaid = (method: string) => {
                if (draft.payment.method === method) return draft.payment.amount || totals.grandTotal;
                if (draft.payment.method === 'split') {
                    return (draft.payment.splitBreakdown as any)?.[method] || 0;
                }
                return 0;
            };`
);

code = code.replace(
    /paymentMode: payment\.method,/,
    `paymentMode: draft.payment.method,`
);

code = code.replace(
    /cashPaid: getPaid\('cash'\),/,
    `cashPaid: draft.payment.method === 'cash' ? (draft.payment.cashTendered || totals.grandTotal) : getPaid('cash'),`
);

fs.writeFileSync('apps/frontend/hooks/useSaveBill.ts', code);
