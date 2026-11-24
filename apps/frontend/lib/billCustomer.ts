/**
 * The customer a bill carries. A bill keeps two copies of who it is for: the ledger that was picked (`customerLedger`,
 * what the header shows) and a customer record made from it (`customer`, what is sent when the bill is saved).
 * The desktop header, the phone customer sheet and the "edit this customer" popup all build them here, so the two
 * layouts cannot drift apart.
 */
import type { Customer, FamilyMember, Ledger } from '@/types';

/** The customer record for a bill, taken from the ledger that was picked. */
export function billCustomerFromLedger(ledger: Ledger): Customer {
    const l = ledger as any;
    return {
        // the real customer record when the ledger has one; the server also accepts a ledger id
        id: l.linkedCustomerId || l.id,
        name: l.name,
        phone: l.phone || '',
        gstin: l.gstin || '',
        address: l.address || '',
        creditLimit: l.creditLimit,
        dlNo20b: l.dlNo20b,
        dlNo21b: l.dlNo21b,
        dlExpiry: l.dlExpiry,
        customerType: l.customerType,
        stateCode: l.stateCode,
    } as any;
}

/** A customer as `PUT /customers/<id>/` returns it (only what a bill shows). */
export interface SavedCustomer {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    gstin?: string | null;
    creditLimit?: number;
    dlNo20b?: string | null;
    dlNo21b?: string | null;
    dlExpiry?: string | null;
    customerType?: string;
    stateCode?: string;
    gender?: string;
    age?: number | null;
    /** The name of the ledger their bills go to, after the server renamed it to match. */
    ledgerName?: string | null;
}

const editedMember = (m: FamilyMember, saved: SavedCustomer): FamilyMember =>
    m.id === saved.id ? { ...m, name: saved.name, phone: saved.phone ?? m.phone, gender: saved.gender ?? m.gender, age: saved.age ?? m.age } : m;

/** Is this saved customer the owner of the ledger, or one of the people who bill through it? */
export function ledgerHasCustomer(ledger: Ledger | null | undefined, customerId: string): boolean {
    if (!ledger) return false;
    return ledger.linkedCustomerId === customerId || !!ledger.familyMembers?.some((m) => m.id === customerId);
}

/** The ledger on a bill after one of its people was edited: the same ledger, showing what the server just saved. */
export function ledgerAfterCustomerEdit(ledger: Ledger, saved: SavedCustomer): Ledger {
    const familyMembers = ledger.familyMembers?.map((m) => editedMember(m, saved));
    if (ledger.linkedCustomerId !== saved.id) return { ...ledger, familyMembers };   // a family member: the account itself is unchanged
    return {
        ...ledger,
        name: saved.ledgerName || ledger.name,
        phone: saved.phone ?? '',
        address: saved.address ?? '',
        gstin: saved.gstin ?? '',
        creditLimit: saved.creditLimit,
        dlNo20b: saved.dlNo20b ?? null,
        dlNo21b: saved.dlNo21b ?? null,
        dlExpiry: saved.dlExpiry ?? null,
        customerType: saved.customerType,
        stateCode: saved.stateCode,
        familyMembers,
    } as Ledger;
}

/** The person a bill is for, after an edit (unchanged unless it was them). */
export function patientAfterCustomerEdit(patient: FamilyMember | null | undefined, saved: SavedCustomer): FamilyMember | null {
    return patient ? editedMember(patient, saved) : null;
}
