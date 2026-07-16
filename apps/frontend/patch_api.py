import re

with open('lib/apiClient.ts', 'r') as f:
    content = f.read()

# Fix ProductSearchResult
content = re.sub(
    r'return \{\s*\.\.\.data,\s*hasStock:\s*data\.hasStock \?\? false,\s*totalQtyStrips:\s*data\.totalQtyStrips \?\? 0,\s*totalQtyLoose:\s*data\.totalQtyLoose \?\? 0,\s*batches:\s*data\.batches \?\? \[\]\s*\};',
    r'''return {
            ...data,
            hasStock: data.hasStock ?? false,
            totalQtyStrips: data.totalQtyStrips ?? 0,
            totalQtyLoose: data.totalQtyLoose ?? 0,
            batches: data.batches ?? []
        };''',
    content
)

content = re.sub(
    r'(getByBarcode: async \(barcode: string\): Promise<ProductSearchResult \| null> => \{.*?return \{.*?)\.\.\.data,\s*\};',
    r'''\1...data,
            hasStock: data.hasStock ?? false,
            totalQtyStrips: data.totalQtyStrips ?? 0,
            totalQtyLoose: data.totalQtyLoose ?? 0,
            batches: data.batches ?? []
        };''',
    content,
    flags=re.DOTALL
)

# Fix reports API
content = content.replace(
    '''    getTaxReport: async (outletId: string, filters: any): Promise<any> => {
        const searchParams = new URLSearchParams({ outletId });
        if (filters.from) searchParams.append('from', filters.from);
        if (filters.to) searchParams.append('to', filters.to);
        const response = await fetch(`${API_URL}/reports/tax/?${searchParams.toString()}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getBatchReport: async (outletId: string, filters: any): Promise<any> => {
        const searchParams = new URLSearchParams({ outletId });
        if (filters.from) searchParams.append('from', filters.from);
        if (filters.to) searchParams.append('to', filters.to);
        const response = await fetch(`${API_URL}/reports/batch-wise/?${searchParams.toString()}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    }''',
    ''
)

reports_code = '''    getTaxReport: async (outletId: string, filters: any): Promise<any> => {
        const searchParams = new URLSearchParams({ outletId });
        if (filters.from) searchParams.append('from', filters.from);
        if (filters.to) searchParams.append('to', filters.to);
        const response = await fetch(`${API_URL}/reports/tax/?${searchParams.toString()}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getBatchReport: async (outletId: string, filters: any): Promise<any> => {
        const searchParams = new URLSearchParams({ outletId });
        if (filters.from) searchParams.append('from', filters.from);
        if (filters.to) searchParams.append('to', filters.to);
        const response = await fetch(`${API_URL}/reports/batch-wise/?${searchParams.toString()}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    }
};'''
content = content.replace('};', '};\n').replace('};\n\nconst realReportsApi = {\n', '};')
content = re.sub(r'const realReportsApi = \{.*?(?=};\n)', r'\g<0>,\n' + reports_code, content, flags=re.DOTALL)


audit_code = '''export const auditApi = {
    getLogs: async (params?: any, signal?: AbortSignal): Promise<any> => {
        const searchParams = new URLSearchParams(params || {});
        const response = await fetch(`${API_URL}/audit/?${searchParams.toString()}`, { headers: getHeaders(), signal });
        await assertOk(response);
        return response.json();
    },
    exportLogs: async (params?: any): Promise<void> => {
        const searchParams = new URLSearchParams(params || {});
        const response = await fetch(`${API_URL}/audit/export/?${searchParams.toString()}`, { headers: getHeaders() });
        await assertOk(response);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }
};'''

content = re.sub(r'export const auditApi = \{.*?\n\};\n', audit_code + '\n', content, flags=re.DOTALL)

with open('lib/apiClient.ts', 'w') as f:
    f.write(content)

print("done")
