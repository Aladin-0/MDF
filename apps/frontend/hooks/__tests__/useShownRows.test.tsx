import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useShownRows } from '@/hooks/useShownRows';
import { ShowMoreRows } from '@/components/reports/ShowMoreRows';

function Report({ rows }: { rows: number[] }) {
    const { shown, total, showMore } = useShownRows(rows, 200);
    const sum = rows.reduce((a, b) => a + b, 0);              // a total over EVERY row, like the report footers
    return (
        <div>
            <ul>{shown.map((r) => <li key={r}>row {r}</li>)}</ul>
            <p>total {sum}</p>
            <ShowMoreRows shown={shown.length} total={total} step={200} onShowMore={showMore} />
        </div>
    );
}

const range = (n: number, from = 1) => Array.from({ length: n }, (_, i) => i + from);

it('draws 200 rows at first, more on request, and the total always counts every row', () => {
    render(<Report rows={range(450)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(200);
    expect(screen.getByText('total 101475')).toBeInTheDocument();
    expect(screen.getByText(/Showing 200 of 450 rows/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 200 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(400);
    fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(450);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();     // everything shown: no button
});

it('a short list shows everything and no button', () => {
    render(<Report rows={range(12)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('a new list (another date range) starts again from the top', () => {
    const { rerender } = render(<Report rows={range(450)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show 200 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(400);
    act(() => { rerender(<Report rows={range(300, 1000)} />); });
    expect(screen.getAllByRole('listitem')).toHaveLength(200);
    expect(screen.getByText('row 1000')).toBeInTheDocument();
});
