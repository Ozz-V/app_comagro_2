const fs = require('fs');
let content = fs.readFileSync('src/components/product/CurveModal.tsx', 'utf8');

const warningText = 
             <View style={{ marginTop: 16, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 8, borderWidth: 1, borderColor: '#FFE0B2', width: '100%' }}>
               <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#E65100', marginBottom: 4 }}>
                 Importante: gráfica estimativa, no oficial del fabricante
               </Text>
               <Text style={{ fontSize: 11, color: '#E65100', lineHeight: 16 }}>
                 Esta curva es una aproximación teórica generada a partir de los datos técnicos cargados para este producto (caudal y altura/presión máximos). No representa necesariamente la curva real publicada por el fabricante, ya que no se cuenta con la totalidad de los puntos de su curva oficial. Para datos técnicos exactos y curvas de eficiencia, consultá siempre la ficha oficial del fabricante o a un asesor de Comagro.
               </Text>
             </View>
;

if (!content.includes('Importante: gráfica estimativa')) {
    content = content.replace(
        '</Svg>\n             </View>\n             </View>',
        '</Svg>\n             </View>' + warningText + '\n             </View>'
    );
    fs.writeFileSync('src/components/product/CurveModal.tsx', content, 'utf8');
    console.log("Added Curve warning text!");
}
