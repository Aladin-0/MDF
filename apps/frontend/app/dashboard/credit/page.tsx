'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Download, UserPlus, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AgingSummaryCards from '@/components/credit/AgingSummaryCards';
import CreditAccountsList from '@/components/credit/CreditAccountsList';
import CustomerCreditDetail from '@/components/credit/CustomerCreditDetail';
import EditCreditLimitModal from '@/components/credit/EditCreditLimitModal';
import BulkReminderModal from '@/components/credit/BulkReminderModal';
import RecordCreditPaymentModal from '@/components/credit/RecordCreditPaymentModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCreditAccounts, useCreditAgingSummary } from '@/hooks/useCredit';
import { useAuthStore } from '@/store/authStore';
import { exportToCSV } from '@/lib/export';
import { WHATSAPP_TEMPLATES, openWhatsApp } from '@/lib/whatsapp';
import { differenceInDays, format } from 'date-fns';
import { CreditStatus, CreditAccount } from '@/types';
import { cn } from '@/lib/utils';

export default function CreditPage() {
    const router = useRouter();
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [showBulkReminder, setShowBulkReminder] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [activeFilter, setActiveFilter] = useState<CreditStatus | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    const outlet = useAuthStore((s) => s.outlet);
    const { data: accounts } = useCreditAccounts();
    const { data: aging } = useCreditAgingSummary();

    const overdueCount = aging?.totalOverdue?.count ?? 0;

    // WhatsApp for a single account
    const handleWhatsApp = (account?: CreditAccount) => {
        const acc = account || accounts?.find((a: any) => a.id === selectedAccountId);
        if (!acc) return;
        const daysOverdue = acc.lastTransactionDate
            ? differenceInDays(new Date(), new Date(acc.lastTransactionDate))
            : undefined;
        const msg = WHATSAPP_TEMPLATES.paymentReminder(
            acc.customer.name,
            acc.totalOutstanding,
            outlet?.name || 'Apollo Medical Store',
            acc.status === 'overdue' ? daysOverdue : undefined
        );
        openWhatsApp(acc.customer.phone, msg);
    };

    // CSV export
    const handleExport = () => {
        if (!accounts) return;
        const rows = accounts.map((a: any) => ({
            name: a.customer.isChronic ? `${a.customer.name} (Chronic)` : a.customer.name,
            phone: a.customer.phone,
            outstanding: a.totalOutstanding,
            creditLimit: a.creditLimit,
            status: a.status,
            lastTransaction: a.lastTransactionDate ? format(new Date(a.lastTransactionDate), 'dd/MM/yyyy') : '',
            daysSincePayment: a.lastTransactionDate
                ? differenceInDays(new Date(), new Date(a.lastTransactionDate))
                : '',
            totalPurchases: a.customer.totalPurchases,
        }));
        exportToCSV(rows, 'credit-outstanding', [
            { key: 'name', label: 'Customer Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'outstanding', label: 'Outstanding' },
            { key: 'creditLimit', label: 'Credit Limit' },
            { key: 'status', label: 'Status' },
            { key: 'lastTransaction', label: 'Last Transaction' },
            { key: 'daysSincePayment', label: 'Days Since Payment' },
            { key: 'totalPurchases', label: 'Total Purchases' },
        ]);
    };

    // Aging bucket click → filter
    const handleBucketClick = (bucket: string) => {
        if (bucket === 'all') {
            setActiveFilter('all');
        } else if (bucket === 'current') {
            setActiveFilter('active');
        } else {
            setActiveFilter('overdue');
        }
    };

    // Keyboard shortcuts
    useKeyboardShortcuts({
        '/': () => {
            const input = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
            input?.focus();
        },
        'Escape': () => {
            setSelectedAccountId(null);
            setSearchQuery('');
        },
        'p': () => selectedAccountId && setShowPaymentModal(true),
        'w': () => selectedAccountId && handleWhatsApp(),
        '1': () => setActiveFilter('all'),
        '2': () => setActiveFilter('overdue'),
        '3': () => setActiveFilter('active'),
    });

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Credit / Udhari</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Track outstanding balances and collect payments
                    </p>
                </div>
                <div className="flex gap-2">
                    {overdueCount > 0 && (
                        <Button
                            variant="outline"
                            className="border-green-300 text-green-600 hover:bg-green-50"
                            onClick={() => setShowBulkReminder(true)}
                        >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Send All Reminders
                        </Button>
                    )}
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Aging summary cards */}
            <AgingSummaryCards onBucketClick={handleBucketClick} />

            {/* Keyboard hints */}
            <div className="text-[10px] text-muted-foreground flex gap-3">
                <span><kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">/</kbd> Search</span>
                <span><kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">P</kbd> Pay</span>
                <span><kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">W</kbd> WhatsApp</span>
                <span><kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">Esc</kbd> Close</span>
            </div>

            {/* Main content */}
            <div className="flex gap-6">
                {/* Left: accounts list */}
                <div className={cn(
                    "flex-1 min-w-0 transition-all",
                    selectedAccountId && "lg:max-w-[55%]"
                )}>
                    <CreditAccountsList
                        activeFilter={activeFilter}
                        searchQuery={searchQuery}
                        selectedAccountId={selectedAccountId}
                        onSelect={setSelectedAccountId}
                        onPayClick={(id) => {
                            router.push('/dashboard/accounts/voucher-entry');
                        }}
                        onFilterChange={setActiveFilter}
                        onSearchChange={setSearchQuery}
                        onWhatsAppClick={(account) => handleWhatsApp(account)}
                    />
                </div>

                {/* Right: detail panel */}
                {selectedAccountId && (
                    <div className="hidden lg:block w-[420px] flex-shrink-0">
                        <CustomerCreditDetail
                            accountId={selectedAccountId}
                            onClose={() => setSelectedAccountId(null)}
                            onPayClick={() => router.push('/dashboard/accounts/voucher-entry')}
                            onEditLimit={() => setShowLimitModal(true)}
                            onWhatsAppClick={() => handleWhatsApp()}
                        />
                    </div>
                )}
            </div>

            {/* Modals */}
            <EditCreditLimitModal
                isOpen={showLimitModal}
                accountId={selectedAccountId}
                onClose={() => setShowLimitModal(false)}
            />

            <BulkReminderModal
                isOpen={showBulkReminder}
                onClose={() => setShowBulkReminder(false)}
            />

            {selectedAccountId && (
                <RecordCreditPaymentModal
                    isOpen={showPaymentModal}
                    accountId={selectedAccountId}
                    onClose={() => setShowPaymentModal(false)}
                />
            )}
        </div>
    );
}
