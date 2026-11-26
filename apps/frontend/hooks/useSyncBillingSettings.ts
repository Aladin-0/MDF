import { useEffect } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { useOutletSettings } from '@/hooks/useOutletSettings';

/**
 * Puts the outlet settings the billing maths depends on into the billing store. Called by the billing PAGE, so the phone
 * and desktop layouts share it: it used to live in the desktop workspace, and a phone kept the default ("cost excludes
 * GST") for an outlet whose cost includes it, capping discounts differently from the server.
 */
export function useSyncBillingSettings() {
    const setLandingCostIncludeGst = useBillingStore((s) => s.setLandingCostIncludeGst);
    const { data } = useOutletSettings();

    useEffect(() => {
        if (data) {
            setLandingCostIncludeGst(Boolean(data.landingCostIncludeGst ?? (data as any).landing_cost_include_gst));
        }
    }, [data, setLandingCostIncludeGst]);
}
