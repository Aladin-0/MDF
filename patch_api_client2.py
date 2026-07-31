import re

with open('apps/frontend/lib/apiClient.ts', 'r') as f:
    content = f.read()

lock_methods = """
    lockGSTReport: async (outletId: string, payload: { reportType: 'GSTR1' | 'GSTR3B', from: string, to: string, reason?: string }) => {
        const response = await fetch(`${API_URL}/reports/gst/lock/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ ...payload, outletId })
        });
        await assertOk(response);
        return response.json();
    },
    unlockGSTReport: async (outletId: string, payload: { reportType: 'GSTR1' | 'GSTR3B', from: string, to: string, reason: string }) => {
        const response = await fetch(`${API_URL}/reports/gst/unlock/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ ...payload, outletId })
        });
        await assertOk(response);
        return response.json();
    },
"""

content = content.replace("const realReportsApi = {", "const realReportsApi = {\n" + lock_methods)

with open('apps/frontend/lib/apiClient.ts', 'w') as f:
    f.write(content)
