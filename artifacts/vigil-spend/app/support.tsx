import React, { useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVigil } from '@/context/AppContext';
import { useIdentity } from '@/context/IdentityContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { supportCopy } from '@/lib/supportCopy';

type Category = 'Account' | 'Subscription' | 'Transactions' | 'Technical Issue' | 'Feedback' | 'Other';
const categories: Category[] = ['Account', 'Subscription', 'Transactions', 'Technical Issue', 'Feedback', 'Other'];

function apiUrl(path: string) {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (explicit) return `${explicit}${path}`;
  if (!domain) throw new Error('The secure API is not configured.');
  return `https://${domain}${path}`;
}

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { palette, language } = useVigil();
  const { getToken } = useIdentity();
  const { isPro } = useSubscription();
  const copy = supportCopy(language);
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [category, setCategory] = useState<Category>('Technical Issue');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<{ uri: string; data: string; mimeType: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return copy.faqs.filter((faq) => !normalized || `${faq.question} ${faq.answer}`.toLocaleLowerCase().includes(normalized));
  }, [copy.faqs, query]);

  const addAttachment = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.75,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    if (base64.length > 2_800_000) {
      setError(copy.imageTooLarge);
      return;
    }
    setError('');
    setAttachment({
      uri: asset.uri,
      data: base64,
      mimeType: asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg',
      name: asset.fileName || 'support-screenshot.jpg',
    });
  };

  const submit = async () => {
    if (!subject.trim()) {
      setError(copy.missingSubject);
      return;
    }
    if (message.trim().length < 10) {
      setError(copy.missingMessage);
      return;
    }
    setSending(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error(copy.submitError);
      const response = await fetch(apiUrl('/api/vigil/support-requests'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
          language,
          plan: isPro ? 'pro' : 'free',
          appVersion: Constants.expoConfig?.version ?? '1.0.1',
          osVersion: `${Platform.OS} ${String(Platform.Version)}`,
          attachment: attachment ? { data: attachment.data, mimeType: attachment.mimeType, name: attachment.name } : null,
        }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || copy.submitError);
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.submitError);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.background, paddingTop: insets.top, direction: language === 'ar' ? 'rtl' : 'ltr' }]}>
        <View style={[styles.successIcon, { backgroundColor: palette.positiveSoft, borderColor: palette.positive }]}><Ionicons name="checkmark" size={24} color={palette.positive} /></View>
        <Text style={[styles.successTitle, { color: palette.foreground }]}>{copy.requestSent}</Text>
        <Text style={[styles.successCopy, { color: palette.mutedForeground }]}>{copy.requestSentCopy}</Text>
        <Pressable onPress={() => router.back()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{copy.backToSupport}</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: palette.background, paddingTop: insets.top, direction: language === 'ar' ? 'rtl' : 'ltr' }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={22} color={palette.foreground} /></Pressable>
        <View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: palette.primary }]}>{copy.helpSupport.toUpperCase()}</Text><Text style={[styles.title, { color: palette.foreground }]}>{copy.supportTitle}</Text></View>
      </View>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 26, 34) }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: palette.mutedForeground }]}>{copy.supportIntro}</Text>
        <Text style={[styles.sectionTitle, { color: palette.foreground }]}>{copy.faqTitle}</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder={copy.faqSearch} placeholderTextColor={palette.mutedForeground} style={[styles.search, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} />
        <View style={styles.faqList}>
          {filteredFaqs.map((faq, index) => (
            <Pressable key={faq.question} onPress={() => setOpenFaq(openFaq === index ? null : index)} style={[styles.faqCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.faqQuestion}><Text style={[styles.faqQuestionText, { color: palette.foreground }]}>{faq.question}</Text><Ionicons name={openFaq === index ? 'chevron-up' : 'chevron-down'} size={17} color={palette.mutedForeground} /></View>
              {openFaq === index && <Text style={[styles.faqAnswer, { color: palette.mutedForeground }]}>{faq.answer}</Text>}
            </Pressable>
          ))}
        </View>
        <Text style={[styles.sectionTitle, { color: palette.foreground }]}>{copy.contactTitle}</Text>
        <Text style={[styles.contactCopy, { color: palette.mutedForeground }]}>{copy.contactCopy}</Text>
        <Text style={[styles.label, { color: palette.foreground }]}>{copy.category}</Text>
        <View style={styles.categoryGrid}>
          {categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, { borderColor: category === item ? palette.primary : palette.border, backgroundColor: category === item ? palette.accent : palette.card }]}><Text style={[styles.categoryText, { color: category === item ? palette.primary : palette.foreground }]}>{copy.categories[item]}</Text></Pressable>)}
        </View>
        <Text style={[styles.label, { color: palette.foreground }]}>{copy.subject}</Text>
        <TextInput value={subject} onChangeText={setSubject} placeholder={copy.subjectPlaceholder} placeholderTextColor={palette.mutedForeground} maxLength={180} style={[styles.input, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} />
        <Text style={[styles.label, { color: palette.foreground }]}>{copy.message}</Text>
        <TextInput value={message} onChangeText={setMessage} placeholder={copy.messagePlaceholder} placeholderTextColor={palette.mutedForeground} multiline maxLength={8000} textAlignVertical="top" style={[styles.messageInput, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} />
        <Text style={[styles.label, { color: palette.foreground }]}>{copy.attachment}</Text>
        {attachment ? <View style={[styles.attachmentCard, { backgroundColor: palette.card, borderColor: palette.border }]}><Image source={{ uri: attachment.uri }} style={styles.attachmentImage} /><Text style={[styles.attachmentName, { color: palette.foreground }]} numberOfLines={1}>{attachment.name}</Text><Pressable onPress={() => setAttachment(null)}><Text style={[styles.removeText, { color: palette.primary }]}>{copy.removeImage}</Text></Pressable></View> : <Pressable onPress={() => void addAttachment()} style={[styles.attachButton, { backgroundColor: palette.card, borderColor: palette.border }]}><Ionicons name="image-outline" size={20} color={palette.primary} /><Text style={[styles.attachText, { color: palette.foreground }]}>{copy.addImage}</Text></Pressable>}
        <Text style={[styles.privacyNote, { color: palette.mutedForeground }]}>{copy.privacyNote}</Text>
        {!!error && <View style={[styles.errorBanner, { backgroundColor: palette.warningSoft, borderColor: palette.warning }]}><Ionicons name="warning-outline" size={18} color={palette.warning} /><Text style={[styles.errorText, { color: palette.foreground }]}>{error}</Text></View>}
        <Pressable disabled={sending} onPress={() => void submit()} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: sending ? 0.65 : 1 }]}>{sending ? <ActivityIndicator color={palette.primaryForeground} /> : <><Ionicons name="paper-plane-outline" size={18} color={palette.primaryForeground} /><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{copy.sendRequest}</Text></>}</Pressable>
        <Text style={[styles.emailNote, { color: palette.mutedForeground }]}>{copy.supportEmail}</Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  title: { fontSize: 26, fontWeight: '700', marginTop: 3 },
  content: { paddingBottom: 30 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 5 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 14 },
  faqList: { gap: 8 },
  faqCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faqQuestionText: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  faqAnswer: { fontSize: 13, lineHeight: 19, marginTop: 9 },
  contactCopy: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 15, marginBottom: 8 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9 },
  categoryText: { fontSize: 11, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 14 },
  messageInput: { minHeight: 130, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14 },
  attachButton: { minHeight: 52, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  attachText: { fontSize: 13, fontWeight: '600' },
  attachmentCard: { minHeight: 64, borderWidth: 1, borderRadius: 14, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  attachmentImage: { width: 48, height: 48, borderRadius: 9 },
  attachmentName: { flex: 1, fontSize: 12, fontWeight: '600' },
  removeText: { fontSize: 11, fontWeight: '700' },
  privacyNote: { fontSize: 11, lineHeight: 16, marginTop: 12 },
  errorBanner: { borderWidth: 1, borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  primaryButton: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 16 },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  emailNote: { fontSize: 11, textAlign: 'center', marginTop: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  successIcon: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 26, fontWeight: '700', marginTop: 20 },
  successCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
});