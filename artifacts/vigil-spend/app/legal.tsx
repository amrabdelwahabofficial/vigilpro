import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVigil } from '@/context/AppContext';

export type LegalDocument = 'privacy' | 'terms' | 'use';

export function LegalContent({ document, onClose }: { document: LegalDocument; onClose: () => void }) {
  const { palette, t } = useVigil();
  const insets = useSafeAreaInsets();
  const content = {
    privacy: { title: t('privacyPolicy'), body: t('legalPrivacyBody') },
    terms: { title: t('termsConditions'), body: t('legalTermsBody') },
    use: { title: t('termsOfUse'), body: t('legalUseBody') },
  }[document];

  return (
    <View style={[styles.page, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('cancel')} onPress={onClose} style={[styles.back, { borderColor: palette.border }]}><Ionicons name="arrow-back" size={20} color={palette.foreground} /></Pressable>
        <Text style={[styles.headerTitle, { color: palette.foreground }]}>{content.title}</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 30, 44) }]}>
         <Text style={[styles.body, { color: palette.secondaryForeground }]}>{content.body.replace(/\bClerk\b/g, 'Vigil Spend')}</Text>
        {document === 'use' && <Pressable onPress={() => void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} style={[styles.link, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.linkText, { color: palette.primary }]}>Apple EULA</Text><Ionicons name="open-outline" size={18} color={palette.primary} /></Pressable>}
        <Pressable onPress={() => void Linking.openURL('mailto:support@vigilspend.com')} style={[styles.link, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.linkText, { color: palette.primary }]}>support@vigilspend.com</Text><Ionicons name="mail-outline" size={18} color={palette.primary} /></Pressable>
      </ScrollView>
    </View>
  );
}

export default function LegalScreen() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const selected: LegalDocument = document === 'terms' || document === 'use' ? document : 'privacy';
  
  return <LegalContent document={selected} onClose={() => router.back()} />;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 20 },
  back: { width: 40, height: 40, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 20 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 25 },
  link: { minHeight: 52, marginTop: 18, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});