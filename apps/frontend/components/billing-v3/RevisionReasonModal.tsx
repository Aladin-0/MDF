import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const REASON_CODES = [
    { value: 'CUSTOMER_REQUEST', label: 'Customer Request' },
    { value: 'ENTRY_ERROR_RATE', label: 'Entry Error: Rate/Discount' },
    { value: 'ENTRY_ERROR_QTY', label: 'Entry Error: Quantity' },
    { value: 'ENTRY_ERROR_ITEM', label: 'Entry Error: Wrong Item' },
    { value: 'DOCTOR_CHANGE', label: 'Doctor / Header Change' },
    { value: 'OTHER', label: 'Other' },
];

interface RevisionReasonModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (reasonCode: string, reasonText: string) => void;
}

export function RevisionReasonModal({ open, onOpenChange, onSubmit }: RevisionReasonModalProps) {
    const [reasonCode, setReasonCode] = useState('');
    const [reasonText, setReasonText] = useState('');

    const handleSubmit = () => {
        if (!reasonCode || !reasonText.trim()) {
            alert('Please select a reason code and provide a brief explanation.');
            return;
        }
        onSubmit(reasonCode, reasonText);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Reason for Modification</DialogTitle>
                    <DialogDescription>
                        Please provide a reason for revising this document. This will be recorded in the audit log.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Reason Code <span className="text-red-500">*</span></Label>
                        <Select value={reasonCode} onValueChange={setReasonCode}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a code" />
                            </SelectTrigger>
                            <SelectContent>
                                {REASON_CODES.map(c => (
                                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Detailed Explanation <span className="text-red-500">*</span></Label>
                        <Input 
                            placeholder="Briefly explain why this is being modified..."
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmit();
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>Proceed</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
