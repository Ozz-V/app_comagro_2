import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../../theme';
import { s } from './DashboardStyles';

interface Props {
  tab: 'mine' | 'general';
  data: any;
  renderListItem: (item: any, max: number, type: 'vistas' | 'compartidos' | 'marcas' | 'usuarios') => React.ReactNode;
}

export function DashboardRankingLists({ tab, data, renderListItem }: Props) {
  if (tab === 'mine') {
    return (
      <View style={{ gap: 12, marginTop: 12 }}>
          <View style={s.row}>
              <View style={s.cardList}>
                 <Text style={s.cardTitle}>Más Vistos</Text>
                 <View style={s.listContainer}>
                    {data.topV.slice(0,5).map((it: any) => renderListItem(it, data.topV[0]?.count || 1, 'vistas'))}
                 </View>
              </View>
              <View style={s.cardList}>
                 <Text style={s.cardTitle}>Más Compartidos</Text>
                 <View style={s.listContainer}>
                    {data.topSh.slice(0,5).map((it: any) => renderListItem(it, data.topSh[0]?.count || 1, 'compartidos'))}
                 </View>
              </View>
          </View>
          <View style={s.cardListFull}>
             <Text style={s.cardTitle}>Top Marcas</Text>
             <View style={s.listContainer}>
                {data.brands?.slice(0,5).map((it: any) => renderListItem(it, data.brands?.[0]?.count || 1, 'marcas'))}
             </View>
          </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 12, marginTop: 12 }}>
        <View style={s.row}>
            <View style={s.cardList}>
               <Text style={s.cardTitle}>Más Vistos</Text>
               <View style={s.listContainer}>
                  {data.topV.slice(0,5).map((it: any) => renderListItem(it, data.topV[0]?.count || 1, 'vistas'))}
               </View>
            </View>
            <View style={s.cardList}>
               <Text style={s.cardTitle}>Más Compartidos</Text>
               <View style={s.listContainer}>
                  {data.topSh.slice(0,5).map((it: any) => renderListItem(it, data.topSh[0]?.count || 1, 'compartidos'))}
               </View>
            </View>
         </View>

         <View style={s.row}>
            <View style={s.cardList}>
               <Text style={s.cardTitle}>Top Marcas</Text>
               <View style={s.listContainer}>
                  {data.brands?.slice(0,5).map((it: any) => renderListItem(it, data.brands?.[0]?.count || 1, 'marcas'))}
               </View>
            </View>
            <View style={s.cardList}>
              <Text style={s.cardTitle}>Usuarios Activos</Text>
              <View style={s.listContainer}>
                 {data.users && data.users.length > 0 ? 
                    data.users.slice(0,5).map((it: any) => renderListItem(it, data.users?.[0]?.count || 1, 'usuarios')) 
                    : <Text style={{fontSize: 10, color: COLORS.gray3, fontStyle: 'italic', textAlign: 'center', marginTop: 10}}>Sin datos aún</Text>
                 }
              </View>
            </View>
         </View>
    </View>
  );
}
