import os
import re

file_path = '/home/asta/coding/MDF/apps/frontend/components/accounts/VoucherForm.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Remove reasonCode and reasonText from VoucherFormProps
content = content.replace("    reasonCode?: string;\n    reasonText?: string;\n", "")
content = content.replace("{ initialType = 'receipt', voucherId, reasonCode, reasonText, onSuccess }: VoucherFormProps", "{ initialType = 'receipt', voucherId, onSuccess }: VoucherFormProps")

# 2. Add local state for reasonCode and reasonText
state_injection = """    const [originalStatus, setOriginalStatus] = useState<string>('draft');
    
    // Revision tracking
    const [reasonCode, setReasonCode] = useState('');
    const [reasonText, setReasonText] = useState('');"""

content = content.replace("    const [originalStatus, setOriginalStatus] = useState<string>('draft');", state_injection)

# 3. Add REASON_CODES constant if missing, or we can just import it, or just define it.
# It seems REASON_CODES wasn't in VoucherForm. Let's add it at the top level.
reason_codes = """const REASON_CODES = [
    { value: 'MODIFIED', label: 'General Modification' },
    { value: 'AMOUNT_CORRECTION', label: 'Amount Correction' },
    { value: 'LEDGER_CORRECTION', label: 'Ledger Correction' },
    { value: 'DATE_CORRECTION', label: 'Date Correction' },
    { value: 'NARRATION_UPDATE', label: 'Narration Update' },
];

function newLine"""
content = content.replace("function newLine", reason_codes)

# 4. In handleSubmit, enforce validation
submit_validation = """        try {
            if (voucherId && originalStatus === 'posted') {
                if (!reasonCode || reasonText.length < 10) {
                    toast({ variant: 'destructive', title: 'Revision Reason Required', description: 'Please provide a valid reason code and explanation (min 10 chars) for this modification.' });
                    return;
                }
            }
"""
content = content.replace("        try {", submit_validation, 1)

# 5. Render the UI fields before the Action Buttons
ui_section = """
            {/* Revision Reason Section for Posted Vouchers */}
            {voucherId && originalStatus === 'posted' && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2 text-amber-800 font-semibold mb-2">
                        <AlertCircle className="w-5 h-5" />
                        Modification Reason Required
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Reason Code</Label>
                            <select 
                                className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={reasonCode}
                                onChange={(e) => setReasonCode(e.target.value)}
                            >
                                <option value="" disabled>Select a reason...</option>
                                {REASON_CODES.map(rc => (
                                    <option key={rc.value} value={rc.value}>{rc.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Detailed Explanation</Label>
                            <Textarea 
                                placeholder="Explain why this transaction is being modified..."
                                value={reasonText}
                                onChange={e => setReasonText(e.target.value)}
                                className="min-h-[40px]"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
"""
content = content.replace("            {/* Action Buttons */}", ui_section)

with open(file_path, 'w') as f:
    f.write(content)
print("VoucherForm patched.")
