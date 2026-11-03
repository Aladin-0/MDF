import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { ExpiryReportTab } from '@/components/reports/ExpiryReportTab';

export default function ExpiryReportPage() {
    return (
        <ReportPageLayout
            title="Expiry Report"
            description="Track expired and near-expiry stock batches."
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: 'Expiry Report' },
            ]}
        >
            <ExpiryReportTab />
        </ReportPageLayout>
    );
}
