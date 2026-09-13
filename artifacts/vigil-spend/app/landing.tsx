import React from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useIdentity } from '@/context/IdentityContext';

const features = [
  {
    icon: '01',
    title: 'Capture spending quickly',
    copy: 'Log a purchase, receipt, voice note, or bank message before it gets lost in the month.',
  },
  {
    icon: '02',
    title: 'See what is still available',
    copy: 'Simple buckets show where your money is going and what each decision leaves behind.',
  },
  {
    icon: '03',
    title: 'Plan without the guilt',
    copy: 'Vigil turns money pressure into a clear next step, with deeper insights when you want them.',
  },
];

export default function LandingScreen() {
  const { isLoaded, isSignedIn } = useIdentity();

  const openApp = () => {
    router.push(isLoaded && isSignedIn ? '/' : '/sign-in');
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logoFrame}>
            <Image source={require('@/assets/images/icon-transparent.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.brandName}>VIGIL</Text>
        </View>
        <Pressable onPress={openApp} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <Text style={styles.headerButtonText}>{isLoaded && isSignedIn ? 'Open app' : 'Sign in'}</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>KNOW WHERE IT ALL GOES</Text>
        <Text style={styles.title}>Awareness is the first step to real change.</Text>
        <Text style={styles.heroCopy}>
          Vigil helps you notice spending, protect what matters, and make the next money decision consciously.
        </Text>
        <Pressable onPress={openApp} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{isLoaded && isSignedIn ? 'Open Vigil' : 'Get started'}</Text>
        </Pressable>
        <Text style={styles.disclaimer}>Free to start. Your financial data stays on your device.</Text>
      </View>

      <View style={styles.featureGrid}>
        {features.map((feature) => (
          <View key={feature.icon} style={styles.featureCard}>
            <Text style={styles.featureNumber}>{feature.icon}</Text>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureCopy}>{feature.copy}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerBrand}>VIGIL</Text>
        <Text style={styles.footerCopy}>A clearer relationship with the money you already have.</Text>
        <Pressable onPress={() => router.push('/legal')}><Text style={styles.footerLink}>Privacy and terms</Text></Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fffaf9' },
  content: { paddingBottom: 48 },
  header: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'web' ? 26 : 18,
    paddingBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoFrame: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#ef3340', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 24, height: 24 },
  brandName: { color: '#17181c', fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 3.2 },
  headerButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#e4dedd' },
  headerButtonText: { color: '#17181c', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  hero: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'web' ? 86 : 56,
    paddingBottom: Platform.OS === 'web' ? 92 : 64,
  },
  eyebrow: { color: '#ef3340', fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.8, textAlign: 'center' },
  title: { maxWidth: 760, marginTop: 18, color: '#17181c', fontFamily: 'Inter_700Bold', fontSize: 54, lineHeight: 61, letterSpacing: -1.5, textAlign: 'center' },
  heroCopy: { maxWidth: 610, marginTop: 22, color: '#666871', fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 28, textAlign: 'center' },
  primaryButton: { marginTop: 32, paddingHorizontal: 28, paddingVertical: 16, minWidth: 154, borderRadius: 15, backgroundColor: '#ef3340', alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  disclaimer: { marginTop: 14, color: '#85868d', fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' },
  featureGrid: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 28, flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  featureCard: { flex: 1, minWidth: 220, padding: 24, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#eee6e4' },
  featureNumber: { color: '#ef3340', fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 },
  featureTitle: { marginTop: 24, color: '#17181c', fontFamily: 'Inter_700Bold', fontSize: 18 },
  featureCopy: { marginTop: 10, color: '#666871', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  footer: { width: '100%', maxWidth: 1120, alignSelf: 'center', marginTop: 72, paddingHorizontal: 28, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#eee6e4' },
  footerBrand: { color: '#17181c', fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2.2 },
  footerCopy: { marginTop: 8, color: '#85868d', fontFamily: 'Inter_400Regular', fontSize: 12 },
  footerLink: { marginTop: 14, color: '#ef3340', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  pressed: { opacity: 0.82 },
});