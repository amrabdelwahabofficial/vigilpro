import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, Modal, FlatList, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { countries, useVigil, CountryCode } from '@/context/AppContext';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function CountryPicker({ value, onChange, disabled, onBlocked }: { value: CountryCode; onChange: (code: CountryCode) => void; disabled?: boolean; onBlocked?: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { palette, t } = useVigil();
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return countries;
    return countries.filter(c => c.name.toLowerCase().includes(term) || c.currency.toLowerCase().includes(term));
  }, [search]);

  const selected = countries.find(c => c.code === value);

  return (
    <>
      <Pressable onPress={() => { if (disabled) { onBlocked?.(); return; } setOpen(true); setSearch(''); }} style={[styles.trigger, { borderColor: palette.border, backgroundColor: palette.card, opacity: disabled ? 0.5 : 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.triggerName, { color: palette.foreground }]}>{selected?.name || 'Select Country'}</Text>
          <Text style={[styles.triggerMeta, { color: palette.mutedForeground }]}>{selected?.currency}{selected && selected.taxPercent > 0 ? ` • ${selected.taxPercent}% ${t('taxGuide')}` : ` • ${t('noTaxBucket')}`}</Text>
        </View>
        <Ionicons name="chevron-down" size={20} color={palette.mutedForeground} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={[styles.modalPage, { backgroundColor: palette.background }]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
              <Pressable onPress={() => setOpen(false)} style={styles.close}><Ionicons name="close" size={24} color={palette.foreground} /></Pressable>
              <Text style={[styles.headerTitle, { color: palette.foreground }]}>{t('selectCountry')}</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={[styles.searchBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Ionicons name="search" size={18} color={palette.mutedForeground} />
              <TextInput autoFocus value={search} onChangeText={setSearch} placeholder={t('searchCountries')} placeholderTextColor={palette.mutedForeground} style={[styles.searchInput, { color: palette.foreground }]} />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={item => item.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => { void Haptics.selectionAsync(); onChange(item.code); setOpen(false); }} style={[styles.countryChoice, { backgroundColor: value === item.code ? palette.accent : palette.card, borderColor: value === item.code ? palette.primary : palette.border }]}>
                  <Text style={[styles.countryName, { color: palette.foreground }]}>{item.name}</Text>
                  <Text style={[styles.countryMeta, { color: palette.mutedForeground }]}>{item.currency}{item.taxPercent > 0 ? ` • ${item.taxPercent}% ${t('taxGuide')}` : ` • ${t('noTaxBucket')}`}</Text>
                </Pressable>
              )}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalPage: { flex: 1 },
  trigger: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center' },
  triggerName: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  triggerMeta: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16, paddingHorizontal: 16, height: 52, borderRadius: 16, borderWidth: 1 },
  searchInput: { flex: 1, marginLeft: 10, fontFamily: 'Inter_500Medium', fontSize: 15, height: '100%' },
  countryChoice: { minHeight: 72, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 },
  countryName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  countryMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
});
