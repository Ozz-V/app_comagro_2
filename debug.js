const fs = require('fs');
let content = fs.readFileSync('src/components/calculator/pump/PumpGuidedForm.tsx', 'utf8');
const lines = content.split('\n');
for (const line of lines) {
    if (line.includes('Alimentaci')) {
        console.log("FOUND: " + line);
        // Print character codes
        let codes = [];
        for(let i=0; i<line.length; i++) {
            codes.push(line.charCodeAt(i));
        }
        console.log("CODES:", codes.join(','));
    }
}
