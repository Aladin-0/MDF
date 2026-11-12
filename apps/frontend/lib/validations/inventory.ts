import { z } from 'zod';

export const ADJUSTMENT_REASONS = ['damage', 'theft', 'correction', 'return_from_patient'] as const;

export const adjustmentSchema = z.object({
  adjustmentType: z.enum(ADJUSTMENT_REASONS),
  direction: z.enum(['add', 'remove']),
  unit: z.enum(['packs', 'loose']),
  quantity: z.coerce.number().int('Use a whole number').min(1, 'Enter at least 1'),
  reason: z.string().trim().min(5, 'Please give a reason (at least 5 characters)'),
  pin: z.string().trim().min(4, 'Enter your staff PIN (4 digits)'),
});

export type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;
