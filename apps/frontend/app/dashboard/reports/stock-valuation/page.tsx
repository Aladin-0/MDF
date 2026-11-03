import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { StockValuationTab } from '@/components/reports/StockValuationTab';

export default function StockValuationPage() {
    return (
        <ReportPageLayout
            title="Stock Valuation"
            description="Current inventory value by product and batch."
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: 'Stock Valuation' },
            ]}
        >
            <StockValuationTab />
        </ReportPageLayout>
    );
}
