'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Delete, Calculator } from 'lucide-react';

interface CalculatorProps {
    onClose: () => void;
    /** If provided, clicking "Use" sends result to parent */
    onUseResult?: (value: number) => void;
}

type BtnType = 'number' | 'operator' | 'action' | 'equals' | 'zero' | 'dot' | 'percent';

interface CalcButton {
    label: string;
    type: BtnType;
    value?: string;
}

const BUTTONS: CalcButton[][] = [
    [
        { label: 'AC', type: 'action', value: 'clear' },
        { label: '+/−', type: 'action', value: 'negate' },
        { label: '%', type: 'percent' },
        { label: '÷', type: 'operator', value: '/' },
    ],
    [
        { label: '7', type: 'number' },
        { label: '8', type: 'number' },
        { label: '9', type: 'number' },
        { label: '×', type: 'operator', value: '*' },
    ],
    [
        { label: '4', type: 'number' },
        { label: '5', type: 'number' },
        { label: '6', type: 'number' },
        { label: '−', type: 'operator', value: '-' },
    ],
    [
        { label: '1', type: 'number' },
        { label: '2', type: 'number' },
        { label: '3', type: 'number' },
        { label: '+', type: 'operator', value: '+' },
    ],
    [
        { label: '0', type: 'zero' },
        { label: '.', type: 'dot' },
        { label: '=', type: 'equals' },
    ],
];

function safeEval(expression: string): number | null {
    try {
        // Replace display chars with JS operators
        const clean = expression
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/−/g, '-');
        // Validate: only allow digits, operators, dots, parens, spaces
        if (!/^[\d+\-*/.() ]+$/.test(clean)) return null;
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + clean + ')')() as number;
        if (!isFinite(result) || isNaN(result)) return null;
        return result;
    } catch {
        return null;
    }
}

export function CalculatorWidget({ onClose, onUseResult }: CalculatorProps) {
    // expression = what we're building, e.g. "123 + 45"
    const [expression, setExpression] = useState('0');
    // display = the "current entry" sub-portion shown big
    const [display, setDisplay] = useState('0');
    // result shown under display when expression is mid-way
    const [liveResult, setLiveResult] = useState<string>('');
    // track if last action was '='
    const [justEvaled, setJustEvaled] = useState(false);
    // history of calculations
    const [history, setHistory] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    /* ── Live result preview ─────────────────────────────── */
    useEffect(() => {
        const val = safeEval(expression);
        if (val !== null && expression !== display) {
            setLiveResult(
                val % 1 === 0
                    ? val.toLocaleString('en-IN')
                    : parseFloat(val.toFixed(10)).toLocaleString('en-IN')
            );
        } else {
            setLiveResult('');
        }
    }, [expression, display]);

    /* ── Core logic ──────────────────────────────────────── */
    const processKey = useCallback((key: string) => {
        setExpression(prev => {
            let next = prev;

            if (key === 'clear') {
                setDisplay('0');
                setLiveResult('');
                setJustEvaled(false);
                return '0';
            }

            if (key === 'backspace') {
                if (justEvaled) {
                    setDisplay('0');
                    setJustEvaled(false);
                    return '0';
                }
                const trimmed = prev.length > 1 ? prev.slice(0, -1) : '0';
                // strip trailing space+operator+space
                const cleaned = trimmed.replace(/\s[+\-*/]\s?$/, '').trimEnd() || '0';
                setDisplay(cleaned.split(/[\s+\-*/]+/).pop() || '0');
                return cleaned;
            }

            if (key === 'negate') {
                const parts = prev.split(/(\s[+\-×÷*/]\s)/);
                const lastPart = parts[parts.length - 1];
                const negated = lastPart.startsWith('-')
                    ? lastPart.slice(1)
                    : '-' + lastPart;
                parts[parts.length - 1] = negated;
                const result = parts.join('');
                setDisplay(negated);
                return result;
            }

            if (key === '%') {
                const val = safeEval(prev);
                if (val !== null) {
                    const pct = parseFloat((val / 100).toFixed(10)).toString();
                    setDisplay(pct);
                    setJustEvaled(true);
                    return pct;
                }
                return prev;
            }

            if (key === '=') {
                const val = safeEval(prev);
                if (val !== null) {
                    const formatted = parseFloat(val.toFixed(10)).toString();
                    setHistory(h => [`${prev} = ${formatted}`, ...h].slice(0, 10));
                    setDisplay(formatted);
                    setLiveResult('');
                    setJustEvaled(true);
                    return formatted;
                }
                return prev;
            }

            // operators
            if (['+', '-', '*', '/'].includes(key)) {
                setJustEvaled(false);
                // replace trailing operator
                const trimmed = prev.replace(/\s[+\-*/]\s*$/, '');
                const sym = key === '*' ? '×' : key === '/' ? '÷' : key === '-' ? '−' : key;
                next = `${trimmed} ${sym} `;
                setDisplay('0');
                return next;
            }

            // digits
            if (justEvaled) {
                setJustEvaled(false);
                setDisplay(key);
                return key;
            }

            // append digit/dot
            const lastToken = prev.split(/[\s+\-×÷*/]+/).pop() || '';
            if (key === '.' && lastToken.includes('.')) return prev;
            const newToken = lastToken === '0' && key !== '.' ? key : lastToken + key;
            const base = prev.slice(0, prev.length - lastToken.length);
            next = base + newToken;
            setDisplay(newToken);
            return next;
        });
    }, [justEvaled]);

    /* ── Keyboard support ────────────────────────────────── */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Always handle keys when calculator is open
            if (e.key >= '0' && e.key <= '9') { e.preventDefault(); processKey(e.key); }
            else if (e.key === '.') { e.preventDefault(); processKey('.'); }
            else if (e.key === '+') { e.preventDefault(); processKey('+'); }
            else if (e.key === '-') { e.preventDefault(); processKey('-'); }
            else if (e.key === '*') { e.preventDefault(); processKey('*'); }
            else if (e.key === '/') { e.preventDefault(); processKey('/'); }
            else if (e.key === '%') { e.preventDefault(); processKey('%'); }
            else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); processKey('='); }
            else if (e.key === 'Backspace') { e.preventDefault(); processKey('backspace'); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key === 'Delete') { e.preventDefault(); processKey('clear'); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [processKey, onClose]);

    /* ── Button click handler ────────────────────────────── */
    const handleBtn = (btn: CalcButton) => {
        if (btn.type === 'action') { processKey(btn.value!); return; }
        if (btn.type === 'operator') { processKey(btn.value!); return; }
        if (btn.type === 'equals') { processKey('='); return; }
        if (btn.type === 'percent') { processKey('%'); return; }
        processKey(btn.label); // digits, dot, zero
    };

    /* ── Current numeric value ───────────────────────────── */
    const currentValue = safeEval(expression);

    /* ── Display value formatting ────────────────────────── */
    const displayFormatted = (() => {
        const n = parseFloat(display);
        if (isNaN(n)) return display;
        const hasDot = display.endsWith('.');
        const decimals = display.includes('.') ? display.split('.')[1]?.length || 0 : 0;
        return n.toLocaleString('en-IN', {
            minimumFractionDigits: hasDot ? 1 : decimals,
            maximumFractionDigits: Math.max(decimals, 0),
        });
    })();

    /* ── Font sizing for long numbers ────────────────────── */
    const fontSize =
        display.length > 14 ? 'text-2xl' :
        display.length > 10 ? 'text-3xl' :
        display.length > 7  ? 'text-4xl' :
                               'text-5xl';

    /* ── Button style ────────────────────────────────────── */
    const btnClass = (type: BtnType) => {
        const base = 'flex items-center justify-center rounded-2xl font-medium text-xl select-none transition-all duration-75 active:scale-95 cursor-pointer h-14 ';
        if (type === 'action')   return base + 'bg-slate-200/80 text-slate-700 hover:bg-slate-300/80 text-base';
        if (type === 'operator') return base + 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm shadow-blue-200';
        if (type === 'equals')   return base + 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm shadow-blue-200';
        if (type === 'percent')  return base + 'bg-slate-200/80 text-slate-700 hover:bg-slate-300/80 text-base';
        return base + 'bg-white text-slate-800 hover:bg-slate-100 shadow-sm shadow-slate-100';
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
        >
            {/* Backdrop — z-0, behind the panel */}
            <div
                className="absolute inset-0 z-0 bg-black/40 backdrop-blur-[2px]"
                onClick={onClose}
            />

            {/* Panel — z-10, above the backdrop so buttons receive clicks */}
            <div
                className="relative z-10 w-full sm:w-[340px] bg-[#f0f0f3] rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/30 overflow-hidden"
                style={{ animation: 'calcSlideIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}
                onClick={(e) => e.stopPropagation()}
            >
                <style>{`
                    @keyframes calcSlideIn {
                        from { opacity: 0; transform: translateY(40px) scale(0.96); }
                        to   { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div className="flex items-center gap-2 text-slate-500">
                        <Calculator className="w-4 h-4" />
                        <span className="text-sm font-semibold tracking-wide uppercase">Calculator</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-300 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Display */}
                <div className="px-5 pt-1 pb-3 min-h-[110px] flex flex-col items-end justify-end">
                    {/* Expression (small top line) */}
                    <div className="text-slate-400 text-sm font-medium tracking-wide h-5 text-right w-full truncate">
                        {expression !== display ? expression : ''}
                    </div>

                    {/* Main number (big) */}
                    <div
                        className={`${fontSize} font-light text-slate-900 text-right w-full leading-none mt-1 transition-all duration-75 tracking-tight`}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                        {displayFormatted}
                    </div>

                    {/* Live result preview */}
                    <div className="h-5 text-right w-full">
                        {liveResult && (
                            <span className="text-sm text-blue-500 font-medium">= {liveResult}</span>
                        )}
                    </div>
                </div>

                {/* History strip */}
                {history.length > 0 && (
                    <div className="px-5 pb-2">
                        <div className="text-[10px] text-slate-400 truncate">{history[0]}</div>
                    </div>
                )}

                {/* Backspace row */}
                <div className="flex justify-end px-5 pb-1">
                    <button
                        onClick={() => processKey('backspace')}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1 px-2 rounded-lg hover:bg-slate-200/50"
                    >
                        <Delete className="w-3.5 h-3.5" />
                        <span>backspace</span>
                    </button>
                </div>

                {/* Buttons grid */}
                <div className="px-4 pb-4 space-y-2.5">
                    {BUTTONS.map((row, ri) => (
                        <div
                            key={ri}
                            className={`grid gap-2.5 ${ri === 4 ? 'grid-cols-[2fr_1fr_1fr]' : 'grid-cols-4'}`}
                        >
                            {row.map((btn) => (
                                <button
                                    key={btn.label}
                                    type="button"
                                    onClick={() => handleBtn(btn)}
                                    className={btnClass(btn.type)}
                                >
                                    {btn.label === '÷' ? '÷' :
                                     btn.label === '×' ? '×' :
                                     btn.label === '−' ? '−' :
                                     btn.label}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Use Result button */}
                {onUseResult && currentValue !== null && (
                    <div className="px-4 pb-5">
                        <button
                            onClick={() => { onUseResult(parseFloat(currentValue.toFixed(2))); onClose(); }}
                            className="w-full h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-200 hover:from-blue-700 hover:to-blue-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            Use ₹{parseFloat(currentValue.toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
