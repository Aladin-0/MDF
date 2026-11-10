"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModalShell, ModalSection } from "@/components/shared/ModalShell";
import { format } from "date-fns";
import { api } from "@/lib/api";

export interface BankOptions { accounts: { id: string; name: string }[]; cashLedger: { id: string; name: string } | null }

interface Props {
    open: boolean;
    onClose: () => void;
    outletId: string;
    bank: BankOptions | undefined;
    /** the day the report is showing (the last day of a range): the deposit is dated this day unless changed */
    defaultDate: string;
    /** cash the report says should be in the drawer, to warn about banking more than there is */
    cashInDrawer: number;
    onDone: () => void;
}

// the shop's own calendar day (not UTC: between midnight and 5:30 am in India the UTC date is still yesterday)
const today = () => format(new Date(), "yyyy-MM-dd");
const rupees = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n || 0);

/**
 * Cash deposited into a bank account. It records a Contra voucher (Dr Bank, Cr Cash) on the server, so the accounts books
 * and the report both show it, and the drawer's "cash required" drops by the amount banked.
 */
export function BankDepositModal({ open, onClose, outletId, bank, defaultDate, cashInDrawer, onDone }: Props) {
    const [amount, setAmount] = useState("");
    const [bankId, setBankId] = useState("");
    const [date, setDate] = useState(defaultDate);
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setAmount(""); setReference(""); setNote(""); setError(null); setBusy(false);
        setDate(defaultDate > today() ? today() : defaultDate);
        setBankId(bank?.accounts.length === 1 ? bank.accounts[0].id : "");
    }, [open]);                                                                      // eslint-disable-line react-hooks/exhaustive-deps

    const value = Number(amount);
    const valid = value > 0 && !!bankId && !!date;
    const tooMuch = value > 0 && value > Math.max(cashInDrawer, 0);
    const noBanks = !bank || bank.accounts.length === 0;

    const submit = async () => {
        if (!valid || busy) return;
        setBusy(true); setError(null);
        try {
            const res = await api.post("/reports/daily-snapshot/bank-deposit/", { outletId, date, amount: amount.trim(), bankLedgerId: bankId, reference: reference.trim(), narration: note.trim() });
            const v = res.data.voucher;
            toast.success(`${rupees(Number(v.amount))} deposited into ${v.bank}`, { description: `Contra voucher ${v.voucherNo}` });
            onDone();
            onClose();
        } catch (e: any) {
            // api.ts turns every failure into { error: { detail?, message } }
            setError(e?.error?.detail || e?.response?.data?.detail || "Could not record the deposit. Please try again.");
        } finally { setBusy(false); }
    };

    return (
        <ModalShell open={open} onClose={onClose} title="Deposit cash into bank" size="sm"
            footer={<>
                <Button className="flex-1" onClick={submit} disabled={!valid || busy || noBanks}>{busy ? "Recording…" : "Record deposit"}</Button>
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            </>}>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Landmark className="mt-0.5 h-4 w-4 shrink-0" />
                Cash taken from the drawer to your bank. This records a Contra entry and lowers today&apos;s cash required by the same amount.
            </p>

            {noBanks ? (
                <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    There is no bank account yet. Add one under Accounts &rarr; Ledgers (group &ldquo;Bank Accounts&rdquo;), then come back.
                </p>
            ) : (
                <ModalSection title="Deposit">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="deposit-amount">Amount *</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-sm font-semibold text-muted-foreground">₹</span>
                                <Input id="deposit-amount" aria-label="Amount" type="number" inputMode="decimal" min={0} step="0.01" autoFocus className="pl-7 text-right font-semibold"
                                    value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="0.00" />
                            </div>
                            <p className="text-xs text-muted-foreground">Cash expected in the drawer now: {rupees(cashInDrawer)}</p>
                            {tooMuch && (
                                <p role="status" className="flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    That is more than the cash the report expects in the drawer. Check the amount, or record the cash received first.</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Bank account *</Label>
                            <Select value={bankId} onValueChange={setBankId}>
                                <SelectTrigger aria-label="Bank account"><SelectValue placeholder="Choose a bank account" /></SelectTrigger>
                                <SelectContent>{bank!.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label htmlFor="deposit-date">Date *</Label><Input id="deposit-date" aria-label="Date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                            <div className="space-y-1.5"><Label htmlFor="deposit-ref">Slip / reference</Label><Input id="deposit-ref" aria-label="Slip or reference" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" /></div>
                        </div>
                        <div className="space-y-1.5"><Label htmlFor="deposit-note">Note</Label><Input id="deposit-note" aria-label="Note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
                    </div>
                </ModalSection>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </ModalShell>
    );
}
