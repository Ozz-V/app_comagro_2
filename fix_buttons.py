import os
import re

# GeneratorTab
f1 = 'src/components/calculator/GeneratorTab.tsx'
with open(f1, 'r', encoding='utf-8') as file:
    content1 = file.read()

content1 = content1.replace(
    '<TouchableOpacity style={styles.calculateBtn} onPress={handleCalculate}>',
    '''<TouchableOpacity disabled={!calcInput || parseFloat(calcInput) <= 0} style={[styles.calculateBtn, (!calcInput || parseFloat(calcInput) <= 0) && { backgroundColor: COLORS.gray4 }]} onPress={handleCalculate}>'''
)

with open(f1, 'w', encoding='utf-8') as file:
    file.write(content1)


# MotorForm
f2 = 'src/components/calculator/forms/MotorForm.tsx'
with open(f2, 'r', encoding='utf-8') as file:
    content2 = file.read()

content2 = content2.replace(
    '''<TouchableOpacity style={[styles.calculateBtn, {marginTop: 20}]} onPress={handleCalculate}>''',
    '''<TouchableOpacity disabled={!motorState.hp || parseFloat(motorState.hp) <= 0} style={[styles.calculateBtn, {marginTop: 20}, (!motorState.hp || parseFloat(motorState.hp) <= 0) && { backgroundColor: COLORS.gray4 }]} onPress={handleCalculate}>'''
)

with open(f2, 'w', encoding='utf-8') as file:
    file.write(content2)

print("Buttons fixed!")
