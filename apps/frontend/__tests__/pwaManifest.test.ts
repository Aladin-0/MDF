import fs from 'fs';
import path from 'path';

/**
 * The installed web app (Add to Home screen) takes its screen orientation from the manifest. It used to say "landscape" in two manifests,
 * so a phone install opened sideways even when held upright. Phones need portrait, tablets and desktops landscape: "any" lets the device decide.
 */
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));

describe('web app manifest', () => {
    it('does not lock the screen orientation (a phone must be able to open upright)', () => {
        expect(manifest.orientation).toBe('any');
    });

    it('installs as a standalone app with icons', () => {
        expect(manifest.display).toBe('standalone');
        expect(manifest.icons.map((i: any) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
        for (const icon of manifest.icons) expect(fs.existsSync(path.join(root, 'public', icon.src))).toBe(true);
    });

    it('is the ONLY manifest: a second one (app/manifest.ts) served a conflicting copy that also locked landscape', () => {
        for (const f of ['app/manifest.ts', 'app/manifest.tsx', 'app/manifest.js', 'app/manifest.json']) {
            expect(fs.existsSync(path.join(root, f))).toBe(false);
        }
    });

    it('is linked from the layout once, through the metadata (no hand-written second link)', () => {
        const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
        expect(layout).toMatch(/manifest:\s*'\/manifest\.json'/);
        expect(layout).not.toMatch(/<link[^>]*rel="manifest"/);
    });
});
