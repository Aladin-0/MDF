/**
 * Shrink a phone photo before upload: long side capped (default 2400px),
 * re-encoded as JPEG. A 3–4 MB camera photo becomes ~300–500 KB, so it uploads
 * in about a second on mobile data. The server straightens and resizes again,
 * so this only saves bandwidth — it never makes the scan less accurate.
 * Any failure (old browser, unusual format) returns the original file.
 */
export async function compressImage(file: File, maxSide = 2400, quality = 0.85): Promise<File> {
    try {
        if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        if (scale === 1 && file.size < 1_500_000) {
            bitmap.close?.();
            return file;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close?.();
            return file;
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'bill'}.jpg`, { type: 'image/jpeg' });
    } catch {
        return file;
    }
}
