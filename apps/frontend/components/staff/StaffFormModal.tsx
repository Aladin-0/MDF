'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useCreateStaff, useUpdateStaff } from '@/hooks/useStaff';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

const ROLES = [
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'billing_staff', label: 'Billing Staff' },
    { value: 'view_only', label: 'View Only' },
    { value: 'custom', label: 'Custom' },
];

const ROLE_PERMISSIONS: Record<string, any> = {
    admin: {
        canEditSales: true, canModifyPaidBill: true, canModifyDraftUnpaidBill: true, canCorrectHeaderFields: true, canCorrectQuantities: true,
        canOverridePricing: true, canCorrectCustomer: true,
        canCreatePurchases: true, canViewPurchaseRates: true, canEditPurchases: true, canModifyPaidPurchases: true,
        canEditVouchers: true, canModifySettledVouchers: true, canEditReturns: true, canModifySettledReturns: true,
        canAccessReports: true, canVoidRecords: true, canViewAuditHistory: true, canExportGst: true,
    },
    manager: {
        canEditSales: true, canModifyPaidBill: true, canModifyDraftUnpaidBill: true, canCorrectHeaderFields: true, canCorrectQuantities: true,
        canOverridePricing: true, canCorrectCustomer: true,
        canCreatePurchases: true, canViewPurchaseRates: true, canEditPurchases: true, canModifyPaidPurchases: true,
        canEditVouchers: true, canModifySettledVouchers: true, canEditReturns: true, canModifySettledReturns: true,
        canAccessReports: true, canVoidRecords: false, canViewAuditHistory: true, canExportGst: true,
    },
    billing_staff: {
        canEditSales: true, canModifyPaidBill: false, canModifyDraftUnpaidBill: true, canCorrectHeaderFields: false, canCorrectQuantities: false,
        canOverridePricing: false, canCorrectCustomer: false,
        canCreatePurchases: false, canViewPurchaseRates: false, canEditPurchases: false, canModifyPaidPurchases: false,
        canEditVouchers: false, canModifySettledVouchers: false, canEditReturns: false, canModifySettledReturns: false,
        canAccessReports: false, canVoidRecords: false, canViewAuditHistory: false, canExportGst: false,
    },
    view_only: {
        canEditSales: false, canModifyPaidBill: false, canModifyDraftUnpaidBill: false, canCorrectHeaderFields: false, canCorrectQuantities: false,
        canOverridePricing: false, canCorrectCustomer: false,
        canCreatePurchases: false, canViewPurchaseRates: false, canEditPurchases: false, canModifyPaidPurchases: false,
        canEditVouchers: false, canModifySettledVouchers: false, canEditReturns: false, canModifySettledReturns: false,
        canAccessReports: true, canVoidRecords: false, canViewAuditHistory: false, canExportGst: false,
    }
};

interface StaffFormModalProps {
    open: boolean;
    onClose: () => void;
    editingStaff?: any;
}

export function StaffFormModal({ open, onClose, editingStaff }: StaffFormModalProps) {
    const isEdit = !!editingStaff;
    const createMutation = useCreateStaff();
    const updateMutation = useUpdateStaff();

    const { register, handleSubmit, reset, setValue, watch, getValues, control, formState: { errors } } =
        useForm({
            defaultValues: {
                name: '',
                role: 'billing_staff',
                phone: '',
                email: '',
                password: '',
                confirmPassword: '',
                pin: '',
                confirmPin: '',
                joinDate: new Date().toISOString().split('T')[0],
                salary: '',
                maxDiscount: 0,
                canEditSales: false,
                canModifyPaidBill: false,
                canModifyDraftUnpaidBill: false,
                canCorrectHeaderFields: false,
                canCorrectQuantities: false,
                
                canOverridePricing: false,
                canCorrectCustomer: false,

                canCreatePurchases: false,
                canViewPurchaseRates: false,
                canEditPurchases: false,
                canModifyPaidPurchases: false,

                canEditVouchers: false,
                canModifySettledVouchers: false,
                canEditReturns: false,
                canModifySettledReturns: false,

                canAccessReports: false,
                canVoidRecords: false,
                canViewAuditHistory: false,
                canExportGst: false,
            }
        });

    // Pre-fill when editing
    useEffect(() => {
        if (editingStaff) {
            reset({
                name: editingStaff.name,
                role: editingStaff.role,
                phone: editingStaff.phone ?? '',
                email: editingStaff.email ?? '',
                password: '',
                confirmPassword: '',
                pin: '',
                confirmPin: '',
                joinDate: editingStaff.joinDate ?? '',
                salary: editingStaff.salary ?? '',
                maxDiscount: editingStaff.maxDiscount ?? 0,
                canEditSales: editingStaff.canEditSales ?? false,
                canModifyPaidBill: editingStaff.canModifyPaidBill ?? false,
                canModifyDraftUnpaidBill: (editingStaff.canModifyDraftBill || editingStaff.canModifyUnpaidBill) ?? false,
                canCorrectHeaderFields: editingStaff.canCorrectHeaderFields ?? false,
                canCorrectQuantities: editingStaff.canCorrectQuantities ?? false,
                
                canOverridePricing: (editingStaff.canEditRate || editingStaff.canCorrectRatesDiscounts) ?? false,
                canCorrectCustomer: editingStaff.canCorrectCustomer ?? false,

                canCreatePurchases: editingStaff.canCreatePurchases ?? false,
                canViewPurchaseRates: editingStaff.canViewPurchaseRates ?? false,
                canEditPurchases: editingStaff.canEditPurchases ?? false,
                canModifyPaidPurchases: editingStaff.canModifyPaidPurchases ?? false,

                canEditVouchers: editingStaff.canEditVouchers ?? false,
                canModifySettledVouchers: editingStaff.canModifySettledVouchers ?? false,
                canEditReturns: (editingStaff.canEditSaleReturns || editingStaff.canEditPurchaseReturns) ?? false,
                canModifySettledReturns: editingStaff.canModifySettledReturns ?? false,

                canAccessReports: editingStaff.canAccessReports ?? false,
                canVoidRecords: editingStaff.canVoidRecords ?? false,
                canViewAuditHistory: editingStaff.canViewAuditHistory ?? false,
                canExportGst: editingStaff.canExportGst ?? false,
            });
        } else {
            reset();
        }
    }, [editingStaff, reset]);

    const onSubmit = (submittedData: any) => {
        const data = { ...getValues(), ...submittedData };
        // Strip confirm fields — never sent to backend
        delete data.confirmPassword;
        delete data.confirmPin;
        // On edit, omit password/pin if left blank (backend keeps existing)
        if (isEdit && !data.password) delete data.password;
        if (isEdit && !data.pin) delete data.pin;

        // Map unified UI fields back to backend payload
        data.canEditRate = data.canOverridePricing;
        data.canCorrectRatesDiscounts = data.canOverridePricing;

        data.canModifyDraftBill = data.canModifyDraftUnpaidBill;
        data.canModifyUnpaidBill = data.canModifyDraftUnpaidBill;
        
        data.canEditSaleReturns = data.canEditReturns;
        data.canEditPurchaseReturns = data.canEditReturns;
        
        data.canViewBillRevisionHistory = data.canViewAuditHistory;
        data.canCancelAndReissueBill = data.canVoidRecords;
        data.canModifyBillWithReturn = data.canEditSales; // Covered by master

        // Remove virtual fields from payload
        delete data.canOverridePricing;
        delete data.canModifyDraftUnpaidBill;
        delete data.canEditReturns;

        if (isEdit) {
            updateMutation.mutate(
                { id: editingStaff.id, data },
                { onSuccess: onClose }
            );
        } else {
            createMutation.mutate(data, { onSuccess: onClose });
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    const handleRoleChange = (roleValue: string) => {
        setValue('role', roleValue);
        if (roleValue !== 'custom' && ROLE_PERMISSIONS[roleValue]) {
            const perms = ROLE_PERMISSIONS[roleValue];
            Object.keys(perms).forEach(k => {
                setValue(k as any, perms[k]);
            });
        }
    };

    const evaluateRoleMatch = (currentValues: any) => {
        let matchedRole = 'custom';
        const rolesToCheck = ['admin', 'manager', 'billing_staff', 'view_only'];

        for (const role of rolesToCheck) {
            const preset = ROLE_PERMISSIONS[role];
            let isMatch = true;
            for (const key of Object.keys(preset)) {
                if (currentValues[key] !== preset[key]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                matchedRole = role;
                break;
            }
        }
        setValue('role', matchedRole);
    };

    const handleChildChange = (key: string, value: boolean) => {
        setValue(key as any, value);
        evaluateRoleMatch(getValues());
    };

    const handleMasterChange = (masterKey: string, value: boolean, childKeys: string[]) => {
        setValue(masterKey as any, value);
        if (value) {
            childKeys.forEach(k => setValue(k as any, true));
        } else {
            childKeys.forEach(k => setValue(k as any, false));
        }
        evaluateRoleMatch(getValues());
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
                <DialogHeader className="px-6 py-4 border-b shrink-0 bg-white sticky top-0 z-10">
                    <DialogTitle>
                        {isEdit ? `Edit — ${editingStaff?.name}` : 'Add New Staff Member'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <form id="staff-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                    {/* Basic Info */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Basic Information
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1 col-span-2">
                                <Label>Full Name *</Label>
                                <Input
                                    {...register('name', { required: 'Name is required' })}
                                    placeholder="e.g. Ravi Kumar"
                                />
                                {errors.name && (
                                    <p className="text-xs text-red-500">{errors.name.message as string}</p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <Label>Role *</Label>
                                <Select
                                    value={watch('role')}
                                    onValueChange={handleRoleChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ROLES.map(r => (
                                            <SelectItem key={r.value} value={r.value}>
                                                {r.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <Label>Phone *</Label>
                                <Input
                                    {...register('phone', { required: 'Phone is required' })}
                                    placeholder="9876543210"
                                    maxLength={10}
                                />
                                {errors.phone && (
                                    <p className="text-xs text-red-500">{errors.phone.message as string}</p>
                                )}
                            </div>

                            <div className="space-y-1 col-span-2">
                                <Label>Email</Label>
                                <Input
                                    {...register('email')}
                                    type="email"
                                    placeholder="ravi@pharmacy.com"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Security */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Security
                        </p>

                        <div className="grid grid-cols-2 gap-3">

                            {/* Password */}
                            <div className="space-y-1 col-span-2">
                                <Label>
                                    {isEdit ? 'New Password (leave blank to keep current)' : 'Password *'}
                                </Label>
                                <Input
                                    {...register('password', {
                                        required: isEdit ? false : 'Password is required',
                                        minLength: { value: 6, message: 'Password must be at least 6 characters' },
                                    })}
                                    type="password"
                                    placeholder={isEdit ? 'Leave blank to keep current' : 'Min. 6 characters'}
                                    autoComplete={isEdit ? 'new-password' : 'new-password'}
                                />
                                {errors.password && (
                                    <p className="text-xs text-red-500">{errors.password.message as string}</p>
                                )}
                                {!isEdit && (
                                    <p className="text-xs text-slate-500">
                                        Staff use their phone number + this password to log into MediFlow
                                    </p>
                                )}
                            </div>

                            {/* Confirm Password */}
                            <div className="space-y-1 col-span-2">
                                <Label>
                                    {isEdit ? 'Confirm New Password' : 'Confirm Password *'}
                                </Label>
                                <Input
                                    {...register('confirmPassword', {
                                        required: isEdit ? false : 'Please confirm the password',
                                        validate: (val) => {
                                            const pwd = watch('password');
                                            if (!pwd) return true;
                                            return val === pwd || 'Passwords do not match';
                                        },
                                    })}
                                    type="password"
                                    placeholder="Re-enter password"
                                    autoComplete="new-password"
                                />
                                {errors.confirmPassword && (
                                    <p className="text-xs text-red-500">{errors.confirmPassword.message as string}</p>
                                )}
                            </div>

                            {/* Billing PIN */}
                            <div className="space-y-1 col-span-2">
                                <Label>
                                    {isEdit ? 'New Billing PIN (leave blank to keep current)' : 'Billing PIN *'}
                                </Label>
                                <Input
                                    {...register('pin', {
                                        required: isEdit ? false : 'Billing PIN is required',
                                        minLength: { value: 4, message: 'PIN must be 4 digits' },
                                        maxLength: { value: 6, message: 'PIN max 6 digits' },
                                        pattern: { value: /^\d+$/, message: 'PIN must be numeric' },
                                    })}
                                    type="password"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="4–6 digit number"
                                    maxLength={6}
                                />
                                {errors.pin && (
                                    <p className="text-xs text-red-500">{errors.pin.message as string}</p>
                                )}
                                {!isEdit && (
                                    <p className="text-xs text-slate-500">
                                        4–6 digit number used at the billing counter
                                    </p>
                                )}
                            </div>

                            {/* Confirm Billing PIN — create only */}
                            {!isEdit && (
                                <div className="space-y-1 col-span-2">
                                    <Label>Confirm Billing PIN *</Label>
                                    <Input
                                        {...register('confirmPin', {
                                            required: 'Please confirm the PIN',
                                            validate: (val) =>
                                                val === watch('pin') || 'PINs do not match',
                                        })}
                                        type="password"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        placeholder="Re-enter PIN"
                                        maxLength={6}
                                    />
                                    {errors.confirmPin && (
                                        <p className="text-xs text-red-500">{errors.confirmPin.message as string}</p>
                                    )}
                                </div>
                            )}

                            <div className="space-y-1">
                                <Label>Max Discount Allowed (%)</Label>
                                <Input
                                    {...register('maxDiscount', { min: 0, max: 100 })}
                                    type="number"
                                    placeholder="0"
                                    min={0}
                                    max={100}
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Employment */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Employment Details
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Join Date</Label>
                                <Input
                                    {...register('joinDate')}
                                    type="date"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label>Monthly Salary (₹)</Label>
                                <Input
                                    {...register('salary')}
                                    type="number"
                                    placeholder="25000"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Permissions */}
                    <div className="space-y-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Permissions
                        </p>
                        <TooltipProvider>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Sales & Billing */}
                            <div className="space-y-0 p-3 rounded-xl border border-slate-200 bg-white">
                                <h4 className="font-semibold text-slate-800 text-sm mb-3">Sales & Billing</h4>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">Can Edit Sales</p>
                                            <p className="text-xs text-muted-foreground mt-1">Master permission to modify invoices</p>
                                        </div>
                                        <Switch
                                            checked={watch('canEditSales')}
                                            onCheckedChange={(v) => handleMasterChange('canEditSales', v, ['canModifyDraftUnpaidBill', 'canModifyPaidBill', 'canCorrectHeaderFields', 'canCorrectQuantities'])}
                                        />
                                    </div>
                                    <div className={cn(
                                        "p-3 rounded-md bg-slate-50 border-l-4 border-indigo-500 space-y-3 mt-2 transition-opacity", 
                                        !watch('canEditSales') && "opacity-50 pointer-events-none"
                                    )}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <p className="text-xs font-medium text-slate-700">Modify Draft/Unpaid Bills</p>
                                                <Tooltip>
                                                    <TooltipTrigger type="button" tabIndex={-1}>
                                                        <Info className="h-4 w-4 text-slate-400 ml-1.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Modify existing draft or unpaid bills</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch checked={watch('canModifyDraftUnpaidBill')} onCheckedChange={(v) => handleChildChange('canModifyDraftUnpaidBill', v)} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <p className="text-xs font-medium text-slate-700">Modify Paid Bills</p>
                                                <Tooltip>
                                                    <TooltipTrigger type="button" tabIndex={-1}>
                                                        <Info className="h-4 w-4 text-slate-400 ml-1.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Modify invoices that have already been paid</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch checked={watch('canModifyPaidBill')} onCheckedChange={(v) => handleChildChange('canModifyPaidBill', v)} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <p className="text-xs font-medium text-slate-700">Correct Header Fields</p>
                                                <Tooltip>
                                                    <TooltipTrigger type="button" tabIndex={-1}>
                                                        <Info className="h-4 w-4 text-slate-400 ml-1.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Edit doctor or customer on an invoice</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch checked={watch('canCorrectHeaderFields')} onCheckedChange={(v) => handleChildChange('canCorrectHeaderFields', v)} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <p className="text-xs font-medium text-slate-700">Correct Quantities</p>
                                                <Tooltip>
                                                    <TooltipTrigger type="button" tabIndex={-1}>
                                                        <Info className="h-4 w-4 text-slate-400 ml-1.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Modify item quantities on an invoice</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch checked={watch('canCorrectQuantities')} onCheckedChange={(v) => handleChildChange('canCorrectQuantities', v)} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Pricing Authority */}
                            <div className="space-y-0 p-3 rounded-xl border border-slate-200 bg-white">
                                <h4 className="font-semibold text-slate-800 text-sm mb-3">Pricing & Customer</h4>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">Override Pricing</p>
                                            <p className="text-xs text-muted-foreground mt-1">Override MRP & apply discounts</p>
                                        </div>
                                        <Switch checked={watch('canOverridePricing')} onCheckedChange={(v) => handleChildChange('canOverridePricing', v)} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">Correct Customer</p>
                                            <p className="text-xs text-muted-foreground mt-1">Change customer on existing bills</p>
                                        </div>
                                        <Switch checked={watch('canCorrectCustomer')} onCheckedChange={(v) => handleChildChange('canCorrectCustomer', v)} />
                                    </div>
                                </div>
                            </div>

                            {/* Purchases & Inventory */}
                            <div className="space-y-0 p-3 rounded-xl border border-slate-200 bg-white">
                                <h4 className="font-semibold text-slate-800 text-sm mb-3">Purchases & Inventory</h4>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">Create Purchases</p>
                                            <p className="text-xs text-muted-foreground mt-1">Add new GRN / purchase invoices</p>
                                        </div>
                                        <Switch checked={watch('canCreatePurchases')} onCheckedChange={(v) => handleChildChange('canCreatePurchases', v)} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">View Purchase Rates</p>
                                            <p className="text-xs text-muted-foreground mt-1">See cost price in inventory</p>
                                        </div>
                                        <Switch checked={watch('canViewPurchaseRates')} onCheckedChange={(v) => handleChildChange('canViewPurchaseRates', v)} />
                                    </div>
                                    
                                    <div className="pt-1">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium leading-none">Edit Purchases</p>
                                                <p className="text-xs text-muted-foreground mt-1">Modify existing purchases</p>
                                            </div>
                                            <Switch
                                                checked={watch('canEditPurchases')}
                                                onCheckedChange={(v) => handleMasterChange('canEditPurchases', v, ['canModifyPaidPurchases'])}
                                            />
                                        </div>
                                        <div className={cn(
                                            "p-3 rounded-md bg-slate-50 border-l-4 border-indigo-500 mt-2 transition-opacity", 
                                            !watch('canEditPurchases') && "opacity-50 pointer-events-none"
                                        )}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center">
                                                <p className="text-xs font-medium text-slate-700">Modify Paid Purchases</p>
                                                <Tooltip>
                                                    <TooltipTrigger type="button" tabIndex={-1}>
                                                        <Info className="h-4 w-4 text-slate-400 ml-1.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Edit purchase invoices that are paid</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch checked={watch('canModifyPaidPurchases')} onCheckedChange={(v) => handleChildChange('canModifyPaidPurchases', v)} />
                                        </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Vouchers & Returns */}
                            <div className="space-y-0 p-3 rounded-xl border border-slate-200 bg-white">
                                <h4 className="font-semibold text-slate-800 text-sm mb-3">Vouchers & Returns</h4>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium leading-none">Edit Vouchers</p>
                                                <p className="text-xs text-muted-foreground mt-1">Modify receipt/payment/contra</p>
                                            </div>
                                            <Switch
                                                checked={watch('canEditVouchers')}
                                                onCheckedChange={(v) => handleMasterChange('canEditVouchers', v, ['canModifySettledVouchers'])}
                                            />
                                        </div>
                                        <div className={cn(
                                            "p-3 rounded-md bg-slate-50 border-l-4 border-indigo-500 mt-2 transition-opacity", 
                                            !watch('canEditVouchers') && "opacity-50 pointer-events-none"
                                        )}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center">
                                                <p className="text-xs font-medium text-slate-700">Modify Settled Vouchers</p>
                                                <Tooltip>
                                                    <TooltipTrigger type="button" tabIndex={-1}>
                                                        <Info className="h-4 w-4 text-slate-400 ml-1.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Edit vouchers that are already settled</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch checked={watch('canModifySettledVouchers')} onCheckedChange={(v) => handleChildChange('canModifySettledVouchers', v)} />
                                        </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium leading-none">Edit Returns</p>
                                                <p className="text-xs text-muted-foreground mt-1">Modify existing returns</p>
                                            </div>
                                            <Switch
                                                checked={watch('canEditReturns')}
                                                onCheckedChange={(v) => handleMasterChange('canEditReturns', v, ['canModifySettledReturns'])}
                                            />
                                        </div>
                                        <div className={cn(
                                            "p-3 rounded-md bg-slate-50 border-l-4 border-indigo-500 mt-2 transition-opacity", 
                                            !watch('canEditReturns') && "opacity-50 pointer-events-none"
                                        )}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center">
                                                <p className="text-xs font-medium text-slate-700">Modify Settled Returns</p>
                                                <Tooltip>
                                                    <TooltipTrigger type="button" tabIndex={-1}>
                                                        <Info className="h-4 w-4 text-slate-400 ml-1.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Edit returns that are already settled</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch checked={watch('canModifySettledReturns')} onCheckedChange={(v) => handleChildChange('canModifySettledReturns', v)} />
                                        </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* System & Audit */}
                            <div className="space-y-0 p-3 rounded-xl border border-slate-200 bg-white lg:col-span-2">
                                <h4 className="font-semibold text-slate-800 text-sm mb-3">System & Audit</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">Access Reports</p>
                                            <p className="text-xs text-muted-foreground mt-1">View sales, GST, stock</p>
                                        </div>
                                        <Switch checked={watch('canAccessReports')} onCheckedChange={(v) => handleChildChange('canAccessReports', v)} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">Void/Cancel Records</p>
                                            <p className="text-xs text-muted-foreground mt-1">Cancel bills/vouchers</p>
                                        </div>
                                        <Switch checked={watch('canVoidRecords')} onCheckedChange={(v) => handleChildChange('canVoidRecords', v)} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">View Audit History</p>
                                            <p className="text-xs text-muted-foreground mt-1">See full revision logs</p>
                                        </div>
                                        <Switch checked={watch('canViewAuditHistory')} onCheckedChange={(v) => handleChildChange('canViewAuditHistory', v)} />
                                    </div>
                                </div>
                            </div>

                            {/* Tax & Compliance */}
                            <div className="space-y-0 p-3 rounded-xl border border-slate-200 bg-white lg:col-span-1">
                                <h4 className="font-semibold text-slate-800 text-sm mb-3">Tax & Compliance</h4>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium leading-none">Export GST Reports</p>
                                            <p className="text-xs text-muted-foreground mt-1">Allow downloading of official GSTR-1 and tax files.</p>
                                        </div>
                                        <Controller
                                            name="canExportGst"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch 
                                                    checked={field.value} 
                                                    onCheckedChange={(v) => {
                                                        field.onChange(v);
                                                        handleChildChange('canExportGst', v);
                                                    }} 
                                                />
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        </TooltipProvider>
                    </div>
                    </form>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-slate-50 shrink-0 sticky bottom-0 z-10">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="staff-form" disabled={isPending}>
                        {isPending
                            ? (isEdit ? 'Saving...' : 'Creating...')
                            : (isEdit ? 'Save Changes' : 'Create Staff Member')
                        }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
