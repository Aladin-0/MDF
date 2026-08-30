import { AlertTriangle, XCircle, Info, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ValidationPanel({ validation }: { validation: any }) {
    if (!validation) return null;

    const { is_valid_for_export, blocking_errors = [], warnings = [], info = [] } = validation;

    const totalIssues = blocking_errors.length + warnings.length;

    if (totalIssues === 0 && info.length === 0) {
        return (
            <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Ready for Export</AlertTitle>
                <AlertDescription className="text-green-700">
                    All transactions are validated successfully. No issues found.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-3">
            {blocking_errors && blocking_errors.length > 0 && (
                <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Validation Failed - Please fix these errors before exporting</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            {blocking_errors.map((err: any, i: number) => (
                                <li key={i}>
                                    <strong>[{err.code}]</strong> {err.message}
                                    {err.reference_id && <span className="ml-2 text-xs opacity-75">(Ref: {err.reference_id})</span>}
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {warnings && warnings.length > 0 && (
                <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">Warnings</AlertTitle>
                    <AlertDescription className="text-amber-800">
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            {warnings.map((warn: any, i: number) => (
                                <li key={i}>
                                    <strong>[{warn.code}]</strong> {warn.message}
                                    {warn.reference_id && <span className="ml-2 text-xs opacity-75">(Ref: {warn.reference_id})</span>}
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {info && info.length > 0 && (
                <Alert className="bg-blue-50 border-blue-200 text-blue-900">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800">Information</AlertTitle>
                    <AlertDescription className="text-blue-800">
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            {info.map((inf: any, i: number) => (
                                <li key={i}>{inf.message}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
