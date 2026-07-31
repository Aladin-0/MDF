import re

with open('apps/frontend/hooks/useReports.ts', 'r') as f:
    content = f.read()

mutations = """
export function useLockGSTReport() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ outletId, payload }: { outletId: string, payload: { reportType: 'GSTR1' | 'GSTR3B', from: string, to: string, reason?: string } }) =>
            reportsApi.lockGSTReport(outletId, payload),
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['reports', 'gst', variables.payload.reportType] });
        }
    });
}

export function useUnlockGSTReport() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ outletId, payload }: { outletId: string, payload: { reportType: 'GSTR1' | 'GSTR3B', from: string, to: string, reason: string } }) =>
            reportsApi.unlockGSTReport(outletId, payload),
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['reports', 'gst', variables.payload.reportType] });
        }
    });
}
"""

content = content + "\n" + mutations

with open('apps/frontend/hooks/useReports.ts', 'w') as f:
    f.write(content)
