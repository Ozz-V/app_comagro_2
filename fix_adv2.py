import os

path = 'src/components/calculator/pump/PumpAdvancedForm.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add Modal, ScrollView
content = content.replace(
    "import { View, Text, TouchableOpacity, TextInput } from 'react-native';",
    "import { View, Text, TouchableOpacity, TextInput, Modal, ScrollView } from 'react-native';"
)

# Fix signature
content = content.replace(
    'FRICCION_DIAMS, FIT_HEADERS, COLORS }: any)',
    'FRICCION_DIAMS, FIT_HEADERS, COLORS, showDiamPicker, setShowDiamPicker, advResults }: any)'
)

# Remove the local showDiamPicker state since it's now a prop
content = content.replace('const [showDiamPicker, setShowDiamPicker] = useState(false);\n', '')

# Code for Results and Modal
advanced_blocks = '''
      {canBuscar && advResults && advResults.hTotal > 0 && (
        <View style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#e1e5eb' }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.navy, marginBottom: 8 }}>Resultados de Cañería</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: '#555' }}>Long. Equivalente Total:</Text>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>{advResults?.lTotal?.toFixed(2)} m</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: '#555' }}>Pérdida por Fricción:</Text>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>{advResults?.perdida?.toFixed(2)} m.c.a.</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e1e5eb' }}>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.navy }}>Altura Dinámica Total:</Text>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.green }}>{advResults?.hTotal?.toFixed(2)} m.c.a.</Text>
          </View>
        </View>
      )}

      <Modal visible={showDiamPicker} transparent animationType="fade" onRequestClose={() => setShowDiamPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowDiamPicker(false)}>
          <View style={{ width: '80%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', maxHeight: '70%' }}>
            <Text style={{ padding: 15, fontSize: 16, fontWeight: 'bold', backgroundColor: COLORS.navy, color: '#fff', textAlign: 'center' }}>Seleccionar Diámetro</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {FRICCION_DIAMS.map((d: any, idx: number) => {
                const s = interpolateFriction(advQ, idx).status;
                const isInvalid = s === 'above' || s === 'sin-datos';
                return (
                  <TouchableOpacity
                    key={d}
                    style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: isInvalid ? '#f9f9f9' : adv.diamIdx === idx ? '#f0f8ff' : '#fff' }}
                    onPress={() => { if (!isInvalid) { setAdv({...adv, diamIdx: idx}); setShowDiamPicker(false); } }}
                    disabled={isInvalid}
                  >
                    <Text style={{ fontSize: 15, color: isInvalid ? '#ccc' : COLORS.navy, fontWeight: adv.diamIdx === idx ? 'bold' : 'normal', textAlign: 'center' }}>
                      {d} {isInvalid && '(Fuera de rango)'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity
'''

content = content.replace('      <TouchableOpacity\n        style={[styles.calculateBtn', advanced_blocks + '        style={[styles.calculateBtn')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("PumpAdvancedForm updated")
