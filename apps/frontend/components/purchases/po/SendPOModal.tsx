'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FileText, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell, ModalSection } from '@/components/shared/ModalShell';
import { cn } from '@/lib/utils';
import { poApi, type PODetail, type SendChannel } from '@/lib/poApi';
import { format, addDays } from 'date-fns';

interface Props {
    open: boolean;
    onClose: () => void;
    outletId: string;
    po: PODetail;
    /** Called after a successful send with the refreshed PO. */
    onSent: (po: PODetail) => void;
    onDownload: (kind: 'pdf' | 'excel') => Promise<void>;
}

const OPTIONS: { id: SendChannel; icon: typeof MessageCircle; title: string; text: string; badge?: string }[] = [
    { id: 'whatsapp_link', icon: MessageCircle, title: 'WhatsApp link', text: 'Opens WhatsApp with a message and a secure read-only page the distributor can open.', badge: 'Recommended' },
    { id: 'pdf_whatsapp', icon: FileText, title: 'Share PDF', text: 'Downloads the PDF and opens WhatsApp so you can attach it.' },
    { id: 'manual', icon: Phone, title: 'Already ordered by phone', text: 'Just records that it was ordered. Nothing is sent.' },
];

const DEFAULT_TEXT = 'Hello {distributor}, please find our purchase order {po_no} from {store}. Open it here: {link}';

/** Send a Draft PO: pick how, check the message, set the expected date. Sending locks the lines. */
export function SendPOModal({ open, onClose, outletId, po, onSent, onDownload }: Props) {
    const [channel, setChannel] = useState<SendChannel>('whatsapp_link');
    const [message, setMessage] = useState('');
    const [expected, setExpected] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sentUrl, setSentUrl] = useState<{ share: string; wa: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const resend = po.status === 'SENT';

    useEffect(() => {
        if (!open) return;
        setChannel((po.sendDefaults.channel as SendChannel) || 'whatsapp_link');
        setMessage(po.sendDefaults.template || DEFAULT_TEXT);
        setExpected(po.expectedDate ?? format(addDays(new Date(), 1), 'yyyy-MM-dd'));
        setError(null); setSentUrl(null); setCopied(false); setBusy(false);
    }, [open, po.id]);                                              // eslint-disable-line react-hooks/exhaustive-deps

    const preview = useMemo(() => message
        .replace('{distributor}', po.distributorName).replace('{po_no}', po.poNumber)
        .replace('{store}', po.sendDefaults.storeName).replace('{link}', '(the secure link is added when you send)'), [message, po]);

    const missingPhone = channel !== 'manual' && !po.distributorPhone;

    const send = async () => {
        setBusy(true); setError(null);
        try {
            if (channel === 'pdf_whatsapp') await onDownload('pdf');
            const r = await poApi.send(outletId, po.id, { channel, expectedDate: expected || null, message });
            onSent(r.po);
            if (channel === 'manual') { onClose(); return; }
            setSentUrl({ share: r.shareUrl, wa: r.waUrl });
            if (r.waUrl) window.open(r.waUrl, '_blank', 'noopener');
        } catch (e: any) { setError(e?.message || 'Could not send.'); }
        finally { setBusy(false); }
    };

    if (sentUrl) {
        return (
            <ModalShell open={open} onClose={onClose} title={resend ? 'Order resent' : 'Order sent'} size="sm"
                footer={<Button className="flex-1" onClick={onClose}>Done</Button>}>
                <p className="text-sm text-muted-foreground">{po.poNumber} is now <b>Sent</b>. WhatsApp should have opened with your message.</p>
                {sentUrl.share && (
                    <div className="space-y-1.5">
                        <Label>Secure link</Label>
                        <div className="flex gap-2">
                            <Input readOnly value={sentUrl.share} aria-label="Secure link" />
                            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(sentUrl.share); setCopied(true); }}>
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                )}
                {sentUrl.wa && <a href={sentUrl.wa} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary hover:underline">Open WhatsApp again</a>}
            </ModalShell>
        );
    }

    return (
        <ModalShell open={open} onClose={onClose} title={resend ? `Resend ${po.poNumber}` : `Send ${po.poNumber}`} size="md"
            footer={<>
                <Button onClick={send} disabled={busy} className="flex-1">{busy ? 'Sending...' : channel === 'manual' ? 'Mark as ordered' : resend ? 'Resend PO' : 'Send PO'}</Button>
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            </>}>
            <p className="text-sm text-muted-foreground">
                To <b className="text-foreground">{po.distributorName}</b>{po.distributorPhone ? ` · ${po.distributorPhone}` : ''}.{' '}
                {!resend && <span className="font-medium text-foreground">Sending locks the lines.</span>} You can still cancel or duplicate it.
            </p>

            <ModalSection title="How">
                <div role="radiogroup" aria-label="Send how" className="grid gap-2">
                    {OPTIONS.filter((o) => !(resend && o.id === 'manual')).map(({ id, icon: Icon, title, text, badge }) => {
                        const active = channel === id;
                        return (
                            <button key={id} type="button" role="radio" aria-checked={active} onClick={() => setChannel(id)}
                                className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:bg-muted')}>
                                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold">{title} {badge && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">{badge}</span>}</span>
                                    <span className="block text-xs text-muted-foreground">{text}</span>
                                </span>
                                {active && <Check className="h-4 w-4 text-primary shrink-0 mt-1" />}
                            </button>
                        );
                    })}
                </div>
                {missingPhone && <p className="mt-2 text-xs text-amber-700">This distributor has no phone number saved. WhatsApp will open without a recipient, so you will pick one yourself. Add the number under Purchases → Distributors.</p>}
            </ModalSection>

            {channel !== 'manual' && (
                <ModalSection title="Message">
                    <textarea aria-label="Message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground"><b>Preview:</b> {preview}</p>
                </ModalSection>
            )}

            <ModalSection title="Expected delivery">
                <Input aria-label="Expected date" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </ModalSection>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </ModalShell>
    );
}
