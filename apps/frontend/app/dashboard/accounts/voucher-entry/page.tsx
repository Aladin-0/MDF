'use client';

import { BookOpen } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { VoucherForm } from '@/components/accounts/VoucherForm';
import { useSearchParams, useRouter } from 'next/navigation';

export default function VoucherEntryPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const editId = searchParams.get('editId') || undefined;
    const reasonCode = searchParams.get('reasonCode') || undefined;
    const reasonText = searchParams.get('reasonText') || undefined;

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BookOpen className="h-4 w-4" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {editId ? 'Edit Voucher' : 'Voucher Entry'}
                    </h1>
                </div>
                <p className="pl-[46px] text-sm text-muted-foreground">
                    {editId ? 'Modifying an existing voucher' : 'Record receipts, payments, contra & journal entries'}
                </p>
            </div>

            <Separator />

            <VoucherForm 
                voucherId={editId} 
                onSuccess={() => {
                    if (editId) {
                        router.push('/dashboard/accounts/vouchers');
                    }
                }}
            />
        </div>
    );
}
