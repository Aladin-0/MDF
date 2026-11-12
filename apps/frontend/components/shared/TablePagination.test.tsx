import { pageWindow } from './TablePagination';

describe('pageWindow', () => {
    it('shows every page when there are few', () => {
        expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    });
    it('keeps first, last and the neighbours of the current page, with gaps', () => {
        expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
        expect(pageWindow(1, 20)).toEqual([1, 2, 'gap', 20]);
        expect(pageWindow(20, 20)).toEqual([1, 'gap', 19, 20]);
        expect(pageWindow(2, 20)).toEqual([1, 2, 3, 'gap', 20]);
    });
});
