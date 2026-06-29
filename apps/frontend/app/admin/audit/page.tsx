'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auditApi, staffApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export default function AuditPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    
    const [filterModule, setFilterModule] = useState('all');
    const [filterAction, setFilterAction] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterUser, setFilterUser] = useState('all');
    
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [staffList, setStaffList] = useState<any[]>([]);

    const debouncedSearch = useDebounce(filterSearch, 500);
    const debouncedAction = useDebounce(filterAction, 500);

    useEffect(() => {
        if (user?.outletId) {
            staffApi.list(user.outletId).then(setStaffList).catch(console.error);
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            setError('Unauthorized access. Admin privileges required.');
            setLoading(false);
            return;
        }

        const abortController = new AbortController();

        const fetchLogs = async () => {
            setLoading(true);
            try {
                const params: any = { page, pageSize: 50 };
                if (filterModule && filterModule !== 'all') params.module = filterModule;
                if (debouncedAction) params.action = debouncedAction;
                if (debouncedSearch) params.search = debouncedSearch;
                if (filterStartDate) params.startDate = new Date(filterStartDate).toISOString();
                if (filterEndDate) params.endDate = new Date(filterEndDate).toISOString();
                if (filterUser && filterUser !== 'all') params.user = filterUser;
                
                const data = await auditApi.getLogs(params, abortController.signal);
                setLogs(data.results || data.data || []);
                setTotalRecords(data.count || 0);
                setTotalPages(Math.ceil((data.count || 0) / 50) || 1);
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                setError(err.detail || 'Failed to load audit logs');
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();

        return () => {
            abortController.abort();
        };
    }, [user, page, filterModule, debouncedAction, debouncedSearch, filterStartDate, filterEndDate, filterUser]);

    const handleExport = async () => {
        try {
            const params: any = {};
            if (filterModule && filterModule !== 'all') params.module = filterModule;
            if (debouncedAction) params.action = debouncedAction;
            if (debouncedSearch) params.search = debouncedSearch;
            if (filterStartDate) params.startDate = new Date(filterStartDate).toISOString();
            if (filterEndDate) params.endDate = new Date(filterEndDate).toISOString();
            if (filterUser && filterUser !== 'all') params.user = filterUser;
            
            await auditApi.exportLogs(params);
        } catch (err: any) {
            alert(err.detail || 'Failed to export audit logs');
        }
    };

    if (error) {
        return (
            <div className="p-6">
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-red-600">Access Denied</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>{error}</p>
                        <Button className="mt-4" onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
                <Button onClick={handleExport} variant="outline" className="bg-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    Export CSV
                </Button>
            </div>
            
            <div className="flex flex-wrap gap-4 items-center">
                <Select value={filterModule} onValueChange={(val) => { setFilterModule(val); setPage(1); }}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Modules" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Modules</SelectItem>
                        <SelectItem value="auth">Authentication</SelectItem>
                        <SelectItem value="purchases">Purchases</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="inventory">Inventory</SelectItem>
                        <SelectItem value="payments">Payments</SelectItem>
                        <SelectItem value="patient">Patient</SelectItem>
                        <SelectItem value="staff">Staff / Admin</SelectItem>
                        <SelectItem value="accounts">Accounts / Vouchers</SelectItem>
                    </SelectContent>
                </Select>
                
                <Select value={filterUser} onValueChange={(val) => { setFilterUser(val); setPage(1); }}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Users" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {staffList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>

                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">From</span>
                    <Input 
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
                        className="w-auto"
                    />
                    <span className="text-sm text-gray-500">To</span>
                    <Input 
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
                        className="w-auto"
                    />
                </div>
                
                <Input 
                    placeholder="Filter by Action..." 
                    value={filterAction}
                    onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
                    className="w-[160px]"
                />

                <Input 
                    placeholder="Search description or entity..." 
                    value={filterSearch}
                    onChange={(e) => { setFilterSearch(e.target.value); setPage(1); }}
                    className="flex-1 min-w-[200px]"
                />
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Timestamp</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Module</TableHead>
                                    <TableHead>Object</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>IP Address</TableHead>
                                    <TableHead>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading audit logs...</TableCell>
                                    </TableRow>
                                ) : logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-slate-500">No audit logs found.</TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map((log: any) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="whitespace-nowrap">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </TableCell>
                                            <TableCell>{log.user_email || 'System'}</TableCell>
                                            <TableCell>
                                                <Badge variant={log.action.includes('FAILED') ? 'destructive' : 'secondary'}>
                                                    {log.action}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="uppercase text-xs font-semibold">{log.module}</TableCell>
                                            <TableCell className="text-sm font-medium">{log.entity_label || log.entity_id}</TableCell>
                                            <TableCell className="max-w-xs truncate" title={log.description}>{log.description}</TableCell>
                                            <TableCell>
                                                {log.ip_address ? (
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span className="text-xs font-mono">{log.ip_address}</span>
                                                        <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${log.ip_is_routable === true ? 'bg-green-50 text-green-700 border-green-200' : log.ip_is_routable === false ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                                                            {log.ip_is_routable === true ? 'Public' : log.ip_is_routable === false ? 'Internal / VPN' : 'Unknown'}
                                                        </Badge>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400">N/A</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {(log.changes_json && Object.keys(log.changes_json).length > 0) && (
                                                    <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>View Diff</Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-between items-center px-2">
                <div className="text-sm text-gray-500">
                    Showing page {page} of {totalPages} ({totalRecords} records)
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
            </div>
            
            <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Change Diff: {selectedLog?.action} on {selectedLog?.entity_label}</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 max-h-[60vh] overflow-y-auto">
                        {selectedLog?.changes_json && (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Field</TableHead>
                                        <TableHead>Old Value</TableHead>
                                        <TableHead>New Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Object.entries(selectedLog.changes_json).map(([field, diff]: [string, any]) => (
                                        <TableRow key={field}>
                                            <TableCell className="font-semibold">{field}</TableCell>
                                            <TableCell className="text-red-600 bg-red-50/50 line-through decoration-red-300">
                                                {JSON.stringify(diff.old)}
                                            </TableCell>
                                            <TableCell className="text-green-600 bg-green-50/50">
                                                {JSON.stringify(diff.new)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
