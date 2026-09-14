import os

file_path = 'src/hooks/useCalculatorLogic.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = '''                let rawHp = 0;
                if (targetHpInput > 0) {
                    rawHp = targetHpInput;
                } else if (pQ > 0 && pH > 0) {
                    rawHp = (pQ * pH) / reglas.matematica.divisorHpBomba;
                } else if (pump.calcVal > 0) {
                    rawHp = pump.calcVal;
                }'''

new_block = '''                let rawHp = 0;
                if (targetHpInput > 0) {
                    rawHp = targetHpInput;
                } else if (pump.calcVal > 0 && String(pump.subcategoria).toUpperCase().includes('CUERPO')) {
                    rawHp = pump.calcVal;
                } else if (targetCaudalLpm > 0 && targetAlturaInput > 0) {
                    rawHp = (targetCaudalLpm * targetAlturaInput) / reglas.matematica.divisorHpBomba;
                } else if (pQ > 0 && pH > 0) {
                    rawHp = (pQ * pH) / reglas.matematica.divisorHpBomba;
                } else if (pump.calcVal > 0) {
                    rawHp = pump.calcVal;
                }'''

content = content.replace(old_block, new_block)

old_filter = "selectedMotors = validMotors.filter(m => m.calcVal > 0 && m.calcVal >= searchHp && m.calcVal <= searchHp * 1.35);"
new_filter = "selectedMotors = validMotors.filter(m => m.calcVal > 0 && m.calcVal >= searchHp && m.calcVal <= searchHp * 1.20);"
content = content.replace(old_filter, new_filter)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
