'use client';

import { useEffect } from 'react';
import CustomerForm from '@/components/customers/CustomerForm';
import { useCustomerById } from '@/hooks/useCustomers';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { useBillingStore } from '@/store/billingStore';

interface Props {
    /** The customer record behind the ledger on the bill (`ledger.linkedCustomerId`). */
    customerId: string | null | undefined;
    open: boolean;
    onClose: () => void;
}

/**
 * Billing: edit the customer who is on the bill, without leaving the bill.
 *
 * One piece for the desktop header and the phone customer sheet. It opens the same Edit Customer form as the Customers
 * page (one form, one set of rules) with the full record from the server, and after a save puts the fresh name, mobile,
 * address, GSTIN and licence details back on every open bill that carries this customer (`applyCustomerEdit`).
 */
export function EditBillCustomer({ customerId, open, onClose }: Props) {
    const { toast } = useToast();
    const applyCustomerEdit = useBillingStore((s) => s.applyCustomerEdit);
    const { data, isFetching, isError, error } = useCustomerById(open && customerId ? customerId : '');

    useEffect(() => {
        if (open && isError) {
            toast({ variant: 'destructive', title: 'Could not open this customer', description: apiErrorMessage(error) });
            onClose();
        }
    }, [open, isError, error, onClose, toast]);

    if (!open || !customerId) return null;
    // The form fills itself from `customer` whenever that changes, so it is shown only once the fresh record has
    // arrived: an older cached copy must not be typed over and then replaced under the cashier's hands.
    const ready = !!data && !isFetching;
    return <CustomerForm open={ready} customer={ready ? data : null} onClose={onClose} onSaved={applyCustomerEdit} />;
}
