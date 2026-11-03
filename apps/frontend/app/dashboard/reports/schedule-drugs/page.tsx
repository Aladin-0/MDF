import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { ScheduleReportTab } from '@/components/reports/ScheduleReportTab';

export default function ScheduleDrugsPage() {
    return (
        <ReportPageLayout
            title="Schedule Drugs"
            description="Audit controlled drug sales and purchases by schedule."
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: 'Schedule Drugs' },
            ]}
        >
            <ScheduleReportTab />
        </ReportPageLayout>
    );
}
