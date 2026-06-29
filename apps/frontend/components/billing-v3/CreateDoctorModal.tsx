'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { doctorsApi } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, X } from 'lucide-react';
import { Doctor } from '@/types';

interface CreateDoctorModalProps {
    initialName?: string;
    onSave: (doctor: Doctor) => void;
    onClose: () => void;
}

export function CreateDoctorModal({ initialName = '', onSave, onClose }: CreateDoctorModalProps) {
    const { outlet } = useAuthStore();
    
    const [name, setName] = useState(initialName);
    const [regNo, setRegNo] = useState('');
    const [degree, setDegree] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [hospitalName, setHospitalName] = useState('');
    const [qualification, setQualification] = useState('');
    const [hospitalAddress, setHospitalAddress] = useState('');
    
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Full Name is required');
            return;
        }
        if (!regNo.trim()) {
            setError('Reg. No. is required');
            return;
        }
        if (!outlet) return;

        setIsSaving(true);
        setError('');

        try {
            const newDoc = await doctorsApi.create({
                name: name.trim(),
                registrationNo: regNo.trim(),
                outletId: outlet.id,
                degree: degree.trim() || undefined,
                specialty: specialty.trim() || undefined,
                hospitalName: hospitalName.trim() || undefined,
                qualification: qualification.trim() || undefined,
                address: hospitalAddress.trim() || undefined,
            });
            onSave(newDoc);
        } catch (err: any) {
            console.error('Failed to create doctor:', err);
            setError(err.message || 'Failed to create doctor');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Doctor Details</h3>
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Form Body */}
                <div className="p-5 space-y-5">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">New Doctor Details</p>
                    </div>
                    
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-xs rounded border border-red-100 font-medium">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Full Name *</label>
                            <Input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="dr rajat"
                                className="h-9 text-sm"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Reg. No. *</label>
                            <Input
                                value={regNo}
                                onChange={e => setRegNo(e.target.value)}
                                placeholder="MH/12345"
                                className="h-9 text-sm"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Degree</label>
                            <Input
                                value={degree}
                                onChange={e => setDegree(e.target.value)}
                                placeholder="MBBS, MD"
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Specialties</label>
                            <Input
                                value={specialty}
                                onChange={e => setSpecialty(e.target.value)}
                                placeholder="Cardiology"
                                className="h-9 text-sm"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Hospital Name</label>
                            <Input
                                value={hospitalName}
                                onChange={e => setHospitalName(e.target.value)}
                                placeholder="City Hospital"
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Qualification</label>
                            <Input
                                value={qualification}
                                onChange={e => setQualification(e.target.value)}
                                placeholder="FCPS, DGO"
                                className="h-9 text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">Hospital Address</label>
                        <Input
                            value={hospitalAddress}
                            onChange={e => setHospitalAddress(e.target.value)}
                            placeholder="Full hospital address"
                            className="h-9 text-sm"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} className="h-9 font-medium" disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSave} 
                        className="h-9 bg-purple-500 hover:bg-purple-600 text-white font-bold"
                        disabled={isSaving}
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Save & Select Doctor
                    </Button>
                </div>
            </div>
        </div>
    );
}
