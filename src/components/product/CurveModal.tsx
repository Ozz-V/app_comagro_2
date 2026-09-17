import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Path, Line, Text as SvgText, G } from 'react-native-svg';
import { Image } from 'expo-image';
import { COLORS } from '../../theme';
import SvgIcon from '../SvgIcon';

export default function CurveModal({ 
  visible, 
  onClose, 
  curveData, 
  modalProd, 
  curveCaptureRef,
  curveSize,
  sharingCurvaImagen,
  sharingCurvaPdf,
  compartirCurvaImagen,
  compartirCurvaPdf,
  insets,
  screenHeight,
  LOGO_BASE,
  logoRefreshKey
}: any) {
  if (!visible || !curveData) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', paddingTop: insets.top, paddingBottom: insets.bottom}}>
        <View style={{
          width: '90%',
          maxHeight: screenHeight - insets.top - insets.bottom - 32,
          backgroundColor: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
         <ScrollView
           showsVerticalScrollIndicator={false}
           contentContainerStyle={{ alignItems: 'center', padding: 20, paddingBottom: 16 }}
         >
           <View ref={curveCaptureRef} collapsable={false} style={{ alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 4, paddingBottom: 18 }}>
             <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', borderBottomWidth: 3, borderBottomColor: COLORS.green, paddingBottom: 10, marginBottom: 14, gap: 10 }}>
               <Image
                 source={{ uri: LOGO_BASE + (modalProd?.marca || '').toUpperCase().replace(/\s+/g, '_') + '.jpg' }}
                 style={{ width: 90, height: 42 }}
                 contentFit="contain"
               />
               <View style={{ width: 1.5, height: 34, backgroundColor: '#dce4f0' }} />
               <View style={{ flex: 1 }}>
                 <Text style={{ fontSize: 15, fontWeight: 'bold', color: COLORS.navy, textTransform: 'uppercase' }}>Curva de Rendimiento</Text>
                 <Text style={{ fontSize: 11, color: '#555', marginTop: 1 }}>{modalProd?.marca} - {modalProd?.subcategoria}</Text>
                 <Text style={{ fontSize: 11, color: COLORS.navy, fontWeight: '600', marginTop: 1 }}>SKU: {modalProd?.modelo}</Text>
               </View>
             </View>
           <View style={{width: curveSize, height: curveSize}}>
              <Svg width={curveSize} height={curveSize} viewBox="0 0 320 320">
                {curveData.qTicks.map((t: number) => {
                   const px = 50 + (t / curveData.qTicks[curveData.qTicks.length - 1]) * 240;
                   return (
                     <G key={'x-' + t}>
                       <Line x1={px} y1="40" x2={px} y2="280" stroke="#e4eaf4" strokeWidth="1" />
                       <SvgText x={px} y="295" fontSize="10" fill="#555" textAnchor="middle">{t}</SvgText>
                     </G>
                   );
                })}
                {curveData.hTicks.map((t: number) => {
                   const py = 280 - (t / curveData.hTicks[curveData.hTicks.length - 1]) * 240;
                   return (
                     <G key={'y-' + t}>
                       <Line x1="50" y1={py} x2="290" y2={py} stroke="#e4eaf4" strokeWidth="1" />
                       <SvgText x="42" y={py + 3} fontSize="10" fill="#555" textAnchor="end">{t}</SvgText>
                     </G>
                   );
                })}

                <Line x1="50" y1="40" x2="50" y2="280" stroke="#555" strokeWidth="2" />
                <Line x1="50" y1="280" x2="290" y2="280" stroke="#555" strokeWidth="2" />
                <SvgText x="170" y="315" fontSize="12" fill="#555" textAnchor="middle" fontWeight="bold">Caudal (m³/h)</SvgText>
                <SvgText x="15" y="160" fontSize="12" fill="#555" textAnchor="middle" transform="rotate(-90, 15, 160)" fontWeight="bold">Altura MCA (m)</SvgText>

                {(() => {
                  const dStr = [...Array(51).keys()].map(i => {
                       const q = curveData.maxQ * (i / 50);
                       const hp = curveData.maxH * (1 - Math.pow(q / curveData.maxQ, 2));
                       const maxTickQ = curveData.qTicks[curveData.qTicks.length - 1];
                       const maxTickH = curveData.hTicks[curveData.hTicks.length - 1];
                       if (q > maxTickQ || hp < 0) return null;
                       const px = 50 + (q / maxTickQ) * 240;
                       const py = 280 - (hp / maxTickH) * 240;
                       return { px, py };
                    }).filter((pt): pt is { px: number, py: number } => pt !== null).map((pt, index) => {
                       return (index === 0 ? 'M' : 'L') + pt.px + ',' + pt.py;
                    }).join(' ');
                  
                  if (!dStr) return null; // Previene crasheos nativos en Android si no hay curva válida
                  
                  return (
                    <Path 
                      d={dStr}
                      stroke={COLORS.green}
                      strokeWidth="3"
                      fill="none"
                    />
                  );
                })()}
              </Svg>
           </View>
             
             {/* Advertencia requerida */}
             <View style={{ backgroundColor: '#fff4e5', borderColor: '#f0a93a', borderWidth: 1.5, borderRadius: 8, padding: 12, marginTop: 14, width: '100%' }}>
               <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#7a4a05', marginBottom: 4 }}>Importante: gráfica estimativa, no oficial del fabricante</Text>
               <Text style={{ fontSize: 11, color: '#7a4a05', lineHeight: 16 }}>Esta curva es una aproximación teórica generada a partir de los datos técnicos cargados para este producto (caudal y altura/presión máximos). No representa necesariamente la curva real publicada por el fabricante, ya que no se cuenta con la totalidad de los puntos de su curva oficial. Para datos técnicos exactos y curvas de eficiencia, consultá siempre la ficha oficial del fabricante o a un asesor de Comagro.</Text>
             </View>

           </View>
           <View style={{flexDirection: 'row', gap: 10, marginTop: 10, width: '100%'}}>
            <TouchableOpacity
              style={[{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44, borderRadius: 6, backgroundColor: '#b72a2a' }, sharingCurvaPdf && {opacity: 0.6}]}
              onPress={compartirCurvaPdf}
              disabled={sharingCurvaPdf || sharingCurvaImagen}
              activeOpacity={0.8}
            >
              {sharingCurvaPdf ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <SvgIcon name="descarga" size={16} color="#fff" />
                  <Text style={{ fontFamily: 'Nunito-SemiBold', fontSize: 14, color: '#fff', fontWeight: '700' }}>PDF</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44, borderRadius: 6, backgroundColor: COLORS.green }, sharingCurvaImagen && {opacity: 0.6}]}
              onPress={compartirCurvaImagen}
              disabled={sharingCurvaPdf || sharingCurvaImagen}
              activeOpacity={0.8}
            >
              {sharingCurvaImagen ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <SvgIcon name="share" size={16} color="#fff" />
                  <Text style={{ fontFamily: 'Nunito-SemiBold', fontSize: 14, color: '#fff', fontWeight: '700' }}>Imagen</Text>
                </View>
              )}
            </TouchableOpacity>
         </View>

         <TouchableOpacity style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44, borderRadius: 6, marginTop: 10, width: '100%', backgroundColor: COLORS.navy}} onPress={onClose}>
            <Text style={{color: '#fff', fontWeight: 'bold'}}>Cerrar</Text>
         </TouchableOpacity>
       </ScrollView>
      </View>
    </View>
  </Modal>
  );
}
