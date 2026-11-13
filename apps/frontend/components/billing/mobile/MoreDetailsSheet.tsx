'use client';

import { useId, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Camera, Check, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBillingStore } from '@/store/billingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/lib/utils';
import { SheetShell } from './SheetShell';
import { T } from './theme';

/** Phone photos are several MB; the draft is kept in localStorage and sent to the server, so anything wider than this is shrunk first. */
const MAX_PHOTO_EDGE = 1600;
const SHRINK_ABOVE_BYTES = 1_500_000;

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** Same result as the desktop upload (a data URL stored in `prescriptionImageUrl`); big camera photos are scaled down to a JPEG first. */
export async function prescriptionDataUrl(file: File): Promise<string> {
    const original = await readAsDataUrl(file);
    if (file.size <= SHRINK_ABOVE_BYTES || typeof document === 'undefined') return original;
    try {
        return await new Promise<string>((resolve) => {
            const timer = setTimeout(() => resolve(original), 5000);
            const img = new Image();
            img.onload = () => {
                clearTimeout(timer);
                const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(original);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => { clearTimeout(timer); resolve(original); };
            img.src = original;
        });
    } catch {
        return original;
    }
}

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Optional bill details behind the "More" chip. Everything saves as you type (it writes straight to the draft).
 * Retail: hospital, Rx number, Rx photo. Wholesale with e-way bills on: transporter and vehicle fields. Invoice mode: invoice date.
 */
export function MoreDetailsSheet({ open, onClose }: Props) {
    const uid = useId();
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const draft = useBillingStore((s) => (s.activeDraftId ? s.drafts[s.activeDraftId] : null));
    const setHospitalName = useBillingStore((s) => s.setHospitalName);
    const updateDraftHeader = useBillingStore((s) => s.updateDraftHeader);
    const enableEwayBill = useSettingsStore((s) => s.enableEwayBill);
    const cameraRef = useRef<HTMLInputElement>(null);
    const galleryRef = useRef<HTMLInputElement>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);

    if (!activeDraftId || !draft) return null;
    const retail = draft.saleType !== 'WHOLESALE';
    const wholesale = draft.saleType === 'WHOLESALE';
    const set = (updates: Parameters<typeof updateDraftHeader>[1]) => updateDraftHeader(activeDraftId, updates);

    const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';                    // picking the same photo again must fire change again
        if (!file) return;
        setPhotoError(null);
        try {
            set({ prescriptionImageUrl: await prescriptionDataUrl(file) });
        } catch {
            setPhotoError('Could not read that photo. Please try again.');
        }
    };

    const field = 'space-y-1.5';
    const labelClass = T.label;
    const selectClass = cn(T.input, 'flex h-12 w-full px-3 text-base');

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="More details"
            description="Optional. Changes are saved as you type."
            footer={<Button className={cn(T.cta, 'h-12 w-full text-base hover:bg-sky-600')} onClick={onClose}>Done</Button>}
        >
            <div className="space-y-5">
                {retail && (
                    <section className="space-y-4" aria-label="Prescription">
                        <div className={field}>
                            <Label htmlFor={`${uid}-hospital`} className={labelClass}>Hospital / referral</Label>
                            <Input id={`${uid}-hospital`} className={cn(T.input, 'h-12 text-base')} autoComplete="off" placeholder="Hospital name…"
                                value={draft.hospitalName || ''} onChange={(e) => setHospitalName(e.target.value)} />
                        </div>
                        <div className={field}>
                            <Label htmlFor={`${uid}-rx`} className={labelClass}>Rx number</Label>
                            <Input id={`${uid}-rx`} className={cn(T.input, 'h-12 text-base')} autoComplete="off" placeholder="Prescription number…"
                                value={draft.prescriptionNo || ''} onChange={(e) => set({ prescriptionNo: e.target.value })} />
                        </div>
                        <div className={field}>
                            <p className={labelClass}>Prescription photo</p>
                            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="rx-camera-input" onChange={onPhoto} />
                            <input ref={galleryRef} type="file" accept="image/*" className="hidden" data-testid="rx-gallery-input" onChange={onPhoto} />
                            {draft.prescriptionImageUrl ? (
                                <div className="space-y-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={draft.prescriptionImageUrl} alt="Prescription photo preview" className="max-h-56 w-full rounded-xl border border-slate-300 bg-white object-contain" />
                                    <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800"><Check className="h-4 w-4" aria-hidden /> Rx photo added</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" className={cn(T.btn, 'h-12')} onClick={() => cameraRef.current?.click()}><Camera className="h-4 w-4" aria-hidden /> Retake</Button>
                                        <Button variant="outline" className="h-12 rounded-xl border-2 border-red-600 bg-white font-bold text-red-700 hover:bg-red-50 hover:text-red-800 active:bg-red-50" onClick={() => set({ prescriptionImageUrl: null })}><Trash2 className="h-4 w-4" aria-hidden /> Remove photo</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" className={cn(T.ctaOutline, 'h-12 hover:bg-sky-50 hover:text-sky-700')} onClick={() => cameraRef.current?.click()}><Camera className="h-4 w-4" aria-hidden /> Add Rx photo</Button>
                                    <Button variant="outline" className={cn(T.btn, 'h-12')} onClick={() => galleryRef.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden /> From gallery</Button>
                                </div>
                            )}
                            {photoError && <p role="alert" className="text-sm font-bold text-red-800">{photoError}</p>}
                        </div>
                    </section>
                )}

                {wholesale && enableEwayBill && (
                    <section className="space-y-4" aria-label="Transport">
                        <div className={field}>
                            <Label htmlFor={`${uid}-tgstin`} className={labelClass}>Transporter GSTIN</Label>
                            <Input id={`${uid}-tgstin`} className={cn(T.input, 'h-12 text-base uppercase')} autoComplete="off" autoCapitalize="characters" placeholder="Enter GSTIN…"
                                value={draft.transporterId || ''} onChange={(e) => set({ transporterId: e.target.value })} />
                        </div>
                        <div className={field}>
                            <Label htmlFor={`${uid}-dist`} className={labelClass}>Distance (km)</Label>
                            <Input id={`${uid}-dist`} className={cn(T.input, 'h-12 text-base')} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 50…"
                                value={draft.transDistance === '' || draft.transDistance == null ? '' : String(draft.transDistance)}
                                onChange={(e) => { const digits = e.target.value.replace(/\D/g, ''); set({ transDistance: digits === '' ? '' : Number(digits) }); }} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className={field}>
                                <Label htmlFor={`${uid}-mode`} className={labelClass}>Mode</Label>
                                <select id={`${uid}-mode`} className={selectClass} value={draft.transMode || 1} onChange={(e) => set({ transMode: Number(e.target.value) })}>
                                    <option value={1}>Road</option><option value={2}>Rail</option><option value={3}>Air</option><option value={4}>Ship</option>
                                </select>
                            </div>
                            <div className={field}>
                                <Label htmlFor={`${uid}-vtype`} className={labelClass}>Vehicle type</Label>
                                <select id={`${uid}-vtype`} className={selectClass} value={draft.vehicleType || 'R'} onChange={(e) => set({ vehicleType: e.target.value })}>
                                    <option value="R">Regular</option><option value="O">ODC</option>
                                </select>
                            </div>
                        </div>
                        <div className={field}>
                            <Label htmlFor={`${uid}-vno`} className={labelClass}>Vehicle no.</Label>
                            <Input id={`${uid}-vno`} className={cn(T.input, 'h-12 text-base uppercase')} autoComplete="off" autoCapitalize="characters" placeholder="e.g. MH01AB1234…"
                                value={draft.vehicleNo || ''} onChange={(e) => set({ vehicleNo: e.target.value })} />
                        </div>
                    </section>
                )}

                {draft.documentMode === 'invoice' && (
                    <div className={field}>
                        <Label htmlFor={`${uid}-date`} className={labelClass}>Invoice date and time</Label>
                        <Input id={`${uid}-date`} className={cn(T.input, 'h-12 text-base')} type="datetime-local"
                            value={draft.invoiceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                            onChange={(e) => set({ invoiceDate: e.target.value })} />
                    </div>
                )}

                {wholesale && !enableEwayBill && draft.documentMode !== 'invoice' && (
                    <p className="text-sm text-slate-700">There are no extra details for this bill.</p>
                )}
            </div>
        </SheetShell>
    );
}
