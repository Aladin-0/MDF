import { PODetailView } from '@/components/purchases/PODetailView';

export default function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
    return (
        <div className="space-y-6">
            <PODetailView orderId={params.id} />
        </div>
    );
}
