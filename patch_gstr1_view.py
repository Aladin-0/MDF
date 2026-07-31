import re

with open('apps/frontend/components/reports/GSTR1View.tsx', 'r') as f:
    content = f.read()

imports = """import { useGSTR1Report, useLockGSTReport, useUnlockGSTReport } from '@/hooks/useReports';
import { Lock, Unlock, ShieldCheck, ShieldAlert } from 'lucide-react';
"""

content = content.replace("import { useGSTR1Report } from '@/hooks/useReports';", imports)

setup = """    const { data, isLoading, error } = useGSTR1Report(dateRange);
    const lockMutation = useLockGSTReport();
    const unlockMutation = useUnlockGSTReport();

    const handleLock = () => {
        if (!outlet) return;
        lockMutation.mutate({
            outletId: outlet.id,
            payload: { reportType: 'GSTR1', from: dateRange.from, to: dateRange.to }
        });
    };

    const handleUnlock = () => {
        if (!outlet) return;
        const reason = prompt('Enter reason for unlocking this period:');
        if (!reason) return;
        unlockMutation.mutate({
            outletId: outlet.id,
            payload: { reportType: 'GSTR1', from: dateRange.from, to: dateRange.to, reason }
        });
    };
"""
content = content.replace("    const { data, isLoading, error } = useGSTR1Report(dateRange);", setup)

ui_patch = """
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">GSTR-1 Details</h2>
                    {data.meta?.status === 'locked' && (
                        <span className="flex items-center text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Locked Snapshot
                        </span>
                    )}
                    {data.meta?.status === 'corrected' && (
                        <span className="flex items-center text-xs font-medium bg-amber-100 text-amber-700 px-2 py-1 rounded">
                            <ShieldAlert className="w-3 h-3 mr-1" /> Corrected Draft
                        </span>
                    )}
                    {(data.meta?.status === 'draft' || !data.meta?.status) && (
                        <span className="flex items-center text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded">
                            Draft (Live)
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    {data.meta?.status === 'locked' || data.meta?.status === 'exported' ? (
                        <Button variant="outline" size="sm" onClick={handleUnlock} disabled={unlockMutation.isPending} className="text-red-600 border-red-200 hover:bg-red-50">
                            <Unlock className="w-4 h-4 mr-2" /> Unlock for Corrections
                        </Button>
                    ) : (
                        <Button variant="default" size="sm" onClick={handleLock} disabled={lockMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            <Lock className="w-4 h-4 mr-2" /> Lock & Snapshot
                        </Button>
                    )}
                    
                    <Button variant="outline" size="sm" onClick={() => exportGSTR1_JSON(data, outlet, dateRange)}>
                        <Download className="w-4 h-4 mr-2" /> {data.meta?.status === 'locked' ? 'Export JSON' : 'Draft JSON'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportGSTR1_CSV(data, outlet, dateRange)}>
                        <Download className="w-4 h-4 mr-2" /> {data.meta?.status === 'locked' ? 'Export CSV' : 'Draft CSV'}
                    </Button>
                </div>
            </div>
"""

content = content.replace("""            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">GSTR-1 Details</h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportGSTR1_JSON(data, outlet, dateRange)}>
                        <Download className="w-4 h-4 mr-2" /> JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportGSTR1_CSV(data, outlet, dateRange)}>
                        <Download className="w-4 h-4 mr-2" /> CSV
                    </Button>
                </div>
            </div>""", ui_patch)

with open('apps/frontend/components/reports/GSTR1View.tsx', 'w') as f:
    f.write(content)
