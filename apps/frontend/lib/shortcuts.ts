export type ShortcutScope = 'global' | 'route' | 'modal' | 'widget';

export const DISABLE_DISRUPTIVE_SHORTCUTS = true; // Temporary kill switch for conflicting shortcuts

export interface ShortcutDefinition {
    id: string;
    combo?: string; // e.g., 'Alt+1', 'Ctrl+S', '/'
    sequence?: string; // e.g., 'g d'
    scope: ShortcutScope;
    description: string;
    allowInInput?: boolean;
    handler: (e: KeyboardEvent) => void;
}

// Robust check to prevent shortcuts when typing
export function isEditableElement(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    
    // Form inputs
    const isInputNode = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    
    // Content editable
    const isContentEditable = el.isContentEditable;
    
    // ARIA roles that indicate text entry
    const role = el.getAttribute?.('role') || null;
    const isTextRole = role === 'textbox' || role === 'searchbox' || role === 'combobox';
    
    // Type check for inputs to exclude checkboxes/radios if desired
    const isNonTextNode = el.tagName === 'INPUT' && ['checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes((el as HTMLInputElement).type);
    
    return (isInputNode && !isNonTextNode) || isContentEditable || isTextRole;
}

// Simple pub/sub registry
class ShortcutRegistry {
    private shortcuts: Map<string, ShortcutDefinition> = new Map();
    private activeScopes: Set<ShortcutScope> = new Set<ShortcutScope>(['global', 'route']);
    
    // Sequence state
    private keyBuffer: string[] = [];
    private keyBufferTimeout: NodeJS.Timeout | null = null;
    private readonly SEQUENCE_TIMEOUT_MS = 800; // time allowed between keypresses in a sequence

    register(shortcut: ShortcutDefinition) {
        this.shortcuts.set(shortcut.id, shortcut);
    }

    unregister(id: string) {
        this.shortcuts.delete(id);
    }

    setActiveScopes(scopes: ShortcutScope[]) {
        this.activeScopes = new Set(scopes);
    }

    addScope(scope: ShortcutScope) {
        this.activeScopes.add(scope);
    }

    removeScope(scope: ShortcutScope) {
        this.activeScopes.delete(scope);
    }

    getAllShortcuts() {
        return Array.from(this.shortcuts.values());
    }

    handleKeydown(e: KeyboardEvent) {
        if (!e || typeof e.key !== 'string') return; // Safe guard against synthetic/malformed events

        const isInput = isEditableElement(e.target);

        // Normalize combo string (e.g., 'Alt+1')
        const keyParts = [];
        if (e.ctrlKey) keyParts.push('Ctrl');
        if (e.shiftKey) keyParts.push('Shift');
        if (e.altKey) keyParts.push('Alt');
        if (e.metaKey) keyParts.push('Meta');
        
        const rawKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            keyParts.push(rawKey);
        }
        const comboString = keyParts.join('+');

        // Manage sequence buffer (only for single keys, no modifiers)
        if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
            this.keyBuffer.push(rawKey);
            
            if (this.keyBufferTimeout) clearTimeout(this.keyBufferTimeout);
            this.keyBufferTimeout = setTimeout(() => {
                this.keyBuffer = [];
            }, this.SEQUENCE_TIMEOUT_MS);
        } else {
            // Modifiers break sequences usually
            this.keyBuffer = [];
        }

        const currentSequence = this.keyBuffer.join(' ');

        // Priority: widget > modal > route > global
        const scopePriority: Record<ShortcutScope, number> = {
            widget: 4,
            modal: 3,
            route: 2,
            global: 1
        };

        const matches = Array.from(this.shortcuts.values()).filter(s => {
            if (!this.activeScopes.has(s.scope)) return false;
            const comboMatch = s.combo === comboString && (isInput ? !!s.allowInInput : true);

            // If the kill switch is on, disable sequence shortcuts completely
            if (DISABLE_DISRUPTIVE_SHORTCUTS && s.sequence) return false;

            const sequenceMatch = s.sequence && currentSequence.endsWith(s.sequence) && (isInput ? !!s.allowInInput : true);
            
            return comboMatch || sequenceMatch;
        });

        if (matches.length > 0) {
            // Sort by highest priority
            matches.sort((a, b) => scopePriority[b.scope] - scopePriority[a.scope]);
            const bestMatch = matches[0];
            
            e.preventDefault();
            
            // Clear sequence buffer so we don't double trigger
            this.keyBuffer = [];
            if (this.keyBufferTimeout) clearTimeout(this.keyBufferTimeout);

            bestMatch.handler(e);
        }
    }
}

export const shortcutRegistry = new ShortcutRegistry();

if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => shortcutRegistry.handleKeydown(e), true);
}
