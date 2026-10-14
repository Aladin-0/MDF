'use client';

import React from 'react';
import { LedgerPicker } from './LedgerPicker';
import { Ledger } from '@/types';
import { User } from 'lucide-react';

export interface CustomerSearchProps {
    currentLedger?: Ledger | null;
    onSelect: (ledger: Ledger | null) => void;
    placeholder?: string;
    className?: string;
    inputRef?: React.RefObject<HTMLInputElement>;
    nextInputRef?: React.RefObject<HTMLInputElement>;
}

export function CustomerSearch({
    currentLedger = null,
    onSelect,
    placeholder = 'Search Customer...',
    className,
    inputRef,
    nextInputRef
}: CustomerSearchProps) {
    return (
        <LedgerPicker
            currentLedger={currentLedger}
            onSelect={onSelect}
            defaultGroupName="Sundry Debtors"
            icon={<User className="w-4 h-4 text-blue-500" />}
            placeholder={placeholder}
            className={className}
            inputRef={inputRef}
            nextInputRef={nextInputRef}
        />
    );
}

export { LedgerPicker as CustomerPicker };
