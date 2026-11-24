import { useEffect, useState } from 'react';

/** Rows a long report table draws at first, and how many more each "Show more" adds. */
export const REPORT_ROWS_STEP = 200;

/**
 * The first part of a long list for a report table, growing on request.
 *
 * The sales book, sales-return book and profit reports drew every row at once ("this year, detailed" can be
 * thousands of invoices), so the page took seconds to open and to scroll. Totals still come from the full list or
 * the server's summary; this only limits what is drawn. A new list (another date range or filter) starts again
 * from the top.
 */
export function useShownRows<T>(rows: T[], step: number = REPORT_ROWS_STEP) {
    const [limit, setLimit] = useState(step);
    useEffect(() => {
        setLimit(step);
    }, [rows, step]);
    return {
        shown: rows.length > limit ? rows.slice(0, limit) : rows,
        total: rows.length,
        remaining: Math.max(0, rows.length - limit),
        showMore: () => setLimit((current) => current + step),
    };
}
