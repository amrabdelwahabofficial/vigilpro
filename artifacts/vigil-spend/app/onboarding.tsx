import React, { useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CountryCode, Language, ThemeMode, useVigil } from '@/context/AppContext';
import { CountryPicker } from '@/components/CountryPicker';
import { useSubscription } from '@/context/SubscriptionContext';
import { useIdentity } from '@/context/IdentityContext';
import { PaywallContent, Plan } from '@/components/Paywall';

const questionKeys = [
  ['onboardingEyebrow1', 'onboardingTitle1', 'onboardingCopy1', 'onboardingChoices1'],
  ['onboardingEyebrow2', 'onboardingTitle2', 'onboardingCopy2', 'onboardingChoices2'],
  ['onboardingEyebrow3', 'onboardingTitle3', 'onboardingCopy3', 'onboardingChoices3'],
] as const;

const PERSONALIZATION_DURATION_MS = 4500;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { firstName: routeFirstName, appearance: routeAppearance } = useLocalSearchParams<{ firstName?: string; appearance?: string }>();
  const signupFirstName = typeof routeFirstName === 'string' ? routeFirstName.trim() : '';
  const signupAppearance: ThemeMode | null = routeAppearance === 'light' || routeAppearance === 'dark' || routeAppearance === 'auto' ? routeAppearance : null;
  const { isLoaded: authLoaded, isSignedIn, displayName } = useIdentity();
  const { palette, t, language, countryCode, setCountry, completeOnboarding, addIncome, toBaseAmount, hydrated, onboardingComplete, formatNumber, themeMode, setThemeMode, profileFirstName, setProfileFirstName } = useVigil();
  const { configured, error: subscriptionError, loading: subscriptionLoading, monthlyPackage, yearlyPackage, purchase, retry, restore } = useSubscription();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [income, setIncome] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [appearanceConfirmed, setAppearanceConfirmed] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);
  const personalizationProgress = React.useRef(new Animated.Value(0)).current;
  const firstName = displayName?.split(/\s+/)[0] || profileFirstName || signupFirstName;
  const totalSteps = 7;
  const selectedPackage = selectedPlan === 'monthly' ? monthlyPackage : yearlyPackage;
  const canPurchase = configured && !subscriptionLoading && Boolean(selectedPackage);
  const incomePrompt: Record<Language, { title: string; copy: string; placeholder: string }> = {
    en: { title: 'What should Vigil plan around, {name}?', copy: 'Enter your usual salary, the amount you currently have, or another starting amount. Vigil uses it to set your bucket limits.', placeholder: 'Salary or amount on hand' },
    fr: { title: 'Sur quel montant Vigil doit-il se baser, {name} ?', copy: 'Saisissez votre salaire habituel, le montant que vous avez actuellement ou un autre montant de départ.', placeholder: 'Salaire ou montant disponible' },
    cs: { title: 'Z jaké částky má Vigil vycházet, {name}?', copy: 'Zadejte obvyklý příjem, částku, kterou máte právě k dispozici, nebo jinou počáteční částku.', placeholder: 'Příjem nebo částka k dispozici' },
    de: { title: 'Mit welchem Betrag soll Vigil planen, {name}?', copy: 'Gib dein übliches Gehalt, den aktuellen verfügbaren Betrag oder einen anderen Startbetrag ein.', placeholder: 'Gehalt oder verfügbarer Betrag' },
    es: { title: '¿Con qué cantidad debería planificar Vigil, {name}?', copy: 'Introduce tu salario habitual, el dinero que tienes actualmente u otra cantidad inicial.', placeholder: 'Salario o cantidad disponible' },
    ru: { title: 'От какой суммы Vigil должен планировать, {name}?', copy: 'Введите обычный доход, сумму, которая сейчас у вас есть, или другую начальную сумму.', placeholder: 'Доход или доступная сумма' },
    ar: { title: 'على أي مبلغ يخطط Vigil لك، {name}؟', copy: 'أدخل راتبك المعتاد، أو المبلغ المتاح لديك حالياً، أو أي مبلغ ابتدائي آخر.', placeholder: 'الراتب أو المبلغ المتاح' },
  };
  const currentIncomePrompt = incomePrompt[language];

  React.useEffect(() => {
    if (authLoaded && !isSignedIn) router.replace('/sign-in');
    if (hydrated && onboardingComplete) router.replace('/');
  }, [authLoaded, hydrated, isSignedIn, onboardingComplete]);
  React.useEffect(() => {
    if (!profileNameInput && profileFirstName) setProfileNameInput(profileFirstName);
  }, [profileFirstName, profileNameInput]);
  React.useEffect(() => {
    if (hydrated && signupFirstName && profileFirstName !== signupFirstName) {
      setProfileFirstName(signupFirstName);
    }
  }, [hydrated, profileFirstName, setProfileFirstName, signupFirstName]);
  React.useEffect(() => {
    if (hydrated && signupAppearance && themeMode !== signupAppearance) {
      setThemeMode(signupAppearance);
    }
  }, [hydrated, setThemeMode, signupAppearance, themeMode]);
  React.useEffect(() => {
    if (selectedPlan === 'yearly' && !yearlyPackage && monthlyPackage) setSelectedPlan('monthly');
    if (selectedPlan === 'monthly' && !monthlyPackage && yearlyPackage) setSelectedPlan('yearly');
  }, [monthlyPackage, selectedPlan, yearlyPackage]);
  React.useEffect(() => {
    if (step === 5) setSelectedPlan('yearly');
  }, [step]);
  React.useEffect(() => {
    if (!personalizing) {
      personalizationProgress.stopAnimation();
      return;
    }
    personalizationProgress.setValue(0);
    const animation = Animated.timing(personalizationProgress, {
      toValue: 1,
      duration: PERSONALIZATION_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start();
    const timeout = setTimeout(() => {
      setPersonalizing(false);
      setStep(5);
    }, PERSONALIZATION_DURATION_MS);
    return () => {
      clearTimeout(timeout);
      animation.stop();
    };
  }, [personalizationProgress, personalizing]);
  
  const saveFirstName = async () => {
    const cleanName = profileNameInput.trim();
    if (!cleanName) return;
    setProfileFirstName(cleanName);
    try {
      setSavingName(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAppearanceConfirmed(true);
    } catch {
      // The locally scoped name remains available even when profile sync is unavailable.
    } finally {
      setSavingName(false);
    }
  };
  const continueAppearance = async () => {
    setAppearanceConfirmed(true);
    await Haptics.selectionAsync();
  };
  const finishFree = async () => {
    completeOnboarding();
    router.replace('/');
  };
  const nextAnswer = async (answer: string) => {
    if (selectedChoice) return;
    setSelectedChoice(answer);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAnswers((current) => [...current.slice(0, step), answer]);
    setTimeout(() => {
      setStep((current) => current + 1);
      setSelectedChoice(null);
    }, 180);
  };
  const handlePurchase = async () => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const outcome = await purchase(selectedPlan);
      if (outcome === 'cancelled') return;
      if (outcome !== 'purchased') {
        Alert.alert(t('subscriptionNotActive'), t('pleaseTryAgain'));
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      completeOnboarding();
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('pleaseTryAgain');
      Alert.alert(t('purchaseIncomplete'), `${t('nothingChargedRestore')} ${message}`);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restore();
      Alert.alert(t('restorePurchases'), restored ? t('proUnlocked') : t('noPurchaseFound'));
      if (restored) {
        completeOnboarding();
        router.replace('/');
      }
    } catch (error) {
      Alert.alert(t('restorePurchases'), error instanceof Error ? error.message : t('restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };
  const displayStep = appearanceConfirmed ? Math.min(step + 2, totalSteps) : 1;
  const progress = `${(displayStep / totalSteps) * 100}%` as `${number}%`;
  const primaryPressure = answers[0] || 'the pressure you named';
  const desiredRelief = answers[2] || 'more breathing room';
  return (
    <View style={[styles.page, { backgroundColor: palette.background, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.topRow}>
        <Text style={[styles.brand, { color: palette.foreground }]}>VIGIL</Text>
        <Text style={[styles.stepText, { color: palette.mutedForeground }]}>{formatNumber(displayStep)} / {formatNumber(totalSteps)}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: palette.track }]}><View style={[styles.progressFill, { width: progress, backgroundColor: palette.primary }]} /></View>
      {personalizing ? <View style={styles.personalizingContent}>
        <View style={[styles.personalizingIcon, { backgroundColor: palette.accent }]}>
          <ActivityIndicator size="small" color={palette.primary} />
        </View>
        <Text style={[styles.eyebrow, { color: palette.primary }]}>{t('personalizingEyebrow')}</Text>
        <Text style={[styles.title, { color: palette.foreground }]}>{t('personalizingTitle').replace('{name}', firstName ? `, ${firstName}` : '')}</Text>
        <Text style={[styles.copy, { color: palette.mutedForeground }]}>{t('personalizingCopy')}</Text>
         <View
           accessibilityRole="progressbar"
           accessibilityLabel={t('personalizingEyebrow')}
           style={[styles.personalizingProgressTrack, { backgroundColor: palette.track }]}
         >
           <Animated.View
             style={[
               styles.personalizingProgressFill,
               {
                 backgroundColor: palette.primary,
                 width: personalizationProgress.interpolate({
                   inputRange: [0, 1],
                   outputRange: ['0%', '100%'],
                 }),
               },
             ]}
           />
         </View>
        <View style={[styles.personalizingCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.personalizingRow}>
            <Ionicons name="checkmark-circle" size={20} color={palette.positive} />
            <View style={styles.personalizingRowCopy}>
              <Text style={[styles.personalizingLabel, { color: palette.mutedForeground }]}>{t('personalizingAnswerLabel')}</Text>
              <Text style={[styles.personalizingValue, { color: palette.foreground }]} numberOfLines={2}>{primaryPressure}</Text>
            </View>
          </View>
          <View style={[styles.personalizingDivider, { backgroundColor: palette.border }]} />
          <View style={styles.personalizingRow}>
            <Ionicons name="sparkles-outline" size={20} color={palette.primary} />
            <View style={styles.personalizingRowCopy}>
              <Text style={[styles.personalizingLabel, { color: palette.mutedForeground }]}>{t('personalizingReliefLabel')}</Text>
              <Text style={[styles.personalizingValue, { color: palette.foreground }]} numberOfLines={2}>{desiredRelief}</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.personalizingFootnote, { color: palette.mutedForeground }]}>{t('personalizingFootnote')}</Text>
      </View> : !appearanceConfirmed ? <View style={styles.content}>
        {!firstName && <><Text style={[styles.eyebrow, { color: palette.primary }]}>{t('profile').toUpperCase()}</Text>
        <Text style={[styles.title, { color: palette.foreground }]}>{t('completeProfile')}</Text>
        <Text style={[styles.copy, { color: palette.mutedForeground }]}>{t('completeProfileCopy')}</Text>
        <TextInput testID="profile-first-name" value={profileNameInput} onChangeText={setProfileNameInput} placeholder={t('firstName')} placeholderTextColor={palette.mutedForeground} autoComplete="given-name" autoCapitalize="words" style={[styles.input, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} /></>}
        <Text style={[styles.appearancePrompt, { color: palette.foreground }]}>{t('chooseAppearance')}</Text>
        <View style={styles.themeChoices}>{([{ id: 'light', label: t('themeLight'), icon: 'sunny-outline' }, { id: 'dark', label: t('themeDark'), icon: 'moon-outline' }, { id: 'auto', label: t('themeAuto'), icon: 'contrast-outline' }] as const).map((theme) => <Pressable key={theme.id} onPress={() => setThemeMode(theme.id)} style={[styles.themeChoice, { backgroundColor: themeMode === theme.id ? palette.accent : palette.card, borderColor: themeMode === theme.id ? palette.primary : palette.border }]}><Ionicons name={theme.icon} size={17} color={themeMode === theme.id ? palette.primary : palette.mutedForeground} /><Text style={[styles.themeChoiceText, { color: themeMode === theme.id ? palette.primary : palette.foreground }]}>{theme.label}</Text></Pressable>)}</View>
        <Pressable testID={firstName ? 'continue-appearance' : 'save-first-name'} disabled={(!firstName && !profileNameInput.trim()) || savingName} onPress={() => void (firstName ? continueAppearance() : saveFirstName())} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: ((!firstName && !profileNameInput.trim()) || savingName) ? 0.5 : 1 }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{savingName ? '…' : firstName ? t('continueLabel') : t('saveContinue')}</Text></Pressable>
      </View> : appearanceConfirmed && <>

      {step < 3 && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
           <Text style={[styles.eyebrow, { color: palette.primary }]}>{t(questionKeys[step][0]).toUpperCase()}</Text>
           <Text style={[styles.title, { color: palette.foreground }]}>{t(questionKeys[step][1])}</Text>
           <Text style={[styles.copy, { color: palette.mutedForeground }]}>{t(questionKeys[step][2])}</Text>
          <View style={styles.choiceList}>
             {t(questionKeys[step][3]).split('|').map((choice) => (
              <Pressable key={choice} onPress={() => void nextAnswer(choice)} style={({ pressed }) => [styles.choice, { backgroundColor: selectedChoice === choice ? palette.accent : palette.card, borderColor: selectedChoice === choice ? palette.primary : palette.border }, pressed && styles.pressed]}>
                <Text style={[styles.choiceText, { color: selectedChoice === choice ? palette.primary : palette.foreground }]}>{choice}</Text>
                <Ionicons name={selectedChoice === choice ? 'checkmark-circle' : 'arrow-forward'} size={19} color={palette.primary} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {step === 3 && (
        <ScrollView contentContainerStyle={styles.content}>
           <Text style={[styles.eyebrow, { color: palette.primary }]}>{t('makeItYours')}</Text>
           <Text style={[styles.title, { color: palette.foreground }]}>{t('homeQuestion')}</Text>
           <Text style={[styles.copy, { color: palette.mutedForeground }]}>{t('homeCopy')}</Text>
          <View style={styles.countryGrid}>
            <CountryPicker value={countryCode} onChange={setCountry} />
          </View>
           <Pressable onPress={() => { void Haptics.selectionAsync(); setStep(4); }} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{t('continueLabel')}</Text></Pressable>
        </ScrollView>
      )}

      {step === 4 && (
        <View style={styles.content}>
           <Text style={[styles.eyebrow, { color: palette.primary }]}>{t('startingPoint')}</Text>
           <Text style={[styles.title, { color: palette.foreground }]}>{currentIncomePrompt.title.replace('{name}', firstName)}</Text>
           <Text style={[styles.copy, { color: palette.mutedForeground }]}>{currentIncomePrompt.copy}</Text>
           <TextInput value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder={currentIncomePrompt.placeholder} placeholderTextColor={palette.mutedForeground} style={[styles.input, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} />
            <Pressable onPress={() => { const value = Number(income); if (value > 0) addIncome(toBaseAmount(value)); void Haptics.selectionAsync(); setPersonalizing(true); }} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{t('showPlan')}</Text></Pressable>
        </View>
      )}

      {step === 5 && (
        <PaywallContent
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          onPurchase={handlePurchase}
          onRestore={handleRestore}
          onClose={finishFree}
          onContinueBasic={finishFree}
          onRetry={retry}
          yearlyPackage={yearlyPackage}
          monthlyPackage={monthlyPackage}
          loading={subscriptionLoading}
          purchasing={purchasing}
          restoring={restoring}
          configured={configured}
        />
      )}
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 1 },
  stepText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 15, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  content: { flexGrow: 1, paddingTop: 42, paddingBottom: 24 },
  personalizingContent: { flex: 1, paddingTop: 58, paddingBottom: 24, alignItems: 'center' },
  personalizingIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  personalizingProgressTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 28 },
  personalizingProgressFill: { height: '100%', borderRadius: 3 },
  personalizingCard: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 17, marginTop: 28, gap: 15 },
  personalizingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  personalizingRowCopy: { flex: 1 },
  personalizingLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  personalizingValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20, marginTop: 4 },
  personalizingDivider: { height: 1, width: '100%' },
  personalizingFootnote: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 18, maxWidth: 300 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 39, marginTop: 10 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 10 },
  choiceList: { gap: 11, marginTop: 30 },
  choice: { minHeight: 61, borderWidth: 1, borderRadius: 18, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  countryGrid: { gap: 9, marginTop: 24 },
  countryChoice: { borderWidth: 1, borderRadius: 16, padding: 14 },
  countryName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  countryMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  primaryButton: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  input: { minHeight: 58, borderRadius: 17, borderWidth: 1, paddingHorizontal: 16, fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 27 },
  appearancePrompt: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 24 },
  themeChoices: { flexDirection: 'row', gap: 8, marginTop: 10 },
  themeChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  themeChoiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  featureCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 11, marginTop: 23 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureText: { fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1 },
  planChoice: { minHeight: 69, borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  planTrial: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  planPrice: { fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 5 },
  bestBadge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  bestText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 },
  textButton: { alignItems: 'center', paddingVertical: 9 },
  textButtonLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  freeText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  finePrint: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 3 },
  zeroCard: { borderRadius: 20, padding: 17, marginTop: 22 },
  zeroAmount: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  zeroCopy: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 5 },
  planList: { marginTop: 12 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
});