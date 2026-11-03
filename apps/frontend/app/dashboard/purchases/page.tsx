'use client';

import { useState } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PurchasesList } from '@/components/purchases/PurchasesList';
import { NewPurchaseForm } from '@/components/purchases/NewPurchaseForm';
import { DistributorsTab } from '@/components/purchases/DistributorsTab';
import { PurchaseOrdersList } from '@/components/purchases/PurchaseOrdersList';
import { FileText, Plus, Users, ShoppingCart, Edit, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PurchaseInvoiceFull } from '@/types';
import { useAuthStore } from '@/store/authStore';

const tabs = [
    { value: 'invoices',        label: 'Invoices',        icon: FileText },
    { value: 'purchase_orders', label: 'Purchase Orders', icon: ClipboardList },
    { value: 'new',             label: 'New Purchase',    icon: Plus     },
    { value: 'distributors',    label: 'Distributors',    icon: Users    },
];


export default function PurchasesPage() {
    const [activeTab, setActiveTab] = useState('invoices');
    const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoiceFull | null>(null);
    const [lastModifiedInvoiceId, setLastModifiedInvoiceId] = useState<string | null>(null);

    const user = useAuthStore((s) => s.user);
    const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || !!user?.canEditPurchases;
    const canCreate = user?.role === 'super_admin' || user?.role === 'admin' || !!user?.canCreatePurchases;

    const handleEditInvoice = (invoice: PurchaseInvoiceFull) => {
        setEditingInvoice(invoice);
        setActiveTab('new');
    };

    const handleTabChange = (tab: string) => {
        if (tab !== 'new') setEditingInvoice(null);
        setActiveTab(tab);
    };

    const handleScanSuccess = (draftId: string) => {
        setEditingInvoice({ id: draftId, status: 'SAVED' } as unknown as PurchaseInvoiceFull);
        setActiveTab('new');
    };

    return (
        <div className={cn('overflow-x-clip', activeTab === 'new' ? 'space-y-0' : 'space-y-6')}>

            {/* ── Page Header ── */}
            {activeTab !== 'new' && (
                <>
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <ShoppingCart className="h-4 w-4" />
                                </div>
                                <h1 className="text-2xl font-bold tracking-tight">Purchases</h1>
                            </div>
                            <p className="pl-[46px] text-sm text-muted-foreground">Record and manage purchase invoices (GRN) from distributors</p>
                        </div>
                        <Button
                            size="sm"
                            className="shrink-0 gap-1.5"
                            onClick={() => { setEditingInvoice(null); setActiveTab('new'); }}
                        >
                            <Plus className="h-4 w-4" />
                            New Purchase
                        </Button>
                    </div>
                    <Separator />
                </>
            )}

            {/* ── Tabs ── */}
            <Tabs value={activeTab} onValueChange={handleTabChange}>

                {/* Custom tab bar */}
                <div className={cn('flex overflow-x-auto border-b border-border', activeTab === 'new' && 'bg-white')}>
                    {tabs.map(({ value, label, icon: Icon }) => {
                        const isActive = activeTab === value;
                        const isEditTab = value === 'new' && !!editingInvoice && editingInvoice.status !== 'DRAFT';
                        return (
                            <button
                                key={value}
                                onClick={() => handleTabChange(value)}
                                className={cn(
                                    'flex shrink-0 items-center gap-2 px-3 font-medium transition-all duration-150',
                                    activeTab === 'new' ? 'py-1.5 text-xs' : 'py-2 text-sm',
                                    'border-b-2 -mb-px',
                                    'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                                    isActive && 'border-primary text-primary font-semibold',
                                    isEditTab && isActive && 'border-amber-500 text-amber-600',
                                )}
                            >
                                {isEditTab
                                    ? <Edit className={cn('h-4 w-4', isActive ? 'text-amber-500' : 'text-muted-foreground')} />
                                    : <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                                }
                                {isEditTab ? 'Edit Purchase' : label}
                            </button>
                        );
                    })}
                </div>

                {/* ── Tab Content ── */}
                <div className={activeTab === 'new' ? 'pt-0' : 'pt-6'}>

                    <TabsContent value="invoices" forceMount className={cn("mt-0 outline-none", activeTab !== 'invoices' && "hidden")}>
                        <PurchasesList 
                            onEditInvoice={canEdit ? handleEditInvoice : undefined} 
                            onScanSuccess={canCreate ? handleScanSuccess : undefined}
                            highlightInvoiceId={lastModifiedInvoiceId}
                            onClearHighlight={() => setLastModifiedInvoiceId(null)}
                        />
                    </TabsContent>

                    <TabsContent value="purchase_orders" className="mt-0 outline-none">
                        <PurchaseOrdersList />
                    </TabsContent>

                    <TabsContent value="new" className="mt-0 bg-slate-100/60 outline-none xl:min-h-[calc(100dvh-11rem)]">
                        <div className="w-full min-w-0">
                            {editingInvoice && editingInvoice.status !== 'DRAFT' && (
                                <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                    <Edit className="h-4 w-4 shrink-0 text-amber-600" />
                                    <span>You are <strong>editing</strong> invoice <strong>{editingInvoice.invoiceNo}</strong>. Changes will be synced across inventory, ledgers and journal entries.</span>
                                    <button
                                        className="ml-auto text-amber-500 hover:text-amber-700 underline text-xs"
                                        onClick={() => { setEditingInvoice(null); setActiveTab('invoices'); }}
                                    >Cancel Edit</button>
                                </div>
                            )}
                            <NewPurchaseForm
                                onSuccess={(updatedId) => {
                                    const targetId = updatedId || editingInvoice?.id || null;
                                    setLastModifiedInvoiceId(targetId);
                                    setEditingInvoice(null);
                                    setActiveTab('invoices');
                                }}
                                invoiceToEdit={editingInvoice}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="distributors" className="mt-0 outline-none">
                        <DistributorsTab />
                    </TabsContent>

                </div>
            </Tabs>
        </div>
    );
}
