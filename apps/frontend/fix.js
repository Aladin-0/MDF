const fs = require('fs');

let content = fs.readFileSync('lib/apiClient.ts', 'utf8');

content = content.replace(
    'const API_URL =',
    'export const API_URL ='
);

content = content.replace(
    'function getStoredToken',
    'export function getStoredToken'
);

content = content.replace(
    'function getHeaders',
    'export function getHeaders'
);

content = content.replace(
    'async function assertOk',
    'export async function assertOk'
);

content = content.replace(
    'batches: [],\n        };\n    },\n',
    'batches: [],\n            hasStock: false,\n            totalQtyStrips: 0,\n            totalQtyLoose: 0,\n        };\n    },\n'
);

const salesMethods = `    listQuotations: async (outletId: string): Promise<any> => {
        const response = await fetch(\`\${API_URL}/quotations/?outletId=\${outletId}\`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    revise: async (id: string, payload: any): Promise<any> => {
        const response = await fetch(\`\${API_URL}/sales/\${id}/revise/\`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        const data = await response.json();
        return {
            ...data,
            items: data.items ?? data.sale_items ?? data.saleItems ?? [],
        };
    },
    // Quotations
    createQuotation: async (payload: any): Promise<any> => {
        const response = await fetch(\`\${API_URL}/quotations/\`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    updateQuotation: async (id: string, payload: any): Promise<any> => {
        const response = await fetch(\`\${API_URL}/quotations/\${id}/\`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    getQuotationById: async (id: string): Promise<any> => {
        const response = await fetch(\`\${API_URL}/quotations/\${id}/\`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    convertQuotation: async (id: string, paymentPayload: any): Promise<any> => {
        const response = await fetch(\`\${API_URL}/quotations/\${id}/convert/\`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(paymentPayload),
        });
        await assertOk(response);
        return response.json();
    }
};`;

content = content.replace(
    'getReturnPdf: async (id: string): Promise<any> => {\n        const response = await fetch(`${API_URL}/sales/returns/${id}/print/`, { headers: getHeaders() });\n        await assertOk(response);\n        return response.json();\n    }\n};',
    'getReturnPdf: async (id: string): Promise<any> => {\n        const response = await fetch(`${API_URL}/sales/returns/${id}/print/`, { headers: getHeaders() });\n        await assertOk(response);\n        return response.json();\n    },\n' + salesMethods
);


const reportMethods = `    getTaxReport: async (outletId: string, filters: any): Promise<any> => {
        const searchParams = new URLSearchParams({ outletId });
        if (filters.from) searchParams.append('from', filters.from);
        if (filters.to) searchParams.append('to', filters.to);
        const response = await fetch(\`\${API_URL}/reports/tax/?\${searchParams.toString()}\`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getBatchReport: async (outletId: string, filters: any): Promise<any> => {
        const searchParams = new URLSearchParams({ outletId });
        if (filters.from) searchParams.append('from', filters.from);
        if (filters.to) searchParams.append('to', filters.to);
        const response = await fetch(\`\${API_URL}/reports/batch-wise/?\${searchParams.toString()}\`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    }
};`;

content = content.replace(
    'getExpiryReport: async (outletId: string, filters?: any) => {\n        const response = await fetch(`${API_URL}/reports/expiry/?outletId=${outletId}`, { headers: getHeaders() });\n        await assertOk(response);\n        return response.json();\n    }\n};',
    'getExpiryReport: async (outletId: string, filters?: any) => {\n        const response = await fetch(`${API_URL}/reports/expiry/?outletId=${outletId}`, { headers: getHeaders() });\n        await assertOk(response);\n        return response.json();\n    },\n' + reportMethods
);


const auditMethod = `
export const auditApi = {
    getLogs: async (params?: any, signal?: AbortSignal): Promise<any> => {
        const searchParams = new URLSearchParams(params || {});
        const response = await fetch(\`\${API_URL}/audit/?\${searchParams.toString()}\`, { headers: getHeaders(), signal });
        await assertOk(response);
        return response.json();
    },
    exportLogs: async (params?: any): Promise<void> => {
        const searchParams = new URLSearchParams(params || {});
        const response = await fetch(\`\${API_URL}/audit/export/?\${searchParams.toString()}\`, { headers: getHeaders() });
        await assertOk(response);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = \`audit-logs-\${new Date().toISOString().split('T')[0]}.csv\`;
        a.click();
        window.URL.revokeObjectURL(url);
    }
};

export const authApi = realAuthApi;`;

content = content.replace(
    'export const authApi = realAuthApi;',
    auditMethod
);


fs.writeFileSync('lib/apiClient.ts', content);
