import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView, ScrollView } from 'react-native';
import { COLORS, FONTS } from '../theme';
import { SvgXml } from 'react-native-svg';

const ChevronLeft = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const ChevronRight = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}

export default function CustomDateTimePicker({ visible, onClose, onConfirm }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Initialize to next hour by default
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    if (visible) {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      setSelectedDate(d);
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [visible]);

  const changeMonth = (delta: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1));
  };

  const setHour = (h: number) => {
    const newD = new Date(selectedDate);
    newD.setHours(h);
    setSelectedDate(newD);
  };

  const setMinute = (m: number) => {
    const newD = new Date(selectedDate);
    newD.setMinutes(m);
    setSelectedDate(newD);
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const days = getDaysInMonth();
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const today = new Date();
  today.setHours(0,0,0,0);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Programar Comunicado</Text>
          
          <View style={styles.monthSelector}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrow}><SvgXml xml={ChevronLeft} /></TouchableOpacity>
            <Text style={styles.monthText}>{months[currentDate.getMonth()]} {currentDate.getFullYear()}</Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrow}><SvgXml xml={ChevronRight} /></TouchableOpacity>
          </View>

          <View style={styles.weekDays}>
            {['Do','Lu','Ma','Mi','Ju','Vi','Sa'].map((d, i) => <Text key={i} style={styles.weekDayText}>{d}</Text>)}
          </View>

          <View style={styles.daysGrid}>
            {days.map((d, i) => {
              if (d === null) return <View key={i} style={styles.dayCell} />;
              
              const thisDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
              const isPast = thisDate.getTime() < today.getTime();
              const isSelected = selectedDate.getFullYear() === thisDate.getFullYear() && 
                                 selectedDate.getMonth() === thisDate.getMonth() && 
                                 selectedDate.getDate() === d;

              return (
                <TouchableOpacity 
                  key={i} 
                  style={[styles.dayCell, isSelected && styles.dayCellSelected, isPast && styles.dayCellPast]}
                  disabled={isPast}
                  onPress={() => {
                    const newD = new Date(selectedDate);
                    newD.setFullYear(thisDate.getFullYear(), thisDate.getMonth(), d);
                    setSelectedDate(newD);
                  }}
                >
                  <Text style={[styles.dayText, isSelected && styles.dayTextSelected, isPast && styles.dayTextPast]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          <Text style={styles.timeTitle}>Hora de publicación</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Hora</Text>
              <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {[...Array(24)].map((_, h) => (
                  <TouchableOpacity key={h} style={[styles.timeItem, selectedDate.getHours() === h && styles.timeItemSelected]} onPress={() => setHour(h)}>
                    <Text style={[styles.timeItemText, selectedDate.getHours() === h && styles.timeItemTextSelected]}>{h.toString().padStart(2, '0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <Text style={styles.timeColon}>:</Text>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Minuto</Text>
              <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {[0, 15, 30, 45].map(m => (
                  <TouchableOpacity key={m} style={[styles.timeItem, selectedDate.getMinutes() === m && styles.timeItemSelected]} onPress={() => setMinute(m)}>
                    <Text style={[styles.timeItemText, selectedDate.getMinutes() === m && styles.timeItemTextSelected]}>{m.toString().padStart(2, '0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnConfirm} onPress={() => onConfirm(selectedDate)}>
              <Text style={styles.btnConfirmText}>Aceptar</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { backgroundColor: COLORS.white, borderRadius: 16, width: '100%', maxWidth: 360, padding: 20 },
  title: { fontFamily: FONTS.heading, fontSize: 18, color: COLORS.navy, textAlign: 'center', marginBottom: 20, fontWeight: '700' },
  
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  arrow: { padding: 8, backgroundColor: COLORS.bg, borderRadius: 8 },
  monthText: { fontFamily: FONTS.bodySemi, fontSize: 16, color: COLORS.navy, textTransform: 'capitalize' },
  
  weekDays: { flexDirection: 'row', marginBottom: 8 },
  weekDayText: { flex: 1, textAlign: 'center', fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.gray4 },
  
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20, marginVertical: 2 },
  dayCellSelected: { backgroundColor: COLORS.green },
  dayCellPast: { opacity: 0.3 },
  dayText: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy },
  dayTextSelected: { color: COLORS.white, fontFamily: FONTS.bodySemi },
  dayTextPast: { color: COLORS.gray4 },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 16 },
  
  timeTitle: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy, textAlign: 'center', marginBottom: 12 },
  timeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 120 },
  timeCol: { width: 80, height: 120, backgroundColor: COLORS.bg, borderRadius: 8, overflow: 'hidden' },
  timeLabel: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4, textAlign: 'center', paddingVertical: 4, backgroundColor: COLORS.border },
  timeScroll: { flex: 1 },
  timeItem: { paddingVertical: 10, alignItems: 'center' },
  timeItemSelected: { backgroundColor: COLORS.green },
  timeItemText: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.navy },
  timeItemTextSelected: { color: COLORS.white, fontFamily: FONTS.bodySemi, fontWeight: 'bold' },
  timeColon: { fontFamily: FONTS.heading, fontSize: 24, color: COLORS.navy, marginHorizontal: 16 },

  footer: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btnCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.bg, alignItems: 'center' },
  btnCancelText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.gray4 },
  btnConfirm: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.green, alignItems: 'center' },
  btnConfirmText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.white }
});