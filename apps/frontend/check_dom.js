const fs = require('fs');

const file = fs.readFileSync('checkout-debug.html', 'utf8');

const matches = [];
let idx = file.indexOf('0001Pracitemol');
while (idx !== -1) {
    const start = Math.max(0, idx - 100);
    const end = Math.min(file.length, idx + 100);
    matches.push(file.substring(start, end));
    idx = file.indexOf('0001Pracitemol', idx + 1);
}

console.log(`Found ${matches.length} occurrences`);
matches.forEach((m, i) => {
    console.log(`\n--- Match ${i + 1} ---`);
    console.log(m);
});
