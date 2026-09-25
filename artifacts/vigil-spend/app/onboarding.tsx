import React, { useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Language, ThemeMode, useVigil } from '@/context/AppContext';
import { CountryPicker } from '@/components/CountryPicker';
import { useSubscription } from '@/context/SubscriptionContext';
import { useIdentity } from '@/context/IdentityContext';
import { PaywallContent, Plan } from '@/components/Paywall';
import { standardizeVisibleBrandCopy } from '@/lib/brand';
import {
  formatOnboardingTemplate,
  getOnboardingChoiceLabel,
  getOrderedOnboardingFeatures,
  getValidOnboardingAnswers,
  ONBOARDING_QUESTION_COUNT,
  ONBOARDING_QUESTIONS,
  ONBOARDING_RESULT_FEATURES,
} from '@/lib/onboardingFlow';

const COUNTRY_STEP = ONBOARDING_QUESTION_COUNT;
const INCOME_STEP = COUNTRY_STEP + 1;
const RELIEF_STEP = COUNTRY_STEP + 2;
const RESULT_STEP = RELIEF_STEP + 1;
const PAYWALL_STEP = RESULT_STEP + 1;
const PERSONALIZATION_DURATION_MS = 1800;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { firstName: routeFirstName, appearance: routeAppearance } = useLocalSearchParams<{ firstName?: string; appearance?: string }>();
  const signupFirstName = typeof routeFirstName === 'string' ? routeFirstName.trim() : '';
  const signupAppearance: ThemeMode | null = routeAppearance === 'light' || routeAppearance === 'dark' || routeAppearance === 'auto' ? routeAppearance : null;
  const { isLoaded: authLoaded, isSignedIn, displayName, userId } = useIdentity();
  const { palette, t, language, countryCode, currency, income: accountIncome, incomeEntries, setCountry, onboardingAnswers, saveOnboardingAnswers, completeOnboarding, addIncome, toBaseAmount, hasCurrentRate, hydrated, onboardingComplete, formatNumber, themeMode, setThemeMode, profileFirstName, setProfileFirstName } = useVigil();
  const { configured, loading: subscriptionLoading, monthlyPackage, yearlyPackage, yearlyTrialEligible, purchase, retry, restore } = useSubscription();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [income, setIncome] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [appearanceConfirmed, setAppearanceConfirmed] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);
  const [transitionMessageIndex, setTransitionMessageIndex] = useState(0);
  const personalizationProgress = React.useRef(new Animated.Value(0)).current;
  const incomeSubmitLock = React.useRef(false);
  const firstName = displayName?.split(/\s+/)[0] || profileFirstName || signupFirstName;
  const selectedPackage = selectedPlan === 'monthly' ? monthlyPackage : yearlyPackage;
  const canPurchase = configured && !subscriptionLoading && Boolean(selectedPackage);
  const incomePrompt: Record<Language, { title: string; copy: string; placeholder: string }> = {
    en: { title: 'What should Vigil Spend plan around, {name}?', copy: 'Enter your usual salary, the amount you currently have, or another starting amount. Vigil Spend uses it to set your bucket limits.', placeholder: 'Salary or amount on hand' },
    fr: { title: 'Sur quel montant Vigil doit-il se baser, {name} ?', copy: 'Saisissez votre salaire habituel, le montant que vous avez actuellement ou un autre montant de départ.', placeholder: 'Salaire ou montant disponible' },
    cs: { title: 'Z jaké částky má Vigil vycházet, {name}?', copy: 'Zadejte obvyklý příjem, částku, kterou máte právě k dispozici, nebo jinou počáteční částku.', placeholder: 'Příjem nebo částka k dispozici' },
    de: { title: 'Mit welchem Betrag soll Vigil planen, {name}?', copy: 'Gib dein übliches Gehalt, den aktuellen verfügbaren Betrag oder einen anderen Startbetrag ein.', placeholder: 'Gehalt oder verfügbarer Betrag' },
    es: { title: '¿Con qué cantidad debería planificar Vigil, {name}?', copy: 'Introduce tu salario habitual, el dinero que tienes actualmente u otra cantidad inicial.', placeholder: 'Salario o cantidad disponible' },
    ru: { title: 'От какой суммы Vigil должен планировать, {name}?', copy: 'Введите обычный доход, сумму, которая сейчас у вас есть, или другую начальную сумму.', placeholder: 'Доход или доступная сумма' },
    ar: { title: 'على أي مبلغ يخطط Vigil لك، {name}؟', copy: 'أدخل راتبك المعتاد، أو المبلغ المتاح لديك حالياً، أو أي مبلغ ابتدائي آخر.', placeholder: 'الراتب أو المبلغ المتاح' },
  };
  const currentIncomePrompt = standardizeVisibleBrandCopy(incomePrompt[language]);

  React.useEffect(() => {
    if (authLoaded && !isSignedIn) router.replace('/sign-in');
    if (hydrated && onboardingComplete) router.replace('/');
  }, [authLoaded, hydrated, isSignedIn, onboardingComplete]);
  React.useEffect(() => {
    if (draftScope !== null && draftScope !== userId) {
      setDraftLoaded(false);
      setAnswers([]);
      setStep(0);
      setSelectedChoice(null);
      setIncome('');
      setAppearanceConfirmed(false);
      setPersonalizing(false);
      setProfileNameInput('');
    }
    if (!hydrated || !userId || draftScope === userId) return;
    const savedAnswers = getValidOnboardingAnswers(onboardingAnswers);
    setAnswers(savedAnswers);
    const hasIncomeSetup = accountIncome > 0 || incomeEntries.length > 0;
    setStep(savedAnswers.length === ONBOARDING_QUESTION_COUNT && hasIncomeSetup ? RELIEF_STEP : savedAnswers.length);
    if (savedAnswers.length !== onboardingAnswers.length) saveOnboardingAnswers(savedAnswers);
    setDraftScope(userId);
    setDraftLoaded(true);
  }, [accountIncome, draftLoaded, draftScope, hydrated, incomeEntries.length, onboardingAnswers, saveOnboardingAnswers, userId]);
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
    if (step === PAYWALL_STEP) setSelectedPlan('yearly');
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
    const messageInterval = setInterval(() => {
      setTransitionMessageIndex((current) => (current + 1) % 3);
    }, PERSONALIZATION_DURATION_MS / 3);
    const timeout = setTimeout(() => {
      setPersonalizing(false);
      setStep(RESULT_STEP);
    }, PERSONALIZATION_DURATION_MS);
    return () => {
      clearTimeout(timeout);
      clearInterval(messageInterval);
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
    completeOnboarding(answers);
    router.replace('/');
  };
  const nextAnswer = async (answerId: string) => {
    if (selectedChoice || !draftLoaded) return;
    setSelectedChoice(answerId);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextAnswers = getValidOnboardingAnswers([...answers.slice(0, step), answerId]);
    setAnswers(nextAnswers);
    saveOnboardingAnswers(nextAnswers);
    setTimeout(() => {
      setStep(step + 1);
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
      completeOnboarding(answers);
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
        completeOnboarding(answers);
        router.replace('/');
      }
    } catch (error) {
      Alert.alert(t('restorePurchases'), error instanceof Error ? error.message : t('restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };
  const startPlanPersonalization = async () => {
    setTransitionMessageIndex(0);
    setPersonalizing(true);
    await Haptics.selectionAsync();
  };
  const isQuestionScreen = appearanceConfirmed && step < ONBOARDING_QUESTION_COUNT;
  const progressWidth = (
    !appearanceConfirmed
      ? '0%'
      : isQuestionScreen
        ? `${((step + 1) / ONBOARDING_QUESTION_COUNT) * 100}%`
        : '100%'
  ) as `${number}%`;
  const progressStepText = isQuestionScreen
    ? `${formatNumber(step + 1)} / ${formatNumber(ONBOARDING_QUESTION_COUNT)}`
    : '';
  const textAlign = language === 'ar' ? 'right' : 'left';
  const currentQuestion = isQuestionScreen ? ONBOARDING_QUESTIONS[step] : null;
  const currentChoices = currentQuestion ? t(currentQuestion.choicesKey).split('|') : [];
  const questionProgressLabel = currentQuestion
    ? formatOnboardingTemplate(t('onboardingFlowQuestionProgress'), {
      current: formatNumber(step + 1),
      total: formatNumber(ONBOARDING_QUESTION_COUNT),
    })
    : '';
  const goalIndex = (ONBOARDING_QUESTIONS[0].answerIds as readonly string[]).indexOf(answers[0]);
  const frictionIndex = (ONBOARDING_QUESTIONS[4].answerIds as readonly string[]).indexOf(answers[4]);
  const goalPhrase = t('onboardingFlowGoalPhrases').split('|')[goalIndex] ?? '';
  const frictionPhrase = t('onboardingFlowFrictionPhrases').split('|')[frictionIndex] ?? '';
  const reliefCopy = formatOnboardingTemplate(t('onboardingFlowReliefTemplate'), {
    goal: goalPhrase,
    friction: frictionPhrase,
  });
  const resultCopy = formatOnboardingTemplate(t('onboardingFlowResultTemplate'), {
    goal: goalPhrase,
    friction: frictionPhrase,
  });
  const desiredOutcome = getOnboardingChoiceLabel(t, 5, answers[5]);
  const paywallGoal = formatOnboardingTemplate(t('onboardingFlowPaywallGoalTemplate'), {
    goal: desiredOutcome,
  });
  const transitionMessages = [
    t('onboardingFlowTransition1'),
    t('onboardingFlowTransition2'),
    t('onboardingFlowTransition3'),
  ];
  const orderedFeatures = getOrderedOnboardingFeatures(answers[4]);
  return (
    <View style={[styles.page, { backgroundColor: palette.background, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16), direction: language === 'ar' ? 'rtl' : 'ltr' }]}>
      <View style={styles.topRow}>
        {appearanceConfirmed && !personalizing && step < PAYWALL_STEP ? (
          <Pressable
            accessibilityLabel={t('back')}
            onPress={() => {
              setSelectedChoice(null);
              if (step === 0) {
                setAppearanceConfirmed(false);
              } else if (step === RESULT_STEP) {
                setStep(RELIEF_STEP);
              } else {
                setStep((current) => Math.max(0, current - 1));
              }
            }}
            style={styles.backButton}
          >
            <Ionicons name={language === 'ar' ? 'arrow-forward' : 'arrow-back'} size={18} color={palette.foreground} />
            <Text style={[styles.backButtonText, { color: palette.foreground }]}>{t('back')}</Text>
          </Pressable>
        ) : <View />}
        <Text style={[styles.brand, { color: palette.foreground }]}>Vigil Spend</Text>
        <Text accessibilityLabel={questionProgressLabel} style={[styles.stepText, { color: palette.mutedForeground, textAlign }]}>{progressStepText}</Text>
      </View>
      {appearanceConfirmed && step < PAYWALL_STEP && (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={questionProgressLabel || t('onboardingFlowEyebrow')}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(parseFloat(progressWidth)) }}
          style={[styles.progressTrack, { backgroundColor: palette.track }]}
        >
          <View style={[styles.progressFill, { width: progressWidth, backgroundColor: palette.primary }]} />
        </View>
      )}
      {personalizing ? <View style={styles.transitionContent}>
        <View style={[styles.personalizingIcon, { backgroundColor: palette.accent }]}>
          <ActivityIndicator size="small" color={palette.primary} />
        </View>
        <Text style={[styles.eyebrow, { color: palette.primary, textAlign: 'center' }]}>{t('onboardingFlowEyebrow')}</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.transitionMessage, { color: palette.foreground }]}>
          {transitionMessages[transitionMessageIndex]}
        </Text>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={transitionMessages[transitionMessageIndex]}
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
      </View> : !appearanceConfirmed ? <View style={styles.content}>
        {!firstName && <><Text style={[styles.eyebrow, { color: palette.primary }]}>{t('profile').toUpperCase()}</Text>
        <Text style={[styles.title, { color: palette.foreground }]}>{t('completeProfile')}</Text>
        <Text style={[styles.copy, { color: palette.mutedForeground }]}>{t('completeProfileCopy')}</Text>
        <TextInput testID="profile-first-name" value={profileNameInput} onChangeText={setProfileNameInput} placeholder={t('firstName')} placeholderTextColor={palette.mutedForeground} autoComplete="given-name" autoCapitalize="words" style={[styles.input, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border, textAlign }]} /></>}
        <Text style={[styles.appearancePrompt, { color: palette.foreground }]}>{t('chooseAppearance')}</Text>
        <View style={styles.themeChoices}>{([{ id: 'light', label: t('themeLight'), icon: 'sunny-outline' }, { id: 'dark', label: t('themeDark'), icon: 'moon-outline' }, { id: 'auto', label: t('themeAuto'), icon: 'contrast-outline' }] as const).map((theme) => <Pressable key={theme.id} onPress={() => setThemeMode(theme.id)} style={[styles.themeChoice, { backgroundColor: themeMode === theme.id ? palette.accent : palette.card, borderColor: themeMode === theme.id ? palette.primary : palette.border }]}><Ionicons name={theme.icon} size={17} color={themeMode === theme.id ? palette.primary : palette.mutedForeground} /><Text style={[styles.themeChoiceText, { color: themeMode === theme.id ? palette.primary : palette.foreground }]}>{theme.label}</Text></Pressable>)}</View>
        <Pressable testID={firstName ? 'continue-appearance' : 'save-first-name'} disabled={!draftLoaded || ((!firstName && !profileNameInput.trim()) || savingName)} onPress={() => void (firstName ? continueAppearance() : saveFirstName())} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: (!draftLoaded || (!firstName && !profileNameInput.trim()) || savingName) ? 0.5 : 1 }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{savingName ? '…' : firstName ? t('continueLabel') : t('saveContinue')}</Text></Pressable>
      </View> : appearanceConfirmed && <>

      {currentQuestion && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.eyebrow, { color: palette.primary }]}>{t('onboardingFlowEyebrow').toUpperCase()}</Text>
          <Text testID={`onboarding-question-${step + 1}`} style={[styles.title, { color: palette.foreground, textAlign }]}>{t(currentQuestion.titleKey)}</Text>
          {currentQuestion.supportKey ? <Text style={[styles.copy, { color: palette.mutedForeground, textAlign }]}>{t(currentQuestion.supportKey)}</Text> : null}
          <View style={styles.choiceList}>
            {currentQuestion.answerIds.map((choiceId, choiceIndex) => {
              const choice = currentChoices[choiceIndex] ?? choiceId;
              const selected = selectedChoice === choiceId || (!selectedChoice && answers[step] === choiceId);
               return (
                <Pressable
                  key={choiceId}
                  testID={`onboarding-answer-${choiceId}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => void nextAnswer(choiceId)}
                  style={({ pressed }) => [
                    styles.choice,
                    { backgroundColor: selected ? palette.accent : palette.card, borderColor: selected ? palette.primary : palette.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.choiceText, { color: selected ? palette.primary : palette.foreground, textAlign }]}>{choice}</Text>
                  <Ionicons name={selected ? 'checkmark-circle' : language === 'ar' ? 'arrow-back' : 'arrow-forward'} size={19} color={palette.primary} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {step === COUNTRY_STEP && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.eyebrow, { color: palette.primary }]}>{t('makeItYours')}</Text>
          <Text style={[styles.title, { color: palette.foreground, textAlign }]}>{t('homeQuestion')}</Text>
          <Text style={[styles.copy, { color: palette.mutedForeground, textAlign }]}>{t('homeCopy')}</Text>
          <View style={styles.countryGrid}>
            <CountryPicker value={countryCode} onChange={setCountry} />
          </View>
          <Pressable onPress={() => { void Haptics.selectionAsync(); setStep(INCOME_STEP); }} style={[styles.primaryButton, { backgroundColor: palette.primary }]}>
            <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{t('continueLabel')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {step === INCOME_STEP && (
        <View style={styles.content}>
          <Text style={[styles.eyebrow, { color: palette.primary }]}>{t('startingPoint')}</Text>
          <Text style={[styles.title, { color: palette.foreground, textAlign }]}>{currentIncomePrompt.title.replace('{name}', firstName)}</Text>
          <Text style={[styles.copy, { color: palette.mutedForeground, textAlign }]}>{currentIncomePrompt.copy}</Text>
          <TextInput value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder={currentIncomePrompt.placeholder} placeholderTextColor={palette.mutedForeground} style={[styles.input, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border, textAlign }]} />
          <Pressable
            testID="onboarding-income-continue"
            onPress={() => {
              const value = Number(income);
              if (incomeSubmitLock.current || accountIncome > 0 || incomeEntries.length > 0) {
                incomeSubmitLock.current = true;
                setStep(RELIEF_STEP);
                return;
              }
              if (value > 0 && (currency === 'AED' || hasCurrentRate)) {
                incomeSubmitLock.current = true;
                addIncome(toBaseAmount(value), 'salary');
                void Haptics.selectionAsync();
                setStep(RELIEF_STEP);
              } else if (value > 0) {
                Alert.alert(t('currencyConversionNeeded'), t('currencyConversionNeededCopy'));
              }
            }}
            style={[styles.primaryButton, { backgroundColor: palette.primary }]}
          >
            <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{t('continueLabel')}</Text>
          </Pressable>
        </View>
      )}

      {step === RELIEF_STEP && !personalizing && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: palette.foreground, textAlign }]}>{t('onboardingFlowReliefTitle')}</Text>
          <View style={[styles.personalizedCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.personalizedCopy, { color: palette.foreground, textAlign }]}>{reliefCopy}</Text>
          </View>
          <Text style={[styles.sectionLabel, { color: palette.foreground, textAlign }]}>{t('onboardingFlowReliefBenefitsTitle')}</Text>
          <View style={styles.reliefBenefits}>
            {[1, 2, 3, 4].map((benefitNumber) => (
              <View key={benefitNumber} style={[styles.featureRow, language === 'ar' && styles.rtlRow]}>
                <Ionicons name="checkmark-circle" size={21} color={palette.positive} />
                <Text style={[styles.featureText, { color: palette.foreground, textAlign }]}>{t(`onboardingFlowReliefBenefit${benefitNumber}`)}</Text>
              </View>
            ))}
          </View>
          <Pressable
            testID="onboarding-build-my-plan"
            accessibilityRole="button"
            onPress={() => void startPlanPersonalization()}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.primary }, pressed && styles.pressed]}
          >
            <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{t('onboardingFlowBuildPlan')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {step === RESULT_STEP && !personalizing && (
        <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.eyebrow, { color: palette.primary }]}>{t('onboardingFlowResultEyebrow')}</Text>
          <Text style={[styles.title, { color: palette.foreground, textAlign }]}>{t('onboardingFlowResultTitle')}</Text>
          <Text style={[styles.copy, { color: palette.mutedForeground, textAlign }]}>{resultCopy}</Text>
          <View style={[styles.resultFeatureCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            {orderedFeatures.map((feature) => (
              <View key={feature.id} style={[styles.featureRow, language === 'ar' && styles.rtlRow]}>
                <View style={[styles.featureIcon, { backgroundColor: palette.accent }]}>
                  <Ionicons name={feature.icon as keyof typeof Ionicons.glyphMap} size={18} color={palette.primary} />
                </View>
                <Text style={[styles.featureText, { color: palette.foreground, textAlign }]}>{t(feature.labelKey)}</Text>
              </View>
            ))}
          </View>
          <Pressable
            testID="onboarding-start-taking-control"
            accessibilityRole="button"
            onPress={() => setStep(PAYWALL_STEP)}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.primary }, pressed && styles.pressed]}
          >
            <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{t('onboardingFlowStartTakingControl')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {step === PAYWALL_STEP && (
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
           yearlyTrialEligible={yearlyTrialEligible}
          loading={subscriptionLoading}
          purchasing={purchasing}
          restoring={restoring}
          configured={configured}
          introHeadline={t('onboardingFlowPaywallHeadline')}
          introCopy={t('onboardingFlowPaywallSupport')}
          goalLine={paywallGoal}
          hideUnlockHeadline
        />
      )}
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5 },
  backButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 1 },
  stepText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 15, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  content: { flexGrow: 1, paddingTop: 42, paddingBottom: 24 },
  resultContent: { flexGrow: 1, paddingTop: 28, paddingBottom: 24 },
  transitionContent: { flex: 1, paddingTop: 28, paddingBottom: 24, alignItems: 'center', justifyContent: 'center' },
  personalizingIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  personalizingProgressTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 28 },
  personalizingProgressFill: { height: '100%', borderRadius: 3 },
  transitionMessage: { fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 32, textAlign: 'center', marginTop: 12, maxWidth: 320 },
  personalizedCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 20 },
  personalizedCopy: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 23 },
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 22, marginTop: 27 },
  reliefBenefits: { gap: 16, marginTop: 17 },
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
  resultFeatureCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 15, marginTop: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rtlRow: { flexDirection: 'row-reverse' },
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