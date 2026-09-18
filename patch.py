import sys
import re

def patch_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

patch_file('src/hooks/useDashboardAnalyticsLogic.ts', [
    ('d.created_at >= pDate', 'new Date(d.created_at).getTime() >= new Date(pDate).getTime()'),
    ('d.created_at >= prevPDate', 'new Date(d.created_at).getTime() >= new Date(prevPDate).getTime()'),
    ('d.created_at < pDate', 'new Date(d.created_at).getTime() < new Date(pDate).getTime()'),
    ('d.created_at >= todayIso', 'new Date(d.created_at).getTime() >= new Date(todayIso).getTime()')
])

with open('src/services/templateService.ts', 'r', encoding='utf-8') as f:
    ts = f.read()
ts = re.sub(r'<div class="chart-box">.*?</div>\s*</div>\s*</div>\s*<div class="grid-2x2">', '<div class="grid-2x2">', ts, flags=re.DOTALL)
ts = re.sub(r'\.chart-[a-z0-9-]+ \{.*?\n', '', ts)
with open('src/services/templateService.ts', 'w', encoding='utf-8') as f:
    f.write(ts)

with open('src/components/DashboardAnalytics.tsx', 'r', encoding='utf-8') as f:
    da = f.read()
da = re.sub(r'</View>\s*</ScrollView>\s*</View>\s*\);\s*\}', '''</View>
      </ScrollView>

      <UserReportModal
        visible={showUserReportModal}
        onClose={() => setShowUserReportModal(false)}
        users={directoryUsers || []}
        isGenerating={isGeneratingGrid}
        onGenerateGlobal={() => {
          setShowUserReportModal(false);
          generatePdfReport();
        }}
        onGenerateGrid={async (emails) => {
          setIsGeneratingGrid(true);
          try {
            const pLabel = period === 'today' ? 'Hoy' : period === '7d' ? 'Ultimos 7 dias' : period === '30d' ? 'Ultimos 30 dias' : 'Todo el tiempo';
            const { generateUserGridPdf } = await import('../utils/pdfGridReport');
            const uri = await generateUserGridPdf(emails, globalRawData, directoryUsers || [], pLabel);
            const { isAvailableAsync, shareAsync } = await import('expo-sharing');
            if (await isAvailableAsync()) {
              await shareAsync(uri, { dialogTitle: 'Reporte Usuarios' });
            }
          } catch (e) {
            console.error('Error al generar PDF de usuarios', e);
          } finally {
            setIsGeneratingGrid(false);
            setShowUserReportModal(false);
          }
        }}
      />
    </View>
  );
}''', da)
with open('src/components/DashboardAnalytics.tsx', 'w', encoding='utf-8') as f:
    f.write(da)

patch_file('src/components/RichTextEditorModal.tsx', [
    ("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}", "behavior={Platform.OS === 'ios' ? 'padding' : undefined}")
])

with open('src/screens/AdminUsersScreen.tsx', 'r', encoding='utf-8') as f:
    au = f.read()
au = re.sub(r'<TouchableOpacity style=\{\[styles\.btn, \{ backgroundColor: COLORS\.green \+ ''18'' \}\]\} onPress=\{\(\) => changeRole\(item\.id, ''admin''\)\}>.*?</TouchableOpacity>', '''<TouchableOpacity style={[styles.btn, { backgroundColor: item.role === 'admin' ? COLORS.bg : COLORS.green + '18' }]} onPress={() => changeRole(item.id, 'admin')} disabled={item.role === 'admin'}>
                      <SvgXml xml={IconAdmin} />
                      <Text style={[styles.btnLabel, { color: item.role === 'admin' ? COLORS.gray4 : COLORS.green }]}>Admin</Text>
                    </TouchableOpacity>''', au, flags=re.DOTALL)
au = re.sub(r'<TouchableOpacity style=\{\[styles\.btn, \{ backgroundColor: COLORS\.celeste \+ ''18'' \}\]\} onPress=\{\(\) => changeRole\(item\.id, ''staff''\)\}>.*?</TouchableOpacity>', '''<TouchableOpacity style={[styles.btn, { backgroundColor: item.role === 'staff' ? COLORS.bg : COLORS.celeste + '18' }]} onPress={() => changeRole(item.id, 'staff')} disabled={item.role === 'staff'}>
                      <SvgXml xml={IconUser} />
                      <Text style={[styles.btnLabel, { color: item.role === 'staff' ? COLORS.gray4 : COLORS.celeste }]}>Staff</Text>
                    </TouchableOpacity>''', au, flags=re.DOTALL)
with open('src/screens/AdminUsersScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(au)

patch_file('src/screens/AdminPlytixScreen.tsx', [('Monitor Plytix', 'Estado de Servidores')])

with open('src/components/SystemHealthMonitor.tsx', 'r', encoding='utf-8') as f:
    sh = f.read()
sh = sh.replace("import CollapsibleSection from './CollapsibleSection';", "")
sh = re.sub(r'<CollapsibleSection.*?rightIndicator=\{.*?\}.*?>', '<View style={s.card}>', sh, flags=re.DOTALL)
sh = sh.replace("</CollapsibleSection>", "</View>")
sh = sh.replace("const s = StyleSheet.create({", "const s = StyleSheet.create({\n  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginHorizontal: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },")
with open('src/components/SystemHealthMonitor.tsx', 'w', encoding='utf-8') as f:
    f.write(sh)
