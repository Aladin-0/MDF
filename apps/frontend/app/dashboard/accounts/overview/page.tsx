'use client';

import { TopSummaryStrip } from '@/components/accounts/overview/TopSummaryStrip';
import { AgingOverview } from '@/components/accounts/overview/AgingOverview';
import { PriorityActionPanel } from '@/components/accounts/overview/PriorityActionPanel';
import { AuditAndReconciliationWatch } from '@/components/accounts/overview/AuditAndReconciliationWatch';
import { QuickActionsBar } from '@/components/accounts/QuickActionsBar';

export default function OverviewPage() {
    return (
        <div className="space-y-6">
            <TopSummaryStrip />
            
            <QuickActionsBar />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <AgingOverview />
                </div>
                <div className="space-y-6">
                    <PriorityActionPanel />
                    <AuditAndReconciliationWatch />
                </div>
            </div>
        </div>
    );
}
