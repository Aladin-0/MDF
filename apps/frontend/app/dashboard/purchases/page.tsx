'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PurchasesList } from '@/components/purchases/PurchasesList';
import { NewPurchaseForm } from '@/components/purchases/NewPurchaseForm';
import { DistributorsTab } from '@/components/purchases/DistributorsTab';
import { PurchaseOrdersList } from '@/components/purchases/PurchaseOrdersList';
import { FileText, Plus, Users, ShoppingCart, Edit, ClipboardList, ListChecks } from 'lucide-react';
import { ShortbookTab, AddToShortbook } from '@/components/purchases/ShortbookTab';
import { NewPurchaseOrderModal } from '@/components/purchases/NewPurchaseOrderModal';
import { usePOList, useShortbook } from '@/hooks/usePO';
import { cn } from '@/lib/utils';
import { PurchaseInvoiceFull } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';

const tabs = [
    { value: 'shortbook',       label: 'Shortbook',       icon: ListChecks },
    { value: 'purchase_orders', label: 'Purchase Orders', icon: ClipboardList },
    { value: 'invoices',        label: 'Invoices',        icon: FileText },
    { value: 'new',             label: 'New Purchase',    icon: Plus     },
    { value: 'distributors',    label: 'Distributors',    icon: Users    },
];
const TAB_VALUES = tabs.map((t) => t.value);


export default function PurchasesPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlTab = searchParams.get('tab');
    // PO settings moved to Settings; keep old bookmarks working
    useEffect(() => { if (urlTab === 'po_settings') router.replace('/dashboard/settings?tab=purchasing'); }, [urlTab, router]);
    const [activeTab, setActiveTab] = useState(urlTab && TAB_VALUES.includes(urlTab) ? urlTab : 'shortbook');
    // a link such as Inventory -> "Create Purchase Order" (?tab=purchase_orders&newPo=1) or PO -> "Receive goods" (?tab=new&poId=…)
    useEffect(() => { if (urlTab && TAB_VALUES.includes(urlTab)) setActiveTab(urlTab); }, [urlTab]);
    const [addShortbookOpen, setAddShortbookOpen] = useState(false);
    const [newPoOpen, setNewPoOpen] = useState(searchParams.get('newPo') === '1');
    const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoiceFull | null>(null);
    const [lastModifiedInvoiceId, setLastModifiedInvoiceId] = useState<string | null>(null);

    const { hasPermission } = usePermissions();
    const canEdit = hasPermission('edit_purchases');
    const canCreate = hasPermission('create_purchases');
    const shortbookCount = useShortbook({ countsOnly: 1 }).data?.counts.pending ?? 0;     // just the number for the badge: no rows, no stock scan
    const openPoCount = usePOList({ status: 'OPEN', pageSize: 1 }).data?.statusCounts.OPEN ?? 0;

    // On a phone the tab strip scrolls sideways: bring the active tab into view (no-op when every tab already fits).
    useEffect(() => {
        document.querySelector<HTMLElement>('[data-purchases-tab-active="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    }, [activeTab]);

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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <ShoppingCart className="h-4 w-4" />
                                </div>
                                <h1 className="text-2xl font-bold tracking-tight">Purchases</h1>
                            </div>
                            <p className="pl-[46px] text-sm text-muted-foreground">Record and manage purchase invoices (GRN) from distributors</p>
                        </div>
                        {/* the main action follows the tab */}
                        {activeTab === 'shortbook' && canCreate ? (
                            <Button size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto" onClick={() => setAddShortbookOpen(true)}><Plus className="h-4 w-4" />Add to Shortbook</Button>
                        ) : activeTab === 'purchase_orders' && canCreate ? (
                            <Button size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto" onClick={() => setNewPoOpen(true)}><Plus className="h-4 w-4" />New PO</Button>
                        ) : (
                            <Button size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto" onClick={() => { setEditingInvoice(null); setActiveTab('new'); }}><Plus className="h-4 w-4" />New Purchase</Button>
                        )}
                    </div>
                    <Separator />
                </>
            )}

            {/* ── Tabs ── */}
            <Tabs value={activeTab} onValueChange={handleTabChange}>

                {/* Custom tab bar */}
                <div className={cn('flex overflow-x-auto border-b border-border max-sm:no-scrollbar', activeTab === 'new' && 'bg-white')}>
                    {tabs.map(({ value, label, icon: Icon }) => {
                        const isActive = activeTab === value;
                        const isEditTab = value === 'new' && !!editingInvoice && editingInvoice.status !== 'DRAFT';
                        return (
                            <button
                                key={value}
                                data-purchases-tab-active={isActive ? 'true' : undefined}
                                onClick={() => handleTabChange(value)}
                                className={cn(
                                    'flex shrink-0 items-center gap-2 px-3 font-medium transition-all duration-150 max-sm:whitespace-nowrap',
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
                                {value === 'shortbook' && shortbookCount > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">{shortbookCount}</span>}
                                {value === 'purchase_orders' && openPoCount > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">{openPoCount}</span>}
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

                    <TabsContent value="shortbook" className="mt-0 outline-none">
                        <ShortbookTab />
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
            <AddToShortbook open={addShortbookOpen} onClose={() => setAddShortbookOpen(false)} />
            <NewPurchaseOrderModal open={newPoOpen} onOpenChange={setNewPoOpen} />
        </div>
    );
}
