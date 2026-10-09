import { useEffect } from 'react';

export function useMagicSubmit(
    ref: React.RefObject<HTMLElement> | null,
    callback: () => void,
    enabled: boolean = true
) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!enabled) return;
            
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                if (!ref || !ref.current || ref.current.contains(e.target as Node)) {
                    e.preventDefault();
                    e.stopPropagation();
                    callback();
                }
            }
        };

        const target = ref?.current || document;
        target.addEventListener('keydown', handleKeyDown as any);

        return () => {
            target.removeEventListener('keydown', handleKeyDown as any);
        };
    }, [ref, callback, enabled]);
}
