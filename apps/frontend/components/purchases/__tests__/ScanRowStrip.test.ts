import { rowStripStyle, stripWindow } from '../ScanRowStrip';

describe('rowStripStyle', () => {
    it('crops a full-width row with a little context above and below', () => {
        const st = rowStripStyle('/p.jpg', [400, 0, 430, 1000], [2000, 1000], 15);
        // row spans 385..445 of 1000 (60/1000 tall), full width
        expect(st.backgroundSize).toBe(`${100 / 1}% ${100 / 0.06}%`);
        expect(st.backgroundPosition).toBe(`0% ${(0.385 / (1 - 0.06)) * 100}%`);
        expect(Number(st.aspectRatio)).toBeCloseTo((1 * 2000) / (0.06 * 1000));
        expect(st.backgroundImage).toBe('url("/p.jpg")');
    });

    it('keeps the padding inside the page at the edges', () => {
        const st = rowStripStyle('/p.jpg', [0, 100, 20, 900], [1000, 1000], 15);
        expect(String(st.backgroundPosition).endsWith(' 0%')).toBe(true);
    });
});


describe('stripWindow', () => {
    it('shows about one printed line of context above and below by default', () => {
        expect(stripWindow([400, 0, 430, 1000])).toEqual({ top: 370, bottom: 460 });
        expect(stripWindow([10, 0, 30, 1000])).toEqual({ top: 0, bottom: 60 });
    });
});
