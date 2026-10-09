'use client';

import { useState } from 'react';
import { useDistributorList } from '@/hooks/usePurchases';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useOutletId } from '@/hooks/useOutletId';
import { useRouter } from 'next/navigation';
import { API_URL, getHeaders } from '@/lib/apiClient';

export function NewPurchaseOrderModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const outletId = useOutletId();
    const router = useRouter();
    const { toast } = useToast();
    const { data: distributors, isLoading: distLoading } = useDistributorList();
    
    const [selectedDist, setSelectedDist] = useState<string>('');
    const [loading, setLoading] = useState(false);
    
    const handleCreateOrder = async () => {
        if (!selectedDist) {
            toast({ title: 'Please select a distributor', variant: 'destructive' });
            return;
        }
        
        onOpenChange(false);
        router.push(`/dashboard/purchases/orders/new?distributorId=${selectedDist}`);
    };
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Create New PO</DialogTitle>
                    <DialogDescription>
                        Select a distributor to build a new Purchase Order. It will only be saved when you explicitly save it.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Distributor</label>
                        {distLoading ? (
                            <div className="h-10 flex items-center text-sm text-slate-500">Loading distributors...</div>
                        ) : (
                            <Select value={selectedDist} onValueChange={setSelectedDist}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a distributor" />
                                </SelectTrigger>
                                <SelectContent>
                                    {distributors?.map((dist: any) => (
                                        <SelectItem key={dist.id} value={dist.id}>
                                            {dist.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreateOrder} disabled={loading || !selectedDist} className="bg-indigo-600 hover:bg-indigo-700">
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Start Building PO
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
