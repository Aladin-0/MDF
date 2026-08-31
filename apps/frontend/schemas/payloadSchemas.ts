import { z } from 'zod';

/**
 * SalePayload Schema
 * Maps to DRF `SaleSerializer`.
 * Expects a customer ID or name, a list of sale items, and optional metadata like date or discount.
 * - `customerId`: integer ID of the customer (optional if cash sale).
 * - `items`: array of items containing productId, quantity, and unitPrice.
 * - `discount`: numeric discount applied to the total sale.
 * - `totalAmount`: numeric total after taxes and discounts.
 */
export const SalePayloadSchema = z.object({
  customerId: z.number().int().optional(),
  items: z.array(
    z.object({
      productId: z.number().int(),
      quantity: z.number().min(1),
      unitPrice: z.number().min(0),
    })
  ).min(1),
  discount: z.number().min(0).optional(),
  totalAmount: z.number().min(0),
});

export type SalePayload = z.infer<typeof SalePayloadSchema>;

/**
 * ScheduleHPayload Schema
 * Maps to DRF `ScheduleHSerializer`.
 * Used for tracking sales of Schedule H drugs, requiring specific patient and doctor details.
 * - `patientName`: full name of the patient.
 * - `patientAddress`: physical address of the patient.
 * - `doctorName`: prescribing doctor's name.
 * - `doctorRegNo`: doctor's registration number.
 * - `patientAge`: age of the patient in years (must be at least 1).
 */
export const ScheduleHPayloadSchema = z.object({
  patientName: z.string().min(1, 'Patient name is required'),
  patientAddress: z.string().min(1, 'Patient address is required'),
  doctorName: z.string().min(1, 'Doctor name is required'),
  doctorRegNo: z.string().min(1, 'Doctor registration number is required'),
  patientAge: z.number().int().min(1, 'Patient age must be at least 1'),
});

export type ScheduleHPayload = z.infer<typeof ScheduleHPayloadSchema>;

/**
 * PurchasePayload Schema
 * Maps to DRF `PurchaseSerializer`.
 * Expects supplier information, invoice details, and a list of purchased items.
 * - `supplierId`: integer ID of the supplier.
 * - `invoiceNumber`: string representing the supplier's invoice.
 * - `items`: array of purchased items containing productId, quantity, purchasePrice.
 * - `totalAmount`: total value of the purchase.
 */
export const PurchasePayloadSchema = z.object({
  supplierId: z.number().int(),
  invoiceNumber: z.string().min(1),
  items: z.array(
    z.object({
      productId: z.number().int(),
      quantity: z.number().min(1),
      purchasePrice: z.number().min(0),
    })
  ).min(1),
  totalAmount: z.number().min(0),
});

export type PurchasePayload = z.infer<typeof PurchasePayloadSchema>;

/**
 * ReturnPayload Schema
 * Maps to DRF `ReturnSerializer` (could be Sales Return or Purchase Return).
 * Expects original transaction reference, items being returned, and return reason.
 * - `originalTransactionId`: integer ID of the original sale or purchase.
 * - `returnType`: indicates if it's a 'sale' return or 'purchase' return.
 * - `items`: array of items being returned with quantities.
 * - `reason`: string explaining the return.
 */
export const ReturnPayloadSchema = z.object({
  originalTransactionId: z.number().int(),
  returnType: z.enum(['sale', 'purchase']),
  items: z.array(
    z.object({
      productId: z.number().int(),
      quantity: z.number().min(1),
    })
  ).min(1),
  reason: z.string().optional(),
});

export type ReturnPayload = z.infer<typeof ReturnPayloadSchema>;

/**
 * VoucherPayload Schema
 * Maps to DRF `VoucherSerializer`.
 * Expects accounting voucher details such as type, accounts involved, amount, and narration.
 * - `voucherType`: standard accounting voucher types (Payment, Receipt, Journal, Contra).
 * - `debitAccountId`: integer ID of the account to be debited.
 * - `creditAccountId`: integer ID of the account to be credited.
 * - `amount`: transaction amount.
 * - `narration`: description of the voucher entry.
 */
export const VoucherPayloadSchema = z.object({
  voucherType: z.enum(['Payment', 'Receipt', 'Journal', 'Contra']),
  debitAccountId: z.number().int(),
  creditAccountId: z.number().int(),
  amount: z.number().positive(),
  narration: z.string().optional(),
});

export type VoucherPayload = z.infer<typeof VoucherPayloadSchema>;
