import re

with open("src/components/historial/StarProductPanel.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Replace the layout
layout_pattern = r"<View style=\{styles\.gridRow\}>.*?</View>\s*</View>"
new_layout = """<View style={[styles.gridRow, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }]}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <SvgXml xml={TrophyIcon} width="40" height="40" />
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Image
                source={{ uri: starData.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(starData.sku.substring(0, 2))}&background=E8ECF0&color=1A2530` }}
                style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#E8ECF0' }}
                contentFit="contain"
              />
            </View>
            <View style={{ flex: 1.5, alignItems: 'flex-start', paddingLeft: 10 }}>
              {!!starData.subcategory && (
                <Text style={styles.typeText} numberOfLines={1} ellipsizeMode="tail">
                  {starData.subcategory}
                </Text>
              )}
              <Text style={styles.skuText} numberOfLines={1} ellipsizeMode="tail">
                {starData.sku}
              </Text>
              <Text style={styles.marcaText} numberOfLines={1} ellipsizeMode="tail">
                {starData.marca}
              </Text>
            </View>
          </View>"""

content = re.sub(layout_pattern, new_layout, content, flags=re.DOTALL)

with open("src/components/historial/StarProductPanel.tsx", "w", encoding="utf-8") as f:
    f.write(content)