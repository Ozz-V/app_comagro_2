import { StyleSheet, Platform } from 'react-native';
import { COLORS } from '../../theme';

export const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '92%'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.navy
  },
  closeBtn: {
    fontSize: 22,
    color: COLORS.gray4,
    paddingHorizontal: 10
  },
  subtitle: {
    color: COLORS.gray4,
    marginBottom: 10,
    fontSize: 13
  },
  optionsContainer: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 10
  },
  optionCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.white
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  optionTextContainer: {
    flex: 1
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.navy
  },
  optionSubtitle: {
    fontSize: 12,
    color: COLORS.gray4,
    marginTop: 2
  },
  arrowIcon: {
    fontSize: 20,
    color: COLORS.gray4
  },
  inputTitleSmall: {
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 5,
    fontSize: 12
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15
  },
  counterBtn: {
    backgroundColor: COLORS.navy,
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  counterBtnText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold'
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#F0F4F8',
    marginHorizontal: 10,
    textAlign: 'center'
  },
  textInputSmall: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    color: '#000',
    backgroundColor: '#F0F4F8',
    textAlign: 'center'
  },
  grid2Cols: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10
  },
  col: {
    flex: 1
  },
  calculateBtn: {
    backgroundColor: COLORS.green,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 5
  },
  calculateBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 14
  },
  backBtn: {
    marginBottom: 5,
  },
  backBtnText: {
    color: COLORS.navy,
    fontSize: 12,
    fontWeight: 'bold'
  },
  resultContainer: {
    marginBottom: 10
  },
  estimationBox: {
    backgroundColor: '#E3FAED',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.green,
    marginBottom: 5
  },
  estimationTitle: {
    fontWeight: 'bold',
    color: COLORS.green,
    marginBottom: 5,
    fontSize: 12
  },
  estimationText: {
    color: COLORS.navy,
    fontSize: 12
  },
  suggestedContainer: {
    marginTop: 5
  },
  suggestedTitle: {
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 5,
    fontSize: 13
  },
  suggestedCard: {
    width: 120,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    marginRight: 8
  },
  suggestedImg: {
    width: '100%',
    height: 60,
    marginBottom: 5
  },
  suggestedImgPlaceholder: {
    width: '100%',
    height: 60,
    backgroundColor: '#f0f0f0',
    marginBottom: 5,
    borderRadius: 4
  },
  pairedBadge: {
    backgroundColor: COLORS.navy,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginBottom: 4,
    alignSelf: 'flex-start'
  },
  pairedBadgeText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: 'bold'
  },
  suggestedMarca: {
    fontSize: 9,
    color: COLORS.gray4,
    fontWeight: 'bold'
  },
  suggestedModelo: {
    fontSize: 11,
    color: COLORS.navy,
    fontWeight: 'bold',
    marginBottom: 2
  },
  suggestedVal: {
    fontSize: 10,
    color: COLORS.green,
    fontWeight: 'bold'
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center'
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.navy
  },
  tabText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.gray4
  },
  tabTextActive: {
    color: COLORS.navy
  },
  guiadoContainer: {
    paddingBottom: 5
  },
  usosList: {
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10
  },
  usoListCard: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'flex-start',
    justifyContent: 'center'
  },
  usoListTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 2
  },
  usoListSubtitle: {
    fontSize: 11,
    color: COLORS.gray4
  },
  usoCardActive: {
    backgroundColor: '#E6F0F9',
    borderColor: COLORS.navy
  },
  usoTitleActive: {
    color: COLORS.navy
  },
  colList: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 10
  },
  colListRow: {
    width: '100%'
  },
  unitTabs: {
    flexDirection: 'row',
    marginBottom: 5,
    gap: 5
  },
  unitTabBtn: {
    flex: 1,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: COLORS.white
  },
  unitTabBtnActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy
  },
  unitTabTxt: {
    fontSize: 11,
    color: COLORS.gray4,
    fontWeight: 'bold'
  },
  unitTabTxtActive: {
    color: COLORS.white
  },
  caudalRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  faseGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  faseBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  faseBtnActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy
  },
  faseBtnText: {
    color: COLORS.gray4,
    fontWeight: 'bold',
    fontSize: 10
  },
  faseBtnTextActive: {
    color: COLORS.white
  },
  avanzadoContainer: {
    paddingBottom: 5
  },
  accGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  accCell: {
    width: '31%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 5,
    alignItems: 'center'
  },
  accLabel: {
    fontSize: 9,
    color: COLORS.navy,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center'
  },
  accInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    backgroundColor: COLORS.white,
    width: '80%',
    padding: 2,
    textAlign: 'center',
    fontSize: 11,
    color: '#000'
  },
  advWarn: {
    fontSize: 11,
    color: '#D9381E',
    marginTop: 4
  },
  advResultBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.navy,
    borderRadius: 8,
    padding: 8,
    marginBottom: 5
  },
  advResultRow: {
    alignItems: 'center'
  },
  advResultLbl: {
    fontSize: 10,
    color: COLORS.gray4
  },
  advResultVal: {
    fontSize: 13,
    color: COLORS.navy,
    fontWeight: 'bold'
  },
  preReadBox: {
    backgroundColor: '#E6F0F9',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navy,
    marginBottom: 10
  },
  preReadText: {
    fontSize: 12,
    color: COLORS.navy
  }
});

