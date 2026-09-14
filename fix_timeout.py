import os

path = 'src/hooks/useProductDetailLogic.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_code = '''      // El PDF nativo ya avis (onLoadComplete) que la pǭgina estǭ renderizada.
      // Solo esperamos a que React Native confirme que ese frame ya se compuso
      // en pantalla antes de capturarlo ?" nada de tiempos de espera adivinados.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));'''

new_code = '''      // El PDF nativo avisa (onLoadComplete) pero a veces la vista nativa tarda unos ms extra en dibujar.
      // Agregamos un timeout fijo de 1000ms para asegurar que no se capture una pantalla blanca.
      await new Promise(resolve => setTimeout(resolve, 1000));'''

content = content.replace(old_code, new_code)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Timeout added")
