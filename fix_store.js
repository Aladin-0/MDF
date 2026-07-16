const fs = require('fs');

function replaceFile(path, regex, replacement) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(regex, replacement);
    fs.writeFileSync(path, content);
}

// Fix BillingStore.ts to make draftId optional to keep legacy code working, but explicitly use it if provided.
let storePath = 'apps/frontend/store/billingStore.ts';
let store = fs.readFileSync(storePath, 'utf8');

store = store.replace(/addToCart: \(draftId: string, item: CartItem\) => void;/g, 
                      "addToCart: (draftId: string | null, item: CartItem) => void;");
store = store.replace(/removeFromCart: \(draftId: string, batchId: string\) => void;/g,
                      "removeFromCart: (draftId: string | null, batchId: string) => void;");
store = store.replace(/updateCartItem: \(draftId: string, batchId: string, updates: Partial<CartItem>\) => void;/g,
                      "updateCartItem: (draftId: string | null, batchId: string, updates: Partial<CartItem>) => void;");
store = store.replace(/applyDiscountToItem: \(draftId: string, batchId: string, pct: number\) => void;/g,
                      "applyDiscountToItem: (draftId: string | null, batchId: string, pct: number) => void;");
store = store.replace(/clearCart: \(draftId: string\) => void;/g,
                      "clearCart: (draftId?: string | null) => void;");

// Update implementations
store = store.replace(/addToCart: \(draftId, item\) => set\(\(state\) => \{/g, 
                      "addToCart: (draftId, item) => set((state) => {\n        draftId = draftId || state.activeDraftId;");
store = store.replace(/removeFromCart: \(draftId, batchId\) => set\(\(state\) => \{/g,
                      "removeFromCart: (draftId, batchId) => set((state) => {\n        draftId = draftId || state.activeDraftId;");
store = store.replace(/updateCartItem: \(draftId, batchId, updates\) => set\(\(state\) => \{/g,
                      "updateCartItem: (draftId, batchId, updates) => set((state) => {\n        draftId = draftId || state.activeDraftId;");
store = store.replace(/applyDiscountToItem: \(draftId, batchId, discountPct\) => set\(\(state\) => \{/g,
                      "applyDiscountToItem: (draftId, batchId, discountPct) => set((state) => {\n        draftId = draftId || state.activeDraftId;");
store = store.replace(/clearCart: \(draftId\) => set\(\(state\) => \{/g,
                      "clearCart: (draftId) => set((state) => {\n        draftId = draftId || state.activeDraftId;");

fs.writeFileSync(storePath, store);
console.log("Updated billingStore.ts signatures");
