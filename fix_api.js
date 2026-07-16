const fs = require('fs');
const file = 'apps/frontend/lib/apiClient.ts';
let content = fs.readFileSync(file, 'utf8');
const search = `export async function assertOk(response: Response): Promise<void> {
    if (response.ok) return;
    if (response.status === 401) handle401();
    throw await response.json().catch(() => ({ detail: \`HTTP \${response.status}\` }));
}`;
const replace = `export async function assertOk(response: Response): Promise<void> {
    if (response.ok) return;
    if (response.status === 401) handle401();
    
    let errorData;
    const text = await response.text();
    try {
        errorData = JSON.parse(text);
    } catch (e) {
        console.error(JSON.stringify({
            event: "API_ERROR",
            type: "NON_JSON_RESPONSE",
            status: response.status,
            url: response.url,
            bodySnippet: text.substring(0, 200)
        }));

        let message = \`Server error (HTTP \${response.status}).\`;
        if (response.status === 502) {
            message = 'Server is currently unreachable (502 Bad Gateway). Please try again later.';
        } else if (response.status === 503) {
            message = 'Server is temporarily unavailable (503 Service Unavailable). Please try again later.';
        } else if (response.status === 504) {
            message = 'Server request timed out (504 Gateway Timeout). Please try again later.';
        }

        throw { detail: message, status: response.status, isHtmlError: true };
    }

    throw errorData;
}`;
if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync(file, content);
    console.log('Replaced assertOk');
} else {
    console.log('Could not find search string');
}
