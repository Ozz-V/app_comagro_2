import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';
import { supabase } from '../supabase';

export default function ProfileCompleteModal({ visible, onSuccess, initialName = '', initialPhone = '' }) {
  const [profName, setProfName] = useState(initialName);
  const [profPhoneCode, setProfPhoneCode] = useState('+595');
  const [profPhone, setProfPhone] = useState(initialPhone);
  const [profSaving, setProfSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setProfName(initialName);
      if (initialPhone && initialPhone !== '+595') {
        if (initialPhone.includes(' ')) {
          const parts = initialPhone.split(' ');
          setProfPhoneCode(parts[0]);
          setProfPhone(parts.slice(1).join(' '));
        } else {
          setProfPhone(initialPhone);
        }
      }
    }
  }, [visible, initialName, initialPhone]);

  async function saveRequiredProfile() {
    if (!profName.trim() || !profPhone.trim()) {
      alert('Por favor completa tu nombre y teléfono.');
      return;
    }
    setProfSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const combinedPhone = `${profPhoneCode.trim()} ${profPhone.trim()}`;
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: profName,
        telefono: combinedPhone,
        email: user.email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (!error) {
        if (onSuccess) onSuccess(profName);
      } else {
        alert('Error DB: ' + (error.message || JSON.stringify(error)));
      }
    } catch (e) {
      alert('Error guardando perfil.');
    } finally {
      setProfSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: COLORS.white, borderRadius: 15, padding: 24, elevation: 5 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <SvgIcon name="agenteIA" size={48} color={COLORS.navy} />
            <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginTop: 12 }}>Completa tu perfil</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, textAlign: 'center', marginTop: 8 }}>
              Para ofrecerte una mejor experiencia, necesitamos que nos indiques tu nombre y número de teléfono.
            </Text>
          </View>

          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray1, marginBottom: 4 }}>Nombre completo</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, marginBottom: 16, fontFamily: FONTS.body, color: COLORS.navy }}
            placeholder="Ej. Juan Pérez"
            value={profName}
            onChangeText={setProfName}
          />

          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray1, marginBottom: 4 }}>Teléfono</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#F7F8FA' }}>
              <Text style={{ fontSize: 16, marginRight: 6 }}>{profPhoneCode === '+595' ? '🇵🇾' : '🌍'}</Text>
              <TextInput
                style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, paddingVertical: 12, minWidth: 40 }}
                value={profPhoneCode}
                onChangeText={setProfPhoneCode}
                keyboardType="phone-pad"
              />
            </View>
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontFamily: FONTS.body, color: COLORS.navy }}
              placeholder="Ej. 981 123 456"
              keyboardType="phone-pad"
              value={profPhone}
              onChangeText={setProfPhone}
            />
          </View>

          <TouchableOpacity
            style={{ backgroundColor: COLORS.navy, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
            onPress={saveRequiredProfile}
            disabled={profSaving}
          >
            {profSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 15, color: COLORS.white, fontWeight: '700' }}>Continuar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
