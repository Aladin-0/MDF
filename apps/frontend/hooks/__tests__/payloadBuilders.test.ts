import {
    buildScheduleHPayload,
    buildSalePayload,
    buildPurchasePayload,
    buildReturnPayload,
    buildVoucherPayload
} from '../../utils/payloadBuilders';

describe('payloadBuilders', () => {

    describe('buildScheduleHPayload', () => {
        it('should return scheduleHData from draft if present', () => {
            const draft = { scheduleHData: { patientName: 'John', patientAge: 30 } };
            const result = buildScheduleHPayload(null, null, draft);
            expect(result).toEqual({ patientName: 'John', patientAge: 30 });
        });

        it('should build scheduleH payload from customer and doctor', () => {
            const customer = { id: 'c1', name: 'Jane Doe', dob: '1990-01-01', address: '123 Main St' };
            const doctor = { id: 'd1', name: 'Dr. Smith', regNo: 'REG123' };
            const draft = { prescriptionNo: 'RX123' };

            const result = buildScheduleHPayload(customer, doctor, draft);
            
            expect(result.patientName).toBe('Jane Doe');
            expect(result.patientAge).toBeGreaterThan(0);
            expect(result.patientAddress).toBe('123 Main St');
            expect(result.doctorName).toBe('Dr. Smith');
            expect(result.doctorRegNo).toBe('REG123');
            expect(result.prescriptionNo).toBe('RX123');
        });

        it('should return undefined if customer or doctor is mock', () => {
            const customer = { id: 'mock' };
            const doctor = { id: 'd1' };
            const result = buildScheduleHPayload(customer, doctor, null);
            expect(result).toBeUndefined();
        });
    });

    describe('buildSalePayload', () => {
        it('should build sale payload with all required fields', () => {
            const draft = {
                customer: { id: 'c1' },
                customerLedger: { id: 'cl1', isMock: false },
                doctor: { id: 'd1', name: 'Dr. Smith' },
                cart: [
                    {
                        batchId: 'b1', name: 'Paracetamol', batchNo: 'B123', expiryDate: '2025-12',
                        productId: 'p1', qtyStrips: 1, qtyLoose: 0, saleMode: 'strip',
                        mrp: 100, packSize: 10, rate: 80, discountPct: 0, gstRate: 12,
                        scheduleType: 'H', totalQty: 1
                    }
                ],
                invoiceDate: '2023-10-10',
                hospitalName: 'General Hospital',
                prescriptionNo: 'RX123',
                payment: { method: 'cash', cashTendered: 100 },
                extraDiscountPct: 5
            };
            const scheduleHData = { patientName: 'John' };
            const totals = {
                subtotal: 80,
                discountAmount: 0,
                extraDiscountAmount: 4,
                taxableAmount: 67.86,
                cgstAmount: 4.07,
                sgstAmount: 4.07,
                roundOff: 0,
                grandTotal: 76
            };
            const activeStaff = { id: 's1' };
            const outletId = 'o1';

            const result = buildSalePayload(draft, scheduleHData, totals, activeStaff, outletId);

            expect(result.outletId).toBe('o1');
            expect(result.invoiceDate).toBe(new Date('2023-10-10').toISOString());
            expect(result.partyLedgerId).toBe('cl1');
            expect(result.customerId).toBe('c1');
            expect(result.doctorId).toBe('d1');
            expect(result.doctorName).toBe('Dr. Smith');
            expect(result.scheduleHData).toEqual({ patientName: 'John' });
            expect(result.cashPaid).toBe(100);
            expect(result.grandTotal).toBe(76);

            // Test item calculations
            expect(result.items).toHaveLength(1);
            const item = result.items[0];
            expect(item.productId).toBe('p1');
            expect(item.scheduleType).toBe('H');
            
            // rate * qty = 80
            // extra discount = 5% -> 80 * 0.95 = 76
            // taxable = 76 / 1.12 = 67.86
            expect(item.totalAmount).toBe(76);
            expect(item.taxableAmount).toBe(67.86);
            expect(item.gstAmount).toBeCloseTo(76 - 67.86, 2);
        });

        it('should resolve split payment correctly', () => {
            const draft = {
                customer: { id: 'c1' },
                customerLedger: { id: 'cl1', isMock: false },
                doctor: { id: 'mock' },
                cart: [],
                payment: { method: 'split', splitBreakdown: { cash: 20, upi: 30, card: 50, credit: 0 } }
            };
            const totals = { subtotal: 100, discountAmount: 0, extraDiscountAmount: 0, taxableAmount: 100, cgstAmount: 0, sgstAmount: 0, roundOff: 0, grandTotal: 100 };
            
            const result = buildSalePayload(draft, null, totals, null, 'o1');
            
            expect(result.paymentMode).toBe('split');
            expect(result.cashPaid).toBe(20);
            expect(result.upiPaid).toBe(30);
            expect(result.cardPaid).toBe(50);
            expect(result.creditGiven).toBe(0);
        });
    });

    describe('buildPurchasePayload', () => {
        it('should correctly calculate freight and discounts in purchase payload', () => {
            const formState = {
                partyLedgerId: 'pl1',
                purchaseType: 'cash',
                invoiceNo: 'INV1',
                invoiceDate: '2023-10-10',
                freight: 15,
                notes: 'Test purchase'
            };
            const items = [
                {
                    productId: 'p1', qty: 10, freeQty: 2, pkg: 1, purchaseRate: 50,
                    discountPct: 10, cashDiscountPct: 2, gstRate: 12, cess: 0,
                    mrp: 100, ptr: 60, pts: 50, isCustom: false
                }
            ];
            
            const result = buildPurchasePayload(
                formState, items, 'o1',
                500, // goodsValue
                50,  // totalTradeDisc
                10,  // totalCashDisc
                440, // taxableValue
                52.8,// totalGST
                0,   // totalCess
                0.2, // roundOff
                0,   // effectiveAdjustment
                '',  // ledgerNote
                508  // netPayable
            );

            expect(result.freight).toBe(15);
            expect(result.discountAmount).toBe(60); // 50 + 10
            expect(result.taxableAmount).toBe(440);
            expect(result.grandTotal).toBe(508);
            expect(result.items).toHaveLength(1);
            
            const item = result.items[0];
            // base = qty(10) * rate(50) * 0.9 (trade disc) * 0.98 (cash disc) = 500 * 0.9 * 0.98 = 441
            expect(item.taxableAmount).toBe(441);
            expect(item.qty).toBe(10);
            expect(item.actualQty).toBe(12); // (10 + 2) * pkg(1)
        });
    });

    describe('buildReturnPayload', () => {
        it('should calculate strip and loose quantities correctly', () => {
            const returnData = { updatedAt: '2023-10-10T00:00:00Z' };
            const items = [
                {
                    originalSaleItemId: 'si1', batchId: 'b1', productName: 'Drug A',
                    qtyReturned: 25, packSize: 10, returnRate: 5
                }
            ];
            
            const result = buildReturnPayload(returnData, items, 'Damaged', 'cash', 'R1', 'Wrong item', 'o1');
            
            expect(result.outletId).toBe('o1');
            expect(result.reason).toBe('Damaged');
            expect(result.items[0].qtyReturned).toBe(25);
            expect(result.items[0].qtyStripsReturned).toBe(2); // Math.floor(25/10)
            expect(result.items[0].qtyLooseReturned).toBe(5);  // 25 % 10
            expect(result.items[0].totalAmount).toBe(125);     // 25 * 5
        });
    });

    describe('buildVoucherPayload', () => {
        it('should build receipt voucher', () => {
            const pendingBills = [{ id: 'inv1', invoiceType: 'sale' }];
            const billAmounts = { inv1: 100 };
            
            const result = buildVoucherPayload(
                'receipt', '2023-10-10', 'Payment received', 'o1',
                { id: 'party1' }, { id: 'bank1', groupName: 'Bank Accounts' }, 100,
                pendingBills, billAmounts, null, null, 0, []
            );

            expect(result.voucher_type).toBe('receipt');
            expect(result.payment_mode).toBe('bank');
            expect(result.total_amount).toBe(100);
            expect(result.lines).toEqual([
                { ledger_id: 'bank1', debit: 100, credit: 0, description: '' },
                { ledger_id: 'party1', debit: 0, credit: 100, description: '' }
            ]);
            expect(result.bill_adjustments).toEqual([{ invoice_id: 'inv1', invoice_type: 'sale', adjusted_amount: 100 }]);
        });

        it('should build journal voucher', () => {
            const lines = [
                { ledger: { id: 'l1' }, debit: 50, credit: 0, description: 'Line 1' },
                { ledger: { id: 'l2' }, debit: 0, credit: 50, description: 'Line 2' }
            ];

            const result = buildVoucherPayload(
                'journal', '2023-10-10', 'Adjustment', 'o1',
                null, null, 0, [], {}, null, null, 0, lines
            );

            expect(result.voucher_type).toBe('journal');
            expect(result.total_amount).toBe(50);
            expect(result.lines).toEqual([
                { ledger_id: 'l1', debit: 50, credit: 0, description: 'Line 1' },
                { ledger_id: 'l2', debit: 0, credit: 50, description: 'Line 2' }
            ]);
        });
        
        it('should build contra voucher', () => {
            const result = buildVoucherPayload(
                'contra', '2023-10-10', 'Bank deposit', 'o1',
                null, null, 0, [], {}, { id: 'bank1' }, { id: 'cash1' }, 500, []
            );

            expect(result.voucher_type).toBe('contra');
            expect(result.total_amount).toBe(500);
            expect(result.lines).toEqual([
                { ledger_id: 'bank1', debit: 500, credit: 0, description: '' },
                { ledger_id: 'cash1', debit: 0, credit: 500, description: '' }
            ]);
        });
    });
});
