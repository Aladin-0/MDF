'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { describeQty, percentOf, rupees } from '@/lib/dashboard';

interface TopSellingItem {
    productId?: string;
    name: string;
    qty: number;
    qtyLoose?: number;
    revenue: number;
}

interface TopSellingTableProps {
    items: TopSellingItem[];
    totalSales: number;
    isLoading?: boolean;
    periodLabel: string;
}

/** The best sellers of the period by revenue (packs of different kinds cannot be ranked against each other). */
export default function TopSellingTable({ items, totalSales, isLoading, periodLabel }: TopSellingTableProps) {
    const topShare = items.length ? percentOf(items[0].revenue, totalSales) : 0;
    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Top sellers</CardTitle>
                <CardDescription>{periodLabel} · by revenue</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-2">
                {isLoading ? (
                    <div className="space-y-2 px-6 pb-4" role="status" aria-label="Loading top sellers">
                        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                    </div>
                ) : items.length === 0 ? (
                    <p className="mx-6 mb-4 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">No sales in this period</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">Top selling products, highest revenue first</caption>
                            <thead>
                                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                    <th scope="col" className="w-10 py-2 pl-6 text-left font-medium">#</th>
                                    <th scope="col" className="py-2 text-left font-medium">Product</th>
                                    <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">Sold</th>
                                    <th scope="col" className="py-2 pr-6 text-right font-medium sm:pr-0">Revenue</th>
                                    <th scope="col" className="hidden py-2 pl-4 pr-6 text-right font-medium sm:table-cell">Share</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.map((item, i) => {
                                    const share = percentOf(item.revenue, totalSales);
                                    const linkable = item.productId && item.productId !== 'custom';
                                    return (
                                        <tr key={`${item.productId ?? item.name}-${i}`} className="hover:bg-muted/40">
                                            <td className="py-2.5 pl-6 tabular-nums text-muted-foreground">{i + 1}</td>
                                            <td className="max-w-[10rem] py-2.5 sm:max-w-[16rem]">
                                                {linkable ? (
                                                    <Link href={`/dashboard/inventory/${item.productId}`} className="block truncate rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={item.name}>{item.name}</Link>
                                                ) : (
                                                    <span className="block truncate font-medium" title={item.name}>{item.name}</span>
                                                )}
                                            </td>
                                            <td className="hidden whitespace-nowrap py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{describeQty(item.qty, item.qtyLoose)}</td>
                                            <td className="whitespace-nowrap py-2.5 pr-6 text-right font-medium tabular-nums sm:pr-0">
                                                {rupees(item.revenue)}
                                                {/* on a phone the quantity sits under the amount (the Sold column is hidden) */}
                                                <span className="block text-xs font-normal text-muted-foreground sm:hidden">{describeQty(item.qty, item.qtyLoose)}</span>
                                            </td>
                                            <td className="hidden whitespace-nowrap py-2.5 pl-4 pr-6 text-right sm:table-cell">
                                                <span className="inline-flex items-center gap-2">
                                                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                                        {/* bars are scaled to the best seller so they read; the figure beside them is the true share */}
                                                        <span className="block h-full rounded-full bg-primary" style={{ width: `${topShare > 0 ? (share / topShare) * 100 : 0}%` }} />
                                                    </span>
                                                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{share}%</span>
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
