'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ModalShell } from '@/components/shared/ModalShell';
import { useInvalidatePO, usePOSettings } from '@/hooks/usePO';
import { useOutletId } from '@/hooks/useOutletId';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { poApi, type POSettings, type SendChannel } from '@/lib/poApi';

const CHANNELS: { id: SendChannel; label: string }[] = [
    { id: 'whatsapp_link', label: 'WhatsApp link (recommended)' }, { id: 'pdf_whatsapp', label: 'PDF via WhatsApp' }, { id: 'email', label: 'Email' }, { id: 'manual', label: 'Ordered by phone' },
];
const PLACEHOLDERS = ['{store}', '{po_no}', '{link}', '{distributor}'];
const DEFAULT_TEMPLATE = 'Hello {distributor}, please find our purchase order {po_no} from {store}. Open it here: {link}';

/** Purchase order settings. Only an owner / admin gets here, and saving asks for their password again. */
export function POSettingsTab() {
    const outletId = useOutletId();
    const { toast } = useToast();
    const qc = useQueryClient();
    const invalidate = useInvalidatePO();
    const { data, isLoading } = usePOSettings();
    const [form, setForm] = useState<POSettings | null>(null);
    const [explainOpen, setExplainOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (data) setForm(data); }, [data]);
    if (isLoading || !form || !data) return <div className="space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40 w-full" /></div>;

    const set = <K extends keyof POSettings>(k: K, v: POSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
    const dirty = JSON.stringify(form) !== JSON.stringify(data);

    const turnAutoRules = (on: boolean) => { if (on) setExplainOpen(true); else set('autoRulesEnabled', false); };

    const save = async () => {
        setBusy(true); setError(null);
        try {
            await poApi.saveSettings(outletId!, { ...form, password });
            qc.invalidateQueries({ queryKey: ['poSettings'] }); invalidate();
            toast({ title: 'Purchase order settings saved' });
            setConfirmOpen(false); setPassword('');
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="max-w-3xl space-y-8">
            <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Automatic rules</h3>
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div><p className="font-medium">Use the Shortbook and automatic order rules</p>
                        <p className="text-sm text-muted-foreground">Low-stock items are added to the Shortbook for you, and a sent order that gets nothing back expires on its own.</p></div>
                    <Switch checked={form.autoRulesEnabled} onCheckedChange={turnAutoRules} aria-label="Use the Shortbook and automatic order rules" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label>Orders expire after (days)</Label>
                        <Input aria-label="Expiry days" type="number" min={1} max={60} value={form.expiryDays} onChange={(e) => set('expiryDays', Number(e.target.value))} />
                        <p className="text-xs text-muted-foreground">Counted from when you send it, if nothing has been received.</p></div>
                    <div className="space-y-1.5"><Label>PO number prefix</Label>
                        <Input aria-label="PO prefix" maxLength={10} value={form.numberPrefix} onChange={(e) => set('numberPrefix', e.target.value.toUpperCase())} />
                        <p className="text-xs text-muted-foreground">Numbers look like {form.numberPrefix || 'PO'}-20261107-001.</p></div>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sending</h3>
                <div className="space-y-1.5"><Label>Default way to send</Label>
                    <select aria-label="Default channel" className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-72" value={form.defaultChannel} onChange={(e) => set('defaultChannel', e.target.value as SendChannel)}>
                        {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select></div>
                <div className="space-y-1.5"><Label>WhatsApp message</Label>
                    <textarea aria-label="WhatsApp message" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={DEFAULT_TEMPLATE} value={form.whatsappTemplate} onChange={(e) => set('whatsappTemplate', e.target.value)} />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Insert:
                        {PLACEHOLDERS.map((p) => <button key={p} type="button" className="rounded border bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70" onClick={() => set('whatsappTemplate', (form.whatsappTemplate || '') + p)}>{p}</button>)}
                        <button type="button" className="ml-auto font-semibold text-primary" onClick={() => set('whatsappTemplate', '')}>Use the standard message</button></div></div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Distributor page and receiving</h3>
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div><p className="font-medium">Show last rate and total on the distributor's page</p><p className="text-sm text-muted-foreground">Off by default: they see products, packs, quantities and MRP only.</p></div>
                    <Switch checked={form.showRateToDistributor} onCheckedChange={(v) => set('showRateToDistributor', v)} aria-label="Show rate to distributor" />
                </div>
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div><p className="font-medium">Count free goods as received</p><p className="text-sm text-muted-foreground">When on, free quantity on an invoice counts toward what the order was waiting for.</p></div>
                    <Switch checked={form.countFreeQty} onCheckedChange={(v) => set('countFreeQty', v)} aria-label="Count free quantity" />
                </div>
            </section>

            <div className="flex items-center gap-3"><Button disabled={!dirty} onClick={() => { setError(null); setConfirmOpen(true); }}>Save settings</Button>{dirty && <span className="text-sm text-amber-600">Unsaved changes</span>}</div>

            <ModalShell open={explainOpen} onClose={() => setExplainOpen(false)} title="Before you turn this on" size="md"
                footer={<><Button className="flex-1" onClick={() => { set('autoRulesEnabled', true); setExplainOpen(false); }}>Turn on</Button><Button variant="outline" onClick={() => setExplainOpen(false)}>Not now</Button></>}>
                <p className="text-sm text-muted-foreground">These rules work for you in the background. In plain words:</p>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                    <li>Items that fall below their minimum stock are <b>added to the Shortbook</b> automatically.</li>
                    <li>A PO you <b>send</b> is locked. If nothing is received within <b>{form.expiryDays} days</b> it <b>expires</b>.</li>
                    <li>Anything that was not received (cancelled, expired or closed short) <b>returns to the Shortbook</b>, so nothing you need is forgotten.</li>
                    <li>You can still cancel, duplicate or close short any order yourself.</li>
                </ul>
            </ModalShell>

            <ModalShell open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm with your password" size="sm"
                footer={<><Button className="flex-1" disabled={busy || !password} onClick={save}>{busy ? 'Saving...' : 'Confirm and save'}</Button><Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button></>}>
                <p className="text-sm text-muted-foreground">These settings change how every purchase order behaves, so please enter your account password.</p>
                <form onSubmit={(e) => { e.preventDefault(); if (password) save(); }}>
                    <div className="space-y-1.5"><Label>Password *</Label><Input aria-label="Password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                    <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
                </form>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </ModalShell>
        </div>
    );
}
