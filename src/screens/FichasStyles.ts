import { StyleSheet, Platform, StatusBar } from 'react-native';
import { COLORS, FONTS } from '../theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    gap: 12,
  },
  topbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: COLORS.white,
  },
  searchIcon: { fontSize: 13, marginRight: 8 },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.navy,
  },
  btnVolver: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.green,
  },

  // Lista
  list: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 16 },

  folderBtn: { 
    backgroundColor: COLORS.white, 
    padding: 20, 
    borderRadius: 12, 
    marginBottom: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 3, 
    borderWidth: 1, 
    borderColor: '#E8ECF0' 
  },
  folderBtnText: { 
    fontFamily: FONTS.heading, 
    fontSize: 16, 
    color: COLORS.navy, 
    fontWeight: '700' 
  },

  catLabel: {
    fontFamily: FONTS.bodySemi,
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.gray4,
    textTransform: 'uppercase',
    paddingTop: 18,
    paddingBottom: 8,
  },

  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray6,
  },
  fileIcon: {
    width: 32,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  fileBadge: {
    fontFamily: FONTS.bodySemi,
    fontSize: 8,
    color: '#cc2222',
    letterSpacing: 0.3,
  },
  fileName: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.navy,
    lineHeight: 18,
  },
  fileSize: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
  },

  // Estados
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  centerText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: 'red',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: COLORS.navy,
  },
  retryText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 14,
    color: COLORS.white,
  },
});
