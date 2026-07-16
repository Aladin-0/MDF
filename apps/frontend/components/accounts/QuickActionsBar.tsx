'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, ArrowUpRight, ArrowDownRight, FileText, Scale } from 'lucide-react';
import { PayDistributorSheet } from './PayDistributorSheet';
import { ReceivePaymentSheet } from './ReceivePaymentSheet';
import { useRouter } from 'next/navigation';

export function QuickActionsBar() {
    const router = useRouter();
    const [payOpen, setPayOpen] = useState(false);
    const [receiveOpen, setReceiveOpen] = useState(false);

    return (
        <>
            <Card className="bg-slate-50/50">
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-muted-foreground mr-2">Quick Actions:</span>
                    
                    <Button variant="outline" size="sm" className="gap-2 bg-white" onClick={() => setReceiveOpen(true)}>
                        <ArrowDownRight className="h-4 w-4 text-emerald-600" />
                        Receive Payment
                    </Button>
                    
                    <Button variant="outline" size="sm" className="gap-2 bg-white" onClick={() => setPayOpen(true)}>
                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                        Pay Distributor
                    </Button>
                    
                    <Button variant="outline" size="sm" className="gap-2 bg-white" onClick={() => router.push('/dashboard/accounts/expenses')}>
                        <PlusCircle className="h-4 w-4 text-amber-600" />
                        New Expense
                    </Button>
                    
                    <Button variant="outline" size="sm" className="gap-2 bg-white" onClick={() => router.push('/dashboard/accounts/voucher-entry')}>
                        <FileText className="h-4 w-4 text-blue-600" />
                        New Voucher
                    </Button>
                    
                    <Button variant="outline" size="sm" className="gap-2 bg-white ml-auto" onClick={() => router.push('/dashboard/accounts/reconciliation')}>
                        <Scale className="h-4 w-4 text-slate-600" />
                        Reconcile Ledgers
                    </Button>
                </CardContent>
            </Card>

            <PayDistributorSheet open={payOpen} onClose={() => setPayOpen(false)} onSuccess={() => {}} />
            <ReceivePaymentSheet open={receiveOpen} onClose={() => setReceiveOpen(false)} onSuccess={() => {}} />
        </>
    );
}
