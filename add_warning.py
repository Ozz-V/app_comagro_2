import os

path = 'src/components/product/CurveModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

warningText = '''
             <View style={{ marginTop: 16, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 8, borderWidth: 1, borderColor: '#FFE0B2', width: '100%' }}>
               <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#E65100', marginBottom: 4 }}>
                 Importante: gráfica estimativa, no oficial del fabricante
               </Text>
               <Text style={{ fontSize: 11, color: '#E65100', lineHeight: 16 }}>
                 Esta curva es una aproximación teórica generada a partir de los datos técnicos cargados para este producto (caudal y altura/presión máximos). No representa necesariamente la curva real publicada por el fabricante, ya que no se cuenta con la totalidad de los puntos de su curva oficial. Para datos técnicos exactos y curvas de eficiencia, consultá siempre la ficha oficial del fabricante o a un asesor de Comagro.
               </Text>
             </View>
'''

if 'Importante: gráfica estimativa' not in content:
    content = content.replace('</Svg>\n             </View>\n             </View>', '</Svg>\n             </View>' + warningText + '\n             </View>')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Warning added successfully")
else:
    print("Warning already exists")
