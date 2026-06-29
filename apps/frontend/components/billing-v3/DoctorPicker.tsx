'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Plus, Stethoscope } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { doctorsApi } from '@/lib/apiClient';
import { Doctor } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';
import { CreateDoctorModal } from './CreateDoctorModal';

interface DoctorPickerProps {
    currentDoctor: Doctor | null;
    onSelect: (doctor: Doctor | null) => void;
    placeholder?: string;
    className?: string;
}

export function DoctorPicker({ 
    currentDoctor, 
    onSelect, 
    placeholder = 'Dr. Name / Reg No...',
    className 
}: DoctorPickerProps) {
    const outletId = useOutletId();
    
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch doctors
    const { data, isFetching } = useQuery({
        queryKey: ['doctors', 'search', debouncedQuery, outletId],
        queryFn: async () => {
            if (!outletId) return [];
            const res = await doctorsApi.search(outletId, debouncedQuery || undefined);
            return (res as Doctor[]).slice(0, 10);
        },
        enabled: isOpen && !!outletId,
    });

    const doctors = data || [];

    const handleSelect = (doctor: Doctor | null) => {
        onSelect(doctor);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleCreateDoctor = (doctor: Doctor) => {
        onSelect(doctor);
        setIsCreateOpen(false);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
        }
        if (e.key === 'Enter' && doctors.length > 0) {
            handleSelect(doctors[0]);
        }
    };

    if (currentDoctor) {
        return (
            <div className={cn("w-full h-9 pl-8 pr-3 border-2 border-purple-400 rounded flex items-center justify-between bg-purple-50/50", className)}>
                <div className="absolute left-2.5 top-2.5 text-purple-500">
                    <Stethoscope className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 truncate">
                    <span className="font-semibold text-purple-900 text-sm truncate">{currentDoctor.name}</span>
                    {currentDoctor.regNo && (
                        <span className="text-[10px] bg-white text-slate-800 px-1.5 py-0.5 rounded font-bold shrink-0">{currentDoctor.regNo}</span>
                    )}
                </div>
                <button 
                    className="text-[10px] text-purple-600 hover:text-purple-800 font-bold uppercase tracking-wider ml-2 shrink-0" 
                    onClick={() => handleSelect(null)}
                >
                    Change
                </button>
            </div>
        );
    }

    const handleBlur = (e: React.FocusEvent) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setIsOpen(false);
        }
    };

    return (
        <div className="relative" ref={containerRef} onBlur={handleBlur}>
            <div className="absolute left-2.5 top-2.5 text-slate-400">
                <Stethoscope className="w-4 h-4" />
            </div>
            <Input 
                ref={inputRef}
                className={cn("w-full h-9 pl-8 pr-3 border border-slate-300 rounded focus-visible:ring-1 focus-visible:ring-purple-500 font-medium placeholder:text-slate-400 text-sm", className)}
                placeholder={placeholder}
                value={searchQuery}
                onChange={e => {
                    setSearchQuery(e.target.value);
                    if (!isOpen) setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
            />

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="max-h-60 overflow-y-auto p-1">
                        {isFetching ? (
                            <div className="flex items-center justify-center py-4 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        ) : doctors.length > 0 ? (
                            doctors.map(doctor => (
                                <div 
                                    key={doctor.id}
                                    onClick={() => handleSelect(doctor)}
                                    className="px-3 py-2 hover:bg-purple-50 cursor-pointer rounded flex flex-col group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-slate-700 group-hover:text-purple-700">{doctor.name}</span>
                                        {doctor.regNo && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{doctor.regNo}</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium flex gap-1 items-center">
                                        {doctor.specialty && <span>{doctor.specialty}</span>}
                                        {doctor.specialty && doctor.hospitalName && <span>•</span>}
                                        {doctor.hospitalName && <span>{doctor.hospitalName}</span>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-4 text-center text-sm text-slate-500 font-medium">
                                No doctors found
                            </div>
                        )}
                    </div>

                    <div className="p-2 bg-slate-50 border-t border-slate-100">
                        <button 
                            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded transition-colors border border-purple-100"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsOpen(false);
                                setIsCreateOpen(true);
                            }}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            ADD NEW DOCTOR
                        </button>
                    </div>
                </div>
            )}

            {isCreateOpen && (
                <CreateDoctorModal 
                    initialName={searchQuery}
                    onSave={handleCreateDoctor}
                    onClose={() => setIsCreateOpen(false)}
                />
            )}
        </div>
    );
}
