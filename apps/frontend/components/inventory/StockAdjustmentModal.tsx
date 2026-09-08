'use client';

import { useState } from 'react';
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal, Trash2, ShieldX, RefreshCw, RotateCcw } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { adjustmentSchema, AdjustmentFormValues } from '@/lib/validations/inventory';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export function StockAdjustmentModal({ isOpen, batch, onClose, onSubmit }: any) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);

    const { control, handleSubmit, watch, formState: { errors } } = useForm<AdjustmentFormValues>({
        resolver: zodResolver(adjustmentSchema) as any,
        defaultValues: {
            adjustmentType: 'correction',
            qtyStrips: 0,
            qtyLoose: 0,
            reason: ''
        }
    });

    const adjustmentType = watch('adjustmentType');
    const inputStrips = watch('qtyStrips') || 0;
    
    // Calculate preview
    const isReducing = adjustmentType === 'damage' || adjustmentType === 'theft';
    const currentStrips = batch?.qtyStrips || 0;
    const finalStrips = isReducing ? currentStrips - inputStrips : currentStrips + Number(inputStrips);

    const submitHandler = async (data: AdjustmentFormValues) => {
        if (finalStrips < 0) {
            toast({ variant: "destructive", title: "Cannot reduce below 0" });
            return;
        }
        setIsLoading(true);
        try {
            await onSubmit({
                 batchId: batch.id,
                 ...data,
                 qtyChange: isReducing ? -data.qtyStrips : data.qtyStrips
            });
            toast({ title: "Stock adjusted successfully", description: `${batch.batchNo} — ${data.qtyStrips} ${batch?.product?.packType ? batch.product.packType + 's' : 'strips'} ${isReducing ? 'removed' : 'added'}` });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            onClose();
        } catch (e: any) {
            toast({ variant: "destructive", title: e.message || "Failed to adjust stock" });
        } finally {
            setIsLoading(false);
        }
    };

    if (!batch) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md max-h-screen overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <SlidersHorizontal className="w-5 h-5 text-primary" />
                        <DialogTitle>Adjust Stock</DialogTitle>
                    </div>
                    <p className="text-sm text-slate-500">Batch {batch.batchNo}</p>
                </DialogHeader>

                <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm flex justify-between">
                     <div>
                          <div className="text-muted-foreground">Current Stock</div>
                          <div className="font-semibold">{batch.qtyStrips} {batch?.product?.packType ? batch.product.packType + 's' : 'strips'} + {batch.qtyLoose} {batch?.product?.packUnit ? batch.product.packUnit + 's' : 'loose'}</div>
                     </div>
                     <div className="text-right">
                          <div className="text-muted-foreground">Rack Location</div>
                          <div className="font-medium">{batch.rackLocation || '—'}</div>
                     </div>
                </div>

                <form onSubmit={handleSubmit(submitHandler)} className="space-y-6">
                     <div className="space-y-3">
                          <Label>Adjustment Type</Label>
                          <Controller
                              name="adjustmentType"
                              control={control}
                              render={({ field }) => (
                                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 gap-2">
                                       <Label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:bg-slate-50 ${field.value === 'damage' ? 'border-red-500 bg-red-50/50' : ''}`}>
                                           <RadioGroupItem value="damage" className="mt-1" />
                                           <div>
                                               <div className="flex items-center gap-2 font-medium"><Trash2 className="w-4 h-4 text-red-500" /> Damage / Expiry</div>
                                               <div className="text-xs text-muted-foreground mt-0.5">Remove damaged or expired stock</div>
                                           </div>
                                       </Label>
                                       <Label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:bg-slate-50 ${field.value === 'theft' ? 'border-orange-500 bg-orange-50/50' : ''}`}>
                                           <RadioGroupItem value="theft" className="mt-1" />
                                           <div>
                                               <div className="flex items-center gap-2 font-medium"><ShieldX className="w-4 h-4 text-orange-500" /> Theft / Loss</div>
                                               <div className="text-xs text-muted-foreground mt-0.5">Report stolen or missing stock</div>
                                           </div>
                                       </Label>
                                       <Label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:bg-slate-50 ${field.value === 'correction' ? 'border-blue-500 bg-blue-50/50' : ''}`}>
                                           <RadioGroupItem value="correction" className="mt-1" />
                                           <div>
                                               <div className="flex items-center gap-2 font-medium"><RefreshCw className="w-4 h-4 text-blue-500" /> Stock Correction</div>
                                               <div className="text-xs text-muted-foreground mt-0.5">Fix incorrect stock count</div>
                                           </div>
                                       </Label>
                                       <Label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:bg-slate-50 ${field.value === 'return_from_patient' ? 'border-green-500 bg-green-50/50' : ''}`}>
                                           <RadioGroupItem value="return_from_patient" className="mt-1" />
                                           <div>
                                               <div className="flex items-center gap-2 font-medium"><RotateCcw className="w-4 h-4 text-green-500" /> Patient Return</div>
                                               <div className="text-xs text-muted-foreground mt-0.5">Returned unused medicines</div>
                                           </div>
                                       </Label>
                                  </RadioGroup>
                              )}
                          />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                               <Label>{batch?.product?.packType ? batch.product.packType.charAt(0).toUpperCase() + batch.product.packType.slice(1) + 's' : 'Strips'}</Label>
                               <Controller
                                   name="qtyStrips"
                                   control={control}
                                   render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />}
                               />
                          </div>
                          <div className="space-y-2">
                               <Label>{batch?.product?.packUnit ? batch.product.packUnit.charAt(0).toUpperCase() + batch.product.packUnit.slice(1) + 's' : 'Loose units'}</Label>
                               <Controller
                                   name="qtyLoose"
                                   control={control}
                                   render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />}
                               />
                          </div>
                     </div>

                     <div className={`text-sm font-medium ${isReducing ? 'text-red-600' : 'text-green-600'} flex items-center gap-2`}>
                          <span>{isReducing ? `Reducing stock by ${inputStrips}` : `Adding stock by ${inputStrips}`} {batch?.product?.packType ? batch.product.packType + 's' : 'strips'}</span>
                     </div>
                     <div className="text-sm font-medium">
                          New stock will be: <span className={finalStrips < 0 ? 'text-red-500' : ''}>{finalStrips} {batch?.product?.packType ? batch.product.packType + 's' : 'strips'}</span>
                     </div>

                     <div className="space-y-2">
                          <Label>Reason</Label>
                          <Controller
                              name="reason"
                              control={control}
                              render={({ field }) => (
                                  <Textarea 
                                      placeholder="Provide a detailed reason..." 
                                      {...field} 
                                      className={errors.reason ? "border-red-500" : ""}
                                  />
                              )}
                          />
                          {errors.reason && <p className="text-xs text-red-500">{errors.reason.message}</p>}
                     </div>

                     <div className="flex flex-col gap-3 pt-4 border-t">
                          <div className="flex justify-end gap-2">
                               <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
                               <Button type="submit" disabled={isLoading} variant={isReducing ? "destructive" : "default"}>
                                    Submit Adjustment
                               </Button>
                          </div>
                          <p className="text-xs text-muted-foreground text-center">
                              This action will be logged with your name and timestamp
                          </p>
                     </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
