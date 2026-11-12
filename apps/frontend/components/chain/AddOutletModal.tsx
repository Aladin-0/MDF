'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Store, Building2, MapPin, Phone, Hash, FileText } from 'lucide-react';
import { chainApi } from '@/lib/apiClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { STATE_CODES } from '@mediflow/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AddOutletModal({ orgId }: { orgId: string }) {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();

    const [form, setForm] = useState({
        name: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
        gstin: '',
        drug_license_no: '',
    });

    const mutation = useMutation({
        mutationFn: (data: typeof form) => chainApi.createOutlet(orgId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['chain-dashboard', orgId] });
            // the header's outlet switcher reads the same list (cached for 10 minutes)
            queryClient.invalidateQueries({ queryKey: ['org-outlets', orgId] });
            setOpen(false);
            setForm({
                name: '',
                address: '',
                city: '',
                state: '',
                pincode: '',
                phone: '',
                gstin: '',
                drug_license_no: '',
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate(form);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="w-full bg-primary text-white sm:w-auto">
                    <Store className="mr-2 h-4 w-4" />
                    Add Outlet
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        Add New Chain Outlet
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mutation.isError && (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                            {(mutation.error as any)?.message || 'Failed to create outlet'}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1 sm:col-span-2">
                            <Label>Outlet Name *</Label>
                            <Input
                                required
                                placeholder="e.g. Mediflow Pharmacy - Downtown"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                            <Label>Address *</Label>
                            <Input
                                required
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>City *</Label>
                            <Input
                                required
                                value={form.city}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>State *</Label>
                            <Select required value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select State" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.keys(STATE_CODES).map((state) => (
                                        <SelectItem key={state} value={state}>
                                            {state}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label>Pincode *</Label>
                            <Input
                                required
                                value={form.pincode}
                                onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>Phone *</Label>
                            <Input
                                required
                                placeholder="10-digit mobile"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>GSTIN *</Label>
                            <Input
                                required
                                placeholder="15-character GSTIN"
                                value={form.gstin}
                                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>Drug License No *</Label>
                            <Input
                                required
                                value={form.drug_license_no}
                                onChange={(e) => setForm({ ...form, drug_license_no: e.target.value.toUpperCase() })}
                            />
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-3">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Creating...' : 'Create Outlet'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
