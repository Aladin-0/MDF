'use client';

import React from 'react';
import { DoctorPicker } from './DoctorPicker';
import { Doctor } from '@/types';

export interface DoctorSearchProps {
    currentDoctor: Doctor | null;
    onSelect: (doctor: Doctor | null) => void;
    placeholder?: string;
    className?: string;
    inputRef?: React.RefObject<HTMLInputElement>;
    nextInputRef?: React.RefObject<HTMLInputElement>;
}

export function DoctorSearch(props: DoctorSearchProps) {
    return <DoctorPicker {...props} />;
}

export { DoctorPicker };
