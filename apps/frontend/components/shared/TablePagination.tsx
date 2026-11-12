import { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const count = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

interface TablePaginationProps {
    page: number;
    totalPages: number;
    totalRecords: number;
    pageSize: number;
    onPage: (page: number) => void;
    onPageSize: (size: number) => void;
    /** What the rows are called in "Showing 1–50 of 120 entries". */
    noun?: string;
    /** Never offer more than the server will return (the inventory list clamps at 100). */
    pageSizes?: readonly number[];
    /** True while the next page is loading. */
    busy?: boolean;
}

/** 1 … 4 5 [6] 7 8 … 20: always the first, the last, and the neighbours of the current page. */
export function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
    const pages = Array.from(wanted).filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    const out: (number | 'gap')[] = [];
    pages.forEach((n, i) => {
        if (i > 0 && n - pages[i - 1] > 1) out.push('gap');
        out.push(n);
    });
    return out;
}

export function TablePagination({ page, totalPages, totalRecords, pageSize, onPage, onPageSize, noun = 'entries', pageSizes = [25, 50, 100], busy }: TablePaginationProps) {
    const sizeId = useId();
    const first = totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, totalRecords);

    return (
        <div className="flex flex-col items-stretch gap-2 border-t bg-muted/30 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-4">
            <p className="text-sm text-muted-foreground tabular-nums" role="status" aria-live="polite">
                Showing <span className="font-medium text-foreground">{count.format(first)}–{count.format(last)}</span> of{' '}
                <span className="font-medium text-foreground">{count.format(totalRecords)}</span> {noun}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <div className="flex items-center gap-2">
                    <Label htmlFor={sizeId} className="text-xs text-muted-foreground">Rows</Label>
                    <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
                        <SelectTrigger id={sizeId} className="h-9 w-[4.5rem]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {pageSizes.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <nav aria-label="Pagination" className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1 || busy}>
                        <ChevronLeft aria-hidden="true" /> Prev
                    </Button>
                    {pageWindow(page, totalPages).map((n, i) =>
                        n === 'gap' ? (
                            <span key={`gap-${i}`} className="hidden px-1 text-muted-foreground sm:inline" aria-hidden="true">…</span>
                        ) : (
                            <Button
                                key={n}
                                type="button"
                                size="sm"
                                variant={n === page ? 'default' : 'outline'}
                                className={`min-w-9 px-2 tabular-nums ${n === page ? '' : 'hidden sm:inline-flex'}`}
                                aria-label={`Page ${n}`}
                                aria-current={n === page ? 'page' : undefined}
                                onClick={() => onPage(n)}
                            >
                                {n}
                            </Button>
                        ),
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages || busy}>
                        Next <ChevronRight aria-hidden="true" />
                    </Button>
                </nav>
            </div>
        </div>
    );
}
