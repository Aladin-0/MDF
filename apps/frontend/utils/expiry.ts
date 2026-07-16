export type ExpiryStatus = 'expired' | 'expiring_soon' | 'near_expiry' | 'good' | 'unknown';

export function getExpiryStatus(expiryString: string | null | undefined): ExpiryStatus {
    if (!expiryString) return 'unknown';

    let month: number;
    let year: number;

    // Handle MM/YY or MM-YY or full ISO string
    if (expiryString.includes('-') && expiryString.length > 7) {
        // Assume ISO date like "2027-03-27"
        const date = new Date(expiryString);
        if (isNaN(date.getTime())) return 'unknown';
        month = date.getMonth() + 1;
        year = date.getFullYear();
    } else {
        const parts = expiryString.split(/[-/]/);
        if (parts.length !== 2) return 'unknown';
        
        month = parseInt(parts[0], 10);
        let yearPart = parseInt(parts[1], 10);
        if (isNaN(month) || isNaN(yearPart)) return 'unknown';

        year = yearPart < 100 ? 2000 + yearPart : yearPart;
    }

    // Set to the last day of the month
    const expiryDate = new Date(year, month, 0, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return 'expired';
    } else if (diffDays <= 90) {
        return 'expiring_soon';
    } else if (diffDays <= 180) {
        return 'near_expiry';
    } else {
        return 'good';
    }
}
