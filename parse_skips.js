const fs = require('fs');
const path = require('path');
const glob = require('glob');

const testDir = path.join(__dirname, 'apps/frontend/tests/e2e');
const files = glob.sync('**/*.ts', { cwd: testDir });
const jsFiles = glob.sync('**/*.js', { cwd: testDir });
const allFiles = [...files, ...jsFiles];

let skipList = [];

for (const file of allFiles) {
    const fullPath = path.join(testDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    
    let currentTest = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Match test('name'...) or test.describe('name'...)
        const testMatch = line.match(/test(?:\.describe)?(?:\.skip)?\(['"`](.*?)['"`]/);
        if (testMatch) {
            currentTest = testMatch[1];
        }
        
        if (line.includes('test.skip(')) {
            // Find why it's skipped
            let reason = 'No explicit reason provided';
            const reasonMatch = line.match(/test\.skip\((.*)\)/);
            if (reasonMatch && reasonMatch[1]) {
                reason = reasonMatch[1].replace(/['"`]/g, '').trim();
            }
            
            // If it's a conditional skip, like `if (id === 'dummy') test.skip();`
            let isConditional = false;
            let condition = '';
            if (line.includes('if')) {
               const condMatch = line.match(/if\s*\((.*?)\)/);
               if (condMatch) {
                   isConditional = true;
                   condition = condMatch[1];
               }
            }
            // Check preceding line for comments
            let comment = '';
            if (i > 0 && lines[i-1].trim().startsWith('//')) {
                comment = lines[i-1].trim().substring(2).trim();
            }
            
            skipList.push({
                file,
                test: currentTest || 'Unknown context',
                reason: reason || comment || (isConditional ? `Conditional skip: ${condition}` : 'Explicit skip'),
                conditional: isConditional
            });
        }
    }
}

let report = `# Skipped Tests Inventory\n\n`;
report += `| File | Test/Context | Reason | Classification |\n`;
report += `|---|---|---|---|\n`;

for (const item of skipList) {
    let classification = 'Intentional Placeholder';
    if (item.file.includes('smoke2')) classification = 'Obsolete / Legacy Suite';
    if (item.conditional && item.reason.includes('dummy')) classification = 'Incomplete Feature (Dummy Data)';
    if (item.file.includes('modification-tracking')) classification = 'Incomplete Modification Tests';
    
    report += `| ${item.file} | ${item.test} | ${item.reason} | ${classification} |\n`;
}

fs.writeFileSync('skipped_tests_inventory.md', report);
console.log(`Inventory generated with ${skipList.length} items`);
