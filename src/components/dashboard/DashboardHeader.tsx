import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS } from '../../theme';
import SvgIcon from '../SvgIcon';
import { s } from './DashboardStyles';

interface Props {
  tab: 'mine' | 'general';
  setTab: (t: 'mine' | 'general') => void;
  period: string;
  setPeriod: (p: string) => void;
  isAdmin: boolean;
  loading: boolean;
  isGeneratingPdf?: boolean;
  onPdfPress: () => void;
}

export function DashboardHeader({ tab, setTab, period, setPeriod, isAdmin, loading, onPdfPress, isGeneratingPdf }: Props) {
  return (
    <>
      <View style={s.headerRow}>
        <View style={s.tabs}>
           <TouchableOpacity style={[s.tabBtn, tab === 'mine' && s.tabActive]} onPress={() => setTab('mine')}>
             <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>Mi Actividad</Text>
           </TouchableOpacity>
           <TouchableOpacity style={[s.tabBtn, tab === 'general' && s.tabActive]} onPress={() => setTab('general')}>
             <Text style={[s.tabText, tab === 'general' && s.tabTextActive]}>General</Text>
           </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onPdfPress} style={[s.pdfBtn, { opacity: isGeneratingPdf ? 0.7 : 1 }]} disabled={isGeneratingPdf || loading}>
          {isGeneratingPdf ? (
            <ActivityIndicator size="small" color={COLORS.navy} />
          ) : (
            <>
              <SvgIcon name="upload" size={14} color={COLORS.navy} />
              <Text style={s.pdfBtnText}>Reporte</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[s.filtersRow, { justifyContent: 'space-between' }]}>
         <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
           {['today', '7d', '30d', 'all'].map(p => (
            <TouchableOpacity key={p} style={[s.filterPill, period === p && s.filterPillActive]} onPress={() => setPeriod(p)}>
               <Text style={[s.filterPillText, period === p && s.filterPillTextActive]}>
                  {p === 'today' ? 'Hoy' : p === '7d' ? '7 Días' : p === '30d' ? '30 Días' : 'Todo'}
               </Text>
            </TouchableOpacity>
           ))}
         </View>
         
      </View>
    </>
  );
}
