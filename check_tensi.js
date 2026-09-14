const fs = require('fs');
let c1 = fs.readFileSync('src/components/calculator/forms/MotorForm.tsx', 'utf8');
let c2 = fs.readFileSync('src/components/calculator/pump/PumpGuidedForm.tsx', 'utf8');

console.log("MotorForm:");
c1.split('\n').filter(l => l.includes('Tensi')).forEach(l => console.log(l.trim()));

console.log("PumpGuided:");
c2.split('\n').filter(l => l.includes('necesita')).forEach(l => console.log(l.trim()));
