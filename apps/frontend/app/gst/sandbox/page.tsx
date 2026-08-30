'use client';

import { useState, useEffect } from 'react';
import { useGSTStore } from '@/store/gstStore';
import { gstApi } from '@/lib/apiClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { ShieldCheck, AlertCircle, RefreshCw, KeyRound, ExternalLink, CheckCircle } from 'lucide-react';

export default function SandboxPage() {
    const [statusData, setStatusData] = useState<any>(null);
    const [providerMode, setProviderMode] = useState<string>('test');
    const [loading, setLoading] = useState(true);
    const [requesting, setRequesting] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [fetchError, setFetchError] = useState(false);
    
    // OTP Flow State
    const [showRequestDialog, setShowRequestDialog] = useState(false);
    const [otp, setOtp] = useState('');
    const { toast } = useToast();

    // Sync Flow State
    const { selectedPeriod } = useGSTStore();
    const [period, setPeriod] = useState(selectedPeriod || '102024'); 
    
    useEffect(() => {
        if (selectedPeriod) setPeriod(selectedPeriod);
    }, [selectedPeriod]);
    const [syncJob, setSyncJob] = useState<any>(null);
    const [showSyncConfirm, setShowSyncConfirm] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [polling, setPolling] = useState(false);

    useEffect(() => {
        loadStatus();
        return () => {
            setOtp('');
        };
    }, []);

    const loadStatus = async () => {
        try {
            setFetchError(false);
            const data = await gstApi.getSandboxStatus();
            setStatusData(data);
            if (data?.provider_mode) {
                setProviderMode(data.provider_mode);
            }
            if (data?.auth_status === 'AUTHENTICATED') {
                loadSyncJobStatus(selectedPeriod || '102024'); // Load status for default period
            }
        } catch (error: any) {
            setFetchError(true);
            console.error("Failed to load sandbox status", error);
            toast({ variant: 'destructive', title: 'Failed to connect to sandbox service' });
        } finally {
            setLoading(false);
        }
    };

    const loadSyncJobStatus = async (p: string) => {
        try {
            const data = await gstApi.getSandboxGstr2bStatus(p);
            setSyncJob(data);
            if (data.status === 'IN_PROGRESS') {
                startPolling(p);
            } else {
                setPolling(false);
            }
        } catch (error: any) {
            setSyncJob(null);
        }
    };

    const startPolling = (p: string) => {
        if (polling) return;
        setPolling(true);
        const interval = setInterval(async () => {
            try {
                const data = await gstApi.getSandboxGstr2bStatus(p);
                setSyncJob(data);
                if (data.status !== 'IN_PROGRESS') {
                    clearInterval(interval);
                    setPolling(false);
                }
            } catch (e) {
                clearInterval(interval);
                setPolling(false);
            }
        }, 3000);
    };

    const handleSync = async () => {
        setShowSyncConfirm(false);
        setSyncing(true);
        try {
            const res = await gstApi.syncSandboxGstr2b(period);
            toast({ title: 'Sync Started', description: res.message });
            setSyncJob({ status: 'IN_PROGRESS' });
            startPolling(period);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Sync Failed', description: error?.detail || error?.error || 'An error occurred' });
        } finally {
            setSyncing(false);
        }
    };

    const handleReconcile = async () => {
        try {
            const res = await gstApi.runSandboxGstr2bReconciliation(period);
            toast({ title: 'Reconciliation Started', description: res.message });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Reconciliation Failed', description: error?.detail || error?.error || 'An error occurred' });
        }
    };

    const handleRequestOTP = async () => {
        setShowRequestDialog(false);
        setRequesting(true);
        try {
            const res = await gstApi.requestSandboxOTP();
            toast({ title: 'OTP Requested', description: res.message });
            setStatusData((prev: any) => prev ? { ...prev, auth_status: 'OTP_PENDING' } : null);
            await loadStatus();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'OTP Request Failed', description: error?.detail || error?.error || 'An error occurred' });
        } finally {
            setRequesting(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otp) return;
        setVerifying(true);
        try {
            const res = await gstApi.verifySandboxOTP(otp);
            toast({ title: 'Authentication Successful', description: 'Taxpayer session established.' });
            setOtp('');
            await loadStatus();
        } catch (error: any) {
            setOtp('');
            toast({ variant: 'destructive', title: 'Verification Failed', description: error?.detail || error?.error || 'Invalid OTP' });
            await loadStatus(); 
        } finally {
            setVerifying(false);
        }
    };

    const cancelAuth = () => {
        setOtp('');
    };

    if (loading && !statusData) {
        return (
            <div className="space-y-4 max-w-4xl mx-auto pb-12">
                <Skeleton className="w-full h-32" />
                <Skeleton className="w-full h-64" />
            </div>
        );
    }

    const {
        is_configured,
        environment,
        outlet_name,
        masked_gstin,
        masked_username,
        provider,
        auth_status,
        session_expiry,
        otp_cooldown_active,
        error
    } = statusData || {};

    const isSandboxEnv = environment === 'SANDBOX_ONLY';

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        {providerMode === 'live' ? 'GST Provider Integration' : 'GST Sandbox'}
                        {isSandboxEnv && providerMode === 'test' && <Badge variant="destructive" className="uppercase tracking-widest text-xs">SANDBOX ONLY</Badge>}
                    </h1>
                    <p className="text-sm text-slate-500">
                        {providerMode === 'live' ? 'Configure provider credentials and authenticate via OTP.' : 'Configure sandbox credentials and authenticate via OTP.'}
                    </p>
                </div>
            </div>
            
            {providerMode === 'live' && (
                <div className="bg-red-600 text-white p-3 rounded-lg flex items-center gap-3 font-semibold text-sm shadow-md animate-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    LIVE GST PROVIDER — LOCAL DEVELOPMENT APP
                </div>
            )}

            {error && !fetchError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                        <h4 className="font-semibold text-sm">Configuration Error</h4>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                </div>
            )}

            {fetchError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                        <h4 className="font-semibold text-sm">Connection Error</h4>
                        <p className="text-sm mt-1">Unable to reach GST backend service.</p>
                    </div>
                </div>
            )}

            {!fetchError && statusData && !is_configured && !error && (
                <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                        <h4 className="font-semibold text-sm">Not Configured</h4>
                        <p className="text-sm mt-1">Sandbox configuration is missing or inactive for your environment.</p>
                    </div>
                </div>
            )}

            {is_configured && !fetchError && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-slate-600" />
                            Provider Connection
                        </CardTitle>
                        <CardDescription>Target sandbox provider and taxpayer binding.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-4 border-b pb-4">
                            <div>
                                <p className="text-slate-500 font-medium">Provider</p>
                                <p className="text-slate-900 font-mono mt-1">{provider}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 font-medium">Outlet</p>
                                <p className="text-slate-900 mt-1">{outlet_name}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-slate-500 font-medium">GSTIN</p>
                                <p className="text-slate-900 font-mono mt-1">{masked_gstin || 'Unknown'}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 font-medium">Sandbox User</p>
                                <p className="text-slate-900 font-mono mt-1">{masked_username || 'Unknown'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {is_configured && auth_status === 'UNAUTHENTICATED' && (
                <Card className="border-blue-200">
                    <CardHeader className="bg-blue-50/50 rounded-t-lg">
                        <CardTitle className="text-blue-900">Authentication Required</CardTitle>
                        <CardDescription>Request a secure OTP to authorize this session.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <Button 
                            onClick={() => setShowRequestDialog(true)} 
                            disabled={requesting || otp_cooldown_active}
                        >
                            <KeyRound className="w-4 h-4 mr-2" />
                            {requesting ? 'Requesting...' : 'Request OTP'}
                        </Button>
                        {otp_cooldown_active && (
                            <p className="text-xs text-orange-600 mt-3 font-medium">
                                OTP requested recently. Please wait before requesting again.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {is_configured && auth_status === 'OTP_PENDING' && (
                <Card className="border-orange-200">
                    <CardHeader className="bg-orange-50/50 rounded-t-lg">
                        <CardTitle className="text-orange-900">OTP Sent</CardTitle>
                        <CardDescription>Enter the real OTP received from the Sandbox GST provider.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleVerifyOTP} className="space-y-4 max-w-sm">
                            <Input 
                                type="password" 
                                placeholder="••••••" 
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                maxLength={6}
                                pattern="\d*"
                                required
                                disabled={verifying}
                                className="font-mono text-center tracking-widest text-lg"
                                autoComplete="off"
                            />
                            <div className="flex gap-2">
                                <Button type="submit" disabled={!otp || verifying}>
                                    {verifying ? 'Verifying...' : 'Verify OTP'}
                                </Button>
                                <Button type="button" variant="ghost" onClick={cancelAuth} disabled={verifying}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {is_configured && auth_status === 'AUTHENTICATED' && (
                <Card className="border-green-200">
                    <CardHeader className="bg-green-50/50 rounded-t-lg">
                        <CardTitle className="text-green-900 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-green-600" />
                            Session Active
                        </CardTitle>
                        <CardDescription>Taxpayer session is securely established.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Session Expiry</p>
                            <p className="text-sm font-mono text-slate-900 mt-1">
                                {session_expiry ? new Date(session_expiry).toLocaleString() : 'Unknown'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className={auth_status !== 'AUTHENTICATED' ? "opacity-75" : "border-indigo-200"}>
                <CardHeader className={auth_status === 'AUTHENTICATED' ? "bg-indigo-50/50 rounded-t-lg" : ""}>
                    <CardTitle className="flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-indigo-600" />
                        GSTR-2B Sync
                    </CardTitle>
                    <CardDescription>
                        {auth_status === 'AUTHENTICATED' 
                            ? "GSTR-2B retrieval is authorized." 
                            : "GSTR-2B retrieval will be available after successful sandbox authentication."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                    <div className="flex gap-4 items-end">
                        <div className="w-1/3">
                            <p className="text-sm text-slate-500 font-medium mb-1">Return Period</p>
                            <Input 
                                value={period}
                                onChange={(e) => setPeriod(e.target.value)}
                                placeholder="MMYYYY"
                                disabled={auth_status !== 'AUTHENTICATED' || syncing || polling}
                            />
                        </div>
                        <Button 
                            variant="default" 
                            disabled={auth_status !== 'AUTHENTICATED' || syncing || polling || period.length !== 6}
                            onClick={() => setShowSyncConfirm(true)}
                        >
                            {syncing || polling ? 'Syncing...' : 'Sync GSTR-2B'}
                        </Button>
                    </div>

                    {syncJob && (
                        <div className={`p-4 rounded-lg border ${
                            syncJob.status === 'COMPLETED' ? 'bg-green-50 border-green-200 text-green-900' :
                            syncJob.status === 'NO_CHANGE' ? 'bg-blue-50 border-blue-200 text-blue-900' :
                            syncJob.status === 'NO_DATA_AVAILABLE' ? 'bg-orange-50 border-orange-200 text-orange-900' :
                            syncJob.status === 'IN_PROGRESS' ? 'bg-indigo-50 border-indigo-200 text-indigo-900' :
                            'bg-red-50 border-red-200 text-red-900'
                        }`}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-semibold text-sm">Status: {syncJob.status.replace(/_/g, ' ')}</h4>
                                    {syncJob.status === 'NO_CHANGE' && (
                                        <p className="text-xs mt-1">No change — using import from {new Date(syncJob.retrieval_timestamp).toLocaleString()}</p>
                                    )}
                                    {syncJob.status === 'NO_DATA_AVAILABLE' && (
                                        <p className="text-xs mt-1">No GSTR-2B data available for this period.</p>
                                    )}
                                    {syncJob.status === 'COMPLETED' && (
                                        <p className="text-xs mt-1">Records imported: {syncJob.record_count}</p>
                                    )}
                                    {syncJob.status === 'FAILED' && syncJob.error_metadata?.message && (
                                        <p className="text-xs mt-1">{syncJob.error_metadata.message}</p>
                                    )}
                                </div>
                                {(syncJob.status === 'COMPLETED' || syncJob.status === 'NO_CHANGE') && (
                                    <Button size="sm" variant="outline" onClick={handleReconcile}>
                                        Run Reconciliation
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Sync GSTR-2B Confirmation Dialog */}
            <Dialog open={showSyncConfirm} onOpenChange={setShowSyncConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm GSTR-2B Sync</DialogTitle>
                        <DialogDescription asChild className="pt-4 space-y-2 text-slate-700">
                            <div>
                                {providerMode === 'live' ? (
                                    <p className="text-red-600 font-medium">Retrieve LIVE GSTR-2B data for <strong>{period}</strong> and <strong>{masked_gstin}</strong>?</p>
                                ) : (
                                    <p>Retrieve GSTR-2B for <strong>{period}</strong> and <strong>{masked_gstin}</strong> from SANDBOX?</p>
                                )}
                                <p className="text-sm">This operation is idempotent and will not overwrite existing data if no changes are found.</p>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6">
                        <Button variant="ghost" onClick={() => setShowSyncConfirm(false)} disabled={syncing}>Cancel</Button>
                        <Button variant={providerMode === 'live' ? "destructive" : "default"} onClick={handleSync} disabled={syncing}>
                            {syncing ? 'Starting...' : 'Yes, Sync GSTR-2B'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Request OTP Confirmation Dialog */}
            <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm OTP Request</DialogTitle>
                        <DialogDescription asChild className="pt-4 space-y-2 text-slate-700">
                            <div>
                                {providerMode === 'live' ? (
                                    <p className="text-red-600 font-medium">Request OTP from LIVE GST provider for <strong>{masked_gstin}</strong> linked to <strong>{outlet_name}</strong>?</p>
                                ) : (
                                    <p>Request a GST Sandbox OTP for <strong>{masked_gstin}</strong> linked to <strong>{outlet_name}</strong>?</p>
                                )}
                                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 mt-2">
                                    <li>The OTP is sent by the {providerMode === 'live' ? 'GST provider' : 'sandbox provider'} to the registered recipient.</li>
                                    <li>You must enter the real OTP before it expires.</li>
                                    <li>The app will not display or save the OTP.</li>
                                    <li>Requesting another OTP is blocked until the cooldown ends.</li>
                                </ul>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6">
                        <Button variant="ghost" onClick={() => setShowRequestDialog(false)} disabled={requesting}>Cancel</Button>
                        <Button variant="default" onClick={handleRequestOTP} disabled={requesting}>
                            {requesting ? 'Requesting...' : 'Yes, Request OTP'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
