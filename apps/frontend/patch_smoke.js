const fs = require('fs');
const file = 'tests/e2e/smoke-modify.spec.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  "    // Check available buttons on Modify Options Page",
  `    const optsRes = await page.request.get(\`http://localhost:8000/api/v1/sales/\${createdInvoiceId}/modification-options/?outletId=1\`, {
      headers: {
        'Authorization': \`Bearer \${await page.evaluate(() => localStorage.getItem('token'))}\`
      }
    });
    console.log("MODIFICATION OPTIONS:", await optsRes.json());
    
    // Check available buttons on Modify Options Page`
);
code = code.replace(
  `    const correctionBtn = page.locator('button').filter({ hasText: /Revise|Correction|Revision/ }).first();`,
  `    const correctionBtn = page.locator('button').filter({ hasText: /Revise|Correction|Revision|Modify/i }).first();`
);
fs.writeFileSync(file, code);
