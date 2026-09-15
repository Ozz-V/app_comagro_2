import { StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../../theme';

export const s = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 },
  tabs: { flex: 1, flexDirection: 'row', backgroundColor: '#E8ECF0', borderRadius: 8, padding: 3, marginRight: 10 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: COLORS.white, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.gray4 },
  tabTextActive: { color: COLORS.navy, fontWeight: '700' },
  
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8ECF0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  pdfBtnText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, fontWeight: '600' },

  filtersRow: { flexDirection: 'row', gap: 8, marginBottom: 14, paddingHorizontal: 16 },
  filterPill: { flex: 1, paddingVertical: 8, backgroundColor: '#E8ECF0', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  filterPillActive: { backgroundColor: COLORS.navy },
  filterPillText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textAlign: 'center' },
  filterPillTextActive: { color: COLORS.white, fontWeight: '700' },
  loader: { marginTop: 40 },
  
  contentArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 30 },
  rowTotals: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  row: { flexDirection: 'row', gap: 12 },
  
  cardTotal: { flex: 1, borderRadius: 12, padding: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3 },
  cardTotalViews: { backgroundColor: COLORS.navy },
  cardTotalShares: { backgroundColor: COLORS.celeste || '#007DB8' },

  cardChart: { backgroundColor: COLORS.white, borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  
  cardTitleLight: { fontFamily: FONTS.bodySemi, fontSize: 11, color: 'rgba(255, 255, 255, 0.85)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  totalValueLight: { fontFamily: FONTS.heading, fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  trendTextLight: { fontFamily: FONTS.bodySemi, fontSize: 12, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  
  cardList: { flex: 1, backgroundColor: COLORS.white, borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  cardListFull: { width: '100%', backgroundColor: COLORS.white, borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  cardTitle: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },
  
  listContainer: { gap: 8 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemImg: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#F0F4F8' },
  itemAvatar: { borderRadius: 12 },
  itemBrand: { borderRadius: 4, borderWidth: 1, borderColor: '#eee' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.navy, marginBottom: 3 },
  itemCount: { fontFamily: FONTS.heading, fontSize: 11, fontWeight: '800', width: 28, textAlign: 'right' },
  progressBg: { height: 4, backgroundColor: '#E8ECF0', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
