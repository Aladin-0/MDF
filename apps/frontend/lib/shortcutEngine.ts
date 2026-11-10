/**
 * Pure helpers for the keyboard-shortcut system (no React, no DOM side effects).
 * The registry lives in `config/shortcuts.ts`; the listener lives in
 * `components/shared/GlobalShortcuts.tsx`. Keeping the matching logic here makes it unit-testable.
 *
 * Key notation used everywhere ("steps"):
 *   - modifiers in a fixed order: Ctrl+Alt+Shift+Meta, then the key:  'Alt+N', 'Alt+Shift+1', 'Ctrl+Enter'
 *   - letters are upper-case, F-keys are 'F4', special keys are 'Enter' 'Esc' 'Tab' '[' ']' '/' ...
 *   - a SEQUENCE is an array of steps: ['Alt+G', 'S', 'I'] = press Alt+G, then S, then I.
 *
 * Events are converted from `event.code` (physical key), NOT `event.key`, so shortcuts behave the
 * same on every keyboard layout and Alt+Shift+1 is not turned into a symbol.
 */
import type { ShortcutDef, ShortcutScope } from '@/config/shortcuts';
import { BROWSER_RESERVED, SCOPE_ROUTES, SHORTCUTS } from '@/config/shortcuts';

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
type Mod = (typeof MOD_ORDER)[number];

const MOD_ALIASES: Record<string, Mod> = {
    ctrl: 'Ctrl', control: 'Ctrl',
    alt: 'Alt', option: 'Alt',
    shift: 'Shift',
    meta: 'Meta', cmd: 'Meta', command: 'Meta', win: 'Meta',
};

const CODE_TO_KEY: Record<string, string> = {
    BracketLeft: '[', BracketRight: ']', Slash: '/', Comma: ',', Period: '.', Semicolon: ';',
    Quote: "'", Backquote: '`', Minus: '-', Equal: '=', Backslash: '\\',
    Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Space: 'Space', Tab: 'Tab',
    PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End',
    ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
    Backspace: 'Backspace', Delete: 'Delete',
};

/** 'KeyG' -> 'G', 'Digit1' -> '1', 'F5' -> 'F5', 'BracketRight' -> ']' ; null when unsupported. */
export function codeToKey(code: string): string | null {
    let m = /^Key([A-Z])$/.exec(code);
    if (m) return m[1];
    m = /^Digit(\d)$/.exec(code);
    if (m) return m[1];
    m = /^F(\d{1,2})$/.exec(code);
    if (m) return `F${m[1]}`;
    return CODE_TO_KEY[code] ?? null;
}

const NAMED_KEYS = ['Enter', 'Tab', 'Space', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Left', 'Right', 'Up', 'Down'];

function canonKey(raw: string): string {
    if (raw.length === 1) return raw.toUpperCase();
    const lower = raw.toLowerCase();
    if (lower === 'escape' || lower === 'esc') return 'Esc';
    if (/^f\d{1,2}$/.test(lower)) return lower.toUpperCase();
    return NAMED_KEYS.find((k) => k.toLowerCase() === lower) ?? raw;
}

/** Canonicalise a step written in the registry (e.g. 'alt+n', 'Shift+Alt+1') to 'Alt+N', 'Alt+Shift+1'. */
export function canonStep(raw: string): string {
    const parts = raw.split('+');
    // A trailing empty part means the key itself was '+', which we do not use as a shortcut key.
    const key = canonKey(parts[parts.length - 1]);
    const mods = new Set<Mod>();
    for (const p of parts.slice(0, -1)) {
        const m = MOD_ALIASES[p.trim().toLowerCase()];
        if (m) mods.add(m);
    }
    return [...MOD_ORDER.filter((m) => mods.has(m)), key].join('+');
}

export interface KeyEventLike {
    code: string;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    getModifierState?: (key: string) => boolean;
}

/**
 * Convert a keyboard event into a canonical step, or null when it must be ignored
 * (bare modifier press, unsupported key, or AltGr — typing a character on layouts that use AltGr).
 */
export function eventToStep(e: KeyEventLike): string | null {
    if (/^(Shift|Control|Alt|Meta|OS)(Left|Right)$/.test(e.code)) return null;
    // AltGr on Windows reports as Ctrl+Alt with AltGraph set: that is someone typing a character, not a shortcut.
    // (Do not drop every event with AltGraph set: some Linux key mappings leave it on for the ordinary Alt key.)
    if (e.ctrlKey && e.altKey && e.getModifierState?.('AltGraph')) return null;
    const key = codeToKey(e.code);
    if (!key) return null;
    const mods: Mod[] = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Meta');
    return [...mods, key].join('+');
}

/**
 * Second and later keys of a sequence are plain keys, but people naturally keep Alt held after
 * Alt+G, and many type the letters as capitals (holding Shift). Treat 'S', 'Alt+S', 'Shift+S' and
 * 'Alt+Shift+S' the same there. Ctrl or Meta cancels the sequence (null).
 */
export function stripAlt(step: string): string | null {
    const parts = step.split('+');
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    return mods.every((m) => m === 'Alt' || m === 'Shift') ? key : null;
}

/**
 * 'Alt+Shift+G' -> 'Alt+G' for letter keys, so the leader and billing chords still work when the
 * user holds Shift (capital letters). Only used when the exact step matches nothing, so the real
 * Alt+Shift+<digit> billing chords are unaffected.
 */
export function withoutShiftOnLetter(step: string): string | null {
    const m = /^Alt\+Shift\+([A-Z])$/.exec(step);
    return m ? `Alt+${m[1]}` : null;
}

export function canonKeys(keys: string[]): string[] {
    return keys.map(canonStep);
}

// ─── Scopes (where a shortcut is active) ─────────────────────────────────────

export function isScopeActive(scope: ShortcutScope, pathname: string): boolean {
    const route = SCOPE_ROUTES[scope];
    if (route === null) return true;
    return pathname === route || pathname.startsWith(route + '/');
}

/** Can two scopes be active on the same page at the same time? */
export function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
    const ra = SCOPE_ROUTES[a];
    const rb = SCOPE_ROUTES[b];
    if (ra === null || rb === null) return true;
    return ra === rb || ra.startsWith(rb + '/') || rb.startsWith(ra + '/');
}

// ─── Visibility (scope + permission) ────────────────────────────────────────

export interface ShortcutContext {
    pathname: string;
    hasPermission: (permission: string) => boolean;
    role?: string;
}

export function isShortcutAvailable(def: ShortcutDef, ctx: ShortcutContext): boolean {
    if (!isScopeActive(def.scope, ctx.pathname)) return false;
    if (def.superAdminOnly && ctx.role !== 'super_admin') return false;
    if (def.permission && !ctx.hasPermission(def.permission)) return false;
    return true;
}

// ─── Sequence matching ──────────────────────────────────────────────────────

export type MatchResult =
    | { kind: 'none' }
    | { kind: 'exact'; def: ShortcutDef }
    | { kind: 'pending'; steps: string[] };

/**
 * Given the steps typed so far and the next step, decide what happens.
 * `defs` must already be filtered to what is available on the current page.
 */
export function matchNext(defs: ShortcutDef[], typed: string[], step: string): MatchResult {
    const candidates = defs.filter(
        (d) =>
            d.keys.length > typed.length &&
            typed.every((s, i) => canonStep(d.keys[i]) === s) &&
            canonStep(d.keys[typed.length]) === step,
    );
    if (candidates.length === 0) return { kind: 'none' };
    const exact = candidates.find((d) => d.keys.length === typed.length + 1);
    if (exact) return { kind: 'exact', def: exact };
    return { kind: 'pending', steps: [...typed, step] };
}

export interface NextOption {
    key: string;
    label: string;
    /** true when pressing `key` runs something; false when it opens a deeper level */
    leaf: boolean;
    count: number;
}

/** What can be pressed next after `typed`? Used by the on-screen hint panel. */
export function nextOptions(defs: ShortcutDef[], typed: string[]): NextOption[] {
    const out = new Map<string, NextOption>();
    for (const d of defs) {
        if (d.keys.length <= typed.length) continue;
        if (!typed.every((s, i) => canonStep(d.keys[i]) === s)) continue;
        const key = canonStep(d.keys[typed.length]);
        const leaf = d.keys.length === typed.length + 1;
        const existing = out.get(key);
        if (!existing) {
            out.set(key, { key, label: leaf ? d.label : d.group, leaf, count: 1 });
        } else {
            existing.count += 1;
            existing.leaf = false;
            existing.label = d.group;
        }
    }
    return Array.from(out.values());
}

// ─── Display ────────────────────────────────────────────────────────────────

/** ['Alt+G','S','I'] -> [['Alt','G'],['S'],['I']] so the UI can draw one <kbd> per part. */
export function formatKeys(keys: string[]): string[][] {
    return keys.map((k) => canonStep(k).split('+'));
}

export function formatKeysText(keys: string[]): string {
    return keys.map((k) => canonStep(k)).join(' ');
}

// ─── Collision detection (used by the unit test and by dev tooling) ─────────

export interface ShortcutConflict {
    a: string;
    b: string;
    reason: string;
}

export function findConflicts(defs: ShortcutDef[]): ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = [];
    for (let i = 0; i < defs.length; i++) {
        for (let j = i + 1; j < defs.length; j++) {
            const a = defs[i];
            const b = defs[j];
            if (!scopesOverlap(a.scope, b.scope)) continue;
            const ka = canonKeys(a.keys);
            const kb = canonKeys(b.keys);
            const n = Math.min(ka.length, kb.length);
            const samePrefix = ka.slice(0, n).every((s, idx) => s === kb[idx]);
            if (!samePrefix) continue;
            conflicts.push({
                a: a.id,
                b: b.id,
                reason:
                    ka.length === kb.length
                        ? `identical keys "${ka.join(' ')}"`
                        : `"${(ka.length < kb.length ? ka : kb).join(' ')}" is a prefix of "${(ka.length < kb.length ? kb : ka).join(' ')}"`,
            });
        }
    }
    return conflicts;
}

/** Keys that open `href` via the Go leader, e.g. '/billing' -> 'Alt+G B'. Used for small hints in the nav. */
export function shortcutHintForHref(href: string): string | undefined {
    const def = SHORTCUTS.find((d) => d.action.type === 'navigate' && d.action.href === href);
    return def ? formatKeysText(def.keys) : undefined;
}

export function findReservedHit(step: string) {
    const s = canonStep(step);
    return BROWSER_RESERVED.find((r) => canonStep(r.combo) === s) ?? null;
}
