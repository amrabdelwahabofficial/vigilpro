import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  ActivityIndicator,
  Image,
  InteractionManager,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useVigil, Bucket, BucketId, countries, CountryCode, CurrencyCode, Language, ThemeMode, Transaction } from '@/context/AppContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { CountryPicker } from '@/components/CountryPicker';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as FileSystem from 'expo-file-system/legacy';
import * as ExpoLinking from 'expo-linking';
import { runProAction, shouldShowTutorial, tutorialStorageKey } from '@/lib/flowGuards';
import { PaywallContent, Plan } from '@/components/Paywall';
import { useIdentity } from '@/context/IdentityContext';
import { convertCurrencyAmount, normalizeCurrencyCode } from '@/lib/currency';
import { subscriptionDeletionNotice } from '@/lib/localization';
import { supportText } from '@/lib/supportCopy';
import { settingsCopy } from '@/lib/settingsCopy';
import { tutorialCopy } from '@/lib/tutorialCopy';
import { appVersionBuild } from '@/lib/authDiagnostics';
import Svg, { Circle } from 'react-native-svg';
import {
  categoryBreakdown,
  filterTransactions,
  groupTransactionsByDay,
  incomeForMonth,
  monthPeriod,
  periodLabel,
  savingsSummary,
  shiftMonth,
  transactionsForMonth,
  type DateFilter,
} from '@/lib/finance';
import { canAddActiveGoal } from '@/lib/goals';
import type { Goal, IncomeEntry } from '@/context/AppContext';
import { useLocalSearchParams } from 'expo-router';
import { findOverlappingCandidate, findPossibleDuplicate, type DuplicateMatch } from '@/lib/duplicateDetection';
import { useReviewRequest } from '@/hooks/useReviewRequest';
import {
  beginVoiceProcessing,
  createVoiceCaptureState,
  failVoiceCapture,
  recoverVoiceCapture,
  startVoiceCapture,
  updateVoiceTranscript,
  updateVoiceVolume,
  type VoiceCaptureState,
} from '@/lib/voiceCapture';

type Screen = 'spending' | 'plan' | 'history' | 'analysis' | 'settings';
type ShortcutCaptureRequest = {
  id: number;
  amount?: string;
  note?: string;
  bucketId?: string;
};

function pressStyle(pressed: boolean, extra?: object) {
  return [extra, pressed && { opacity: 0.78 }];
}

function DestructiveConfirmationModal({
  visible,
  title,
  message,
  cancelLabel,
  confirmLabel,
  confirming,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { palette } = useVigil();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.modalBackdrop, styles.confirmationBackdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.confirmationCard, { backgroundColor: palette.card }]}>
          <View style={[styles.confirmationIcon, { backgroundColor: palette.destructive + '18' }]}>
            <Ionicons name="warning-outline" size={24} color={palette.destructive} />
          </View>
          <Text style={[styles.confirmationTitle, { color: palette.foreground }]}>{title}</Text>
          <Text style={[styles.confirmationMessage, { color: palette.mutedForeground }]}>{message}</Text>
          <View style={styles.confirmationActions}>
            <Pressable
              testID="destructive-cancel"
              disabled={confirming}
              onPress={onCancel}
              style={({ pressed }) => pressStyle(pressed, [styles.secondaryButton, styles.confirmationButton, { borderColor: palette.border, opacity: confirming ? 0.5 : 1 }])}
            >
              <Text style={[styles.secondaryButtonText, { color: palette.foreground }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              testID="destructive-confirm"
              disabled={confirming}
              onPress={onConfirm}
              style={({ pressed }) => pressStyle(pressed, [styles.confirmationButton, { backgroundColor: palette.destructive, opacity: confirming ? 0.6 : 1 }])}
            >
              {confirming ? <ActivityIndicator color={palette.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function toneColor(tone: Bucket['tone'], palette: ReturnType<typeof useVigil>['palette']) {
  if (tone === 'savings' || tone === 'charity' || tone === 'fun') return palette.positive;
  if (tone === 'investment') return palette.warning;
  return palette.primary;
}

function spendingBarColor(availableRatio: number, palette: ReturnType<typeof useVigil>['palette']) {
  const availablePercent = availableRatio * 100;
  if (availablePercent <= 34) return palette.primary;
  if (availablePercent <= 67) return palette.warning;
  return palette.positive;
}

function formatBucketLabel(label: string) {
  return label ? label.charAt(0).toLocaleUpperCase() + label.slice(1) : label;
}

const bucketCommentary: Partial<Record<BucketId, { steady: string; tight: string; over: string }>> = {
  tax: {
    steady: 'bucketCommentTaxSteady', tight: 'bucketCommentTaxTight', over: 'bucketCommentTaxOver',
  },
  needs: {
    steady: 'bucketCommentNeedsSteady', tight: 'bucketCommentNeedsTight', over: 'bucketCommentNeedsOver',
  },
  savings: {
    steady: 'bucketCommentSavingsSteady', tight: 'bucketCommentSavingsTight', over: 'bucketCommentSavingsOver',
  },
  investment: {
    steady: 'bucketCommentInvestmentSteady', tight: 'bucketCommentInvestmentTight', over: 'bucketCommentInvestmentOver',
  },
  development: {
    steady: 'bucketCommentDevelopmentSteady', tight: 'bucketCommentDevelopmentTight', over: 'bucketCommentDevelopmentOver',
  },
  charity: {
    steady: 'bucketCommentCharitySteady', tight: 'bucketCommentCharityTight', over: 'bucketCommentCharityOver',
  },
  fun: {
    steady: 'bucketCommentFunSteady', tight: 'bucketCommentFunTight', over: 'bucketCommentFunOver',
  },
};

function Avatar({ size = 42, onPress }: { size?: number; onPress?: () => void }) {
  const { palette, profileImageUri, setProfileImageUri, profileFirstName } = useVigil();
  const { displayName, firstName, imageUrl, email } = useIdentity();
  const fullName = displayName || profileFirstName || email || 'Vigil Spend member';
  
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setProfileImageUri(result.assets[0].uri);
      }
    } catch (e) {
      // ignore
    }
  };

  return (
    <Pressable onPress={onPress || pickImage} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.primary, overflow: 'hidden' }]}>
      {imageUrl || profileImageUri ? (
        <Image source={{ uri: imageUrl || profileImageUri || undefined }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={[styles.avatarText, { color: palette.primaryForeground, fontSize: size * 0.4 }]}>{fullName.charAt(0).toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

function Header({ screen, onReceipt }: { screen: Screen; onReceipt?: () => void }) {
  const { palette, t, countryCode, currency, morningReminder, eveningReminder, setMorningReminder, setEveningReminder, profileImageUri, profileFirstName } = useVigil();
  const { displayName, firstName, lastName, email, imageUrl, signOut } = useIdentity();
  const { isPro } = useSubscription();
  const [profileVisible, setProfileVisible] = useState(false);
  const [remindersVisible, setRemindersVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const greetingName = firstName || displayName?.split(/\s+/)[0] || profileFirstName || email?.split('@')[0] || 'there';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || displayName || profileFirstName || email || 'Vigil Spend member';
  const signOutNow = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await Promise.race([
        signOut(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Sign out timed out')), 10000)),
      ]);
      setProfileVisible(false);
      router.replace('/sign-in');
    } catch (error) {
      setSigningOut(false);
      Alert.alert(t('signOut'), error instanceof Error && /timed out/i.test(error.message) ? 'Sign out took too long. Please try again.' : t('authCopy'));
    }
  };
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View style={styles.brandRow}>
           <View style={[styles.brandMarkFrame, { backgroundColor: palette.primary }]}>
              <Image source={require('@/assets/images/icon-transparent.png')} style={styles.brandMark} resizeMode="contain" />
           </View>
          <View>
            <Text style={[styles.brandName, { color: palette.foreground }]}>Vigil Spend</Text>
            <Text style={[styles.brandTag, { color: palette.mutedForeground }]}>{t('where')}, {greetingName}?</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
           {onReceipt && <Pressable testID="header-receipt" accessibilityLabel={t('scanReceipt')} onPress={onReceipt} style={({ pressed }) => pressStyle(pressed, styles.iconButton)}>
            <Ionicons name="camera-outline" size={20} color={palette.foreground} />
          </Pressable>}
           <Pressable testID="header-notifications" accessibilityLabel={t('notifications')} onPress={() => setRemindersVisible(true)} style={({ pressed }) => pressStyle(pressed, styles.iconButton)}>
            <Ionicons name="notifications-outline" size={20} color={palette.foreground} />
          </Pressable>
           <Pressable testID="header-profile" accessibilityLabel={t('profile')} onPress={() => setProfileVisible(true)} style={({ pressed }) => pressStyle(pressed, styles.iconButton)}>
            {profileImageUri ? <Avatar size={24} onPress={() => setProfileVisible(true)} /> : <Ionicons name="person-outline" size={20} color={palette.foreground} />}
          </Pressable>
        </View>
      </View>
      {screen !== 'spending' && <Text style={[styles.screenTitle, { color: palette.foreground }]}>{t(screen)}</Text>}
      <Modal visible={profileVisible} transparent animationType="fade" onRequestClose={() => setProfileVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
          <View style={[styles.profileSheet, { backgroundColor: palette.card }]}>
            <View style={styles.profileSheetHeader}>
              <Avatar />
              <View style={{ flex: 1 }}><Text style={[styles.profileName, { color: palette.foreground }]}>{fullName}</Text><Text style={[styles.profileMeta, { color: palette.mutedForeground }]}>{email || '—'}</Text><Text style={[styles.profileMeta, { color: palette.mutedForeground }]}>{isPro ? t('pro') : t('free')} · {currency} • {countries.find((country) => country.code === countryCode)?.name}</Text></View>
              <Pressable onPress={() => setProfileVisible(false)} style={styles.closeButton}><Ionicons name="close" size={20} color={palette.foreground} /></Pressable>
            </View>
            <Pressable onPress={() => { setProfileVisible(false); router.push('/(tabs)/settings'); }} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.background }])}>
              <Ionicons name="settings-outline" size={19} color={palette.primary} /><Text style={[styles.settingsLinkText, { color: palette.foreground }]}>{t('settings')}</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
            </Pressable>
            <Pressable disabled={signingOut} onPress={() => void signOutNow()} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.background, opacity: signingOut ? 0.6 : 1 }])}>
              <Ionicons name="log-out-outline" size={19} color={palette.primary} /><Text style={[styles.settingsLinkText, { color: palette.foreground }]}>{signingOut ? 'Signing out…' : t('signOut')}</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={remindersVisible} transparent animationType="fade" onRequestClose={() => setRemindersVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
          <View style={[styles.profileSheet, { backgroundColor: palette.card }]}>
            <View style={styles.profileSheetHeader}><View style={[styles.settingIcon, { backgroundColor: palette.accent }]}><Ionicons name="notifications-outline" size={19} color={palette.primary} /></View><Text style={[styles.modalTitle, { color: palette.foreground, flex: 1 }]}>{t('morning')} & {t('evening')}</Text><Pressable onPress={() => setRemindersVisible(false)} style={styles.closeButton}><Ionicons name="close" size={20} color={palette.foreground} /></Pressable></View>
            <Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('reminderCopy')}</Text>
            <View style={[styles.settingRow, { borderColor: palette.border, backgroundColor: palette.background }]}><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('morning')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>8:00 AM · Log before life gets loud.</Text></View><Switch value={morningReminder} onValueChange={setMorningReminder} trackColor={{ false: palette.track, true: palette.positive }} thumbColor={palette.card} /></View>
            <View style={[styles.settingRow, { borderColor: palette.border, backgroundColor: palette.background }]}><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('evening')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>8:30 PM · Close the loop with kindness.</Text></View><Switch value={eveningReminder} onValueChange={setEveningReminder} trackColor={{ false: palette.track, true: palette.warning }} thumbColor={palette.card} /></View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const { palette } = useVigil();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: palette.foreground }]}>{title}</Text>
      {action && onPress && <Pressable onPress={onPress}><Text style={[styles.sectionAction, { color: palette.primary }]}>{action}</Text></Pressable>}
    </View>
  );
}

const tutorialSteps = [
  { icon: 'add-circle-outline' as const, title: 'Log spending in seconds', copy: 'Tap Log spending to add a manual entry. Pro also unlocks receipt scans, bank messages, and voice notes.' },
  { icon: 'wallet-outline' as const, title: 'Give income a plan', copy: 'Use Plan to add income and see how each bucket is doing. Bucket edits are available with Pro.' },
  { icon: 'document-text-outline' as const, title: 'See the full picture', copy: 'History keeps your trail, while Analysis turns it into clear guidance with Vigil Spend Pro.' },
];

function TutorialModal({ visible, onFinish }: { visible: boolean; onFinish: () => void }) {
  const { palette, language, t } = useVigil();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const current = tutorialSteps[step];
  const localized = tutorialCopy(language)[step];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onFinish}><View style={[styles.modalBackdrop, styles.tutorialBackdrop, { backgroundColor: palette.overlay, paddingBottom: Math.max(insets.bottom + 8, 16) }]}><View style={[styles.tutorialCard, { backgroundColor: palette.card }]}><View style={[styles.tutorialIcon, { backgroundColor: palette.accent }]}><Ionicons name={current.icon} size={28} color={palette.primary} /></View><Text style={[styles.tutorialStep, { color: palette.primary }]}>{t('quickStart')} · {step + 1}/{tutorialSteps.length}</Text><Text style={[styles.tutorialTitle, { color: palette.foreground }]}>{localized.title}</Text><Text style={[styles.tutorialCopy, { color: palette.mutedForeground }]}>{localized.copy}</Text><View style={styles.tutorialDots}>{tutorialSteps.map((item, index) => <View key={item.title} style={[styles.tutorialDot, { backgroundColor: index === step ? palette.primary : palette.border }]} />)}</View><Pressable testID="tutorial-next" onPress={() => { if (step === tutorialSteps.length - 1) onFinish(); else setStep((value) => value + 1); }} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary }])}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{step === tutorialSteps.length - 1 ? t('startUsing') : t('next')}</Text><Ionicons name={step === tutorialSteps.length - 1 ? 'checkmark' : 'arrow-forward'} size={18} color={palette.primaryForeground} /></Pressable><Pressable onPress={onFinish} style={styles.tutorialSkip}><Text style={[styles.settingsLinkText, { color: palette.mutedForeground }]}>{t('skipTutorial')}</Text></Pressable></View></View></Modal>;
}

function DoubleTapLoggingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, t } = useVigil();
  const insets = useSafeAreaInsets();
  const steps = [t('doubleTapStepOne'), t('doubleTapStepTwo'), t('doubleTapStepThree')];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay, paddingTop: Math.max(insets.top, 16) }]}>
        <View style={[styles.shortcutHelpSheet, { backgroundColor: palette.card, paddingBottom: Math.max(insets.bottom + 18, 28) }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.shortcutHelpIcon, { backgroundColor: palette.accent }]}>
              <Ionicons name="finger-print-outline" size={23} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('doubleTapTitle')}</Text>
              <Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('doubleTapSummary')}</Text>
            </View>
            <Pressable testID="close-double-tap-logging" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={palette.foreground} />
            </Pressable>
          </View>
          <View style={styles.shortcutSteps}>
            {steps.map((step, index) => (
              <View key={step} style={styles.shortcutStep}>
                <View style={[styles.shortcutStepNumber, { backgroundColor: palette.primary }]}>
                  <Text style={[styles.shortcutStepNumberText, { color: palette.primaryForeground }]}>{index + 1}</Text>
                </View>
                <Text style={[styles.shortcutStepText, { color: palette.foreground }]}>{step}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.shortcutNote, { backgroundColor: palette.secondary }]}>
            <Ionicons name="information-circle-outline" size={18} color={palette.primary} />
            <Text style={[styles.shortcutNoteText, { color: palette.mutedForeground }]}>{t('doubleTapNote')}</Text>
          </View>
          <Pressable testID="done-double-tap-logging" onPress={onClose} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary }])}>
            <Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('doubleTapDone')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BucketProgress({ bucket, spent, income = 100, onPress }: { bucket: Bucket; spent: number; income?: number; onPress?: () => void }) {
  const { palette, t, formatMoney } = useVigil();
  const budget = income * bucket.percent / 100;
  const remaining = budget - spent;
  const usedRatio = budget > 0 ? spent / budget : 0;
  const availableRatio = Math.max(0, 1 - usedRatio);
  const fill = spendingBarColor(availableRatio, palette);
  const isOver = remaining < 0;
   const copy = bucketCommentary[bucket.id] ?? bucketCommentary.fun!;
    const commentary = t(isOver ? copy.over : availableRatio > 0.67 ? copy.steady : copy.tight);
  return (
    <Pressable testID={`bucket-${bucket.id}`} onPress={onPress} style={({ pressed }) => pressStyle(pressed, styles.bucketRow)}>
      <View style={[styles.bucketIcon, { backgroundColor: palette.secondary }]}>
        <MaterialCommunityIcons name={bucket.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={19} color={toneColor(bucket.tone, palette)} />
      </View>
      <View style={styles.bucketMain}>
        <View style={styles.bucketHeading}>
          <Text style={[styles.bucketLabel, { color: palette.foreground }]}>{formatBucketLabel(t(bucket.labelKey))}</Text>
          <Text style={[styles.bucketAmount, { color: isOver ? palette.primary : palette.foreground }]}>{formatMoney(Math.abs(remaining))} {isOver ? t('over') : t('left')}</Text>
        </View>
        <View style={[styles.track, { backgroundColor: palette.track }]}>
          <View style={[styles.trackFill, { width: `${Math.min(100, availableRatio * 100)}%`, backgroundColor: fill }]} />
        </View>
        <Text style={[styles.bucketMeta, { color: isOver ? palette.primary : palette.mutedForeground }]}>
          {commentary}
        </Text>
      </View>
    </Pressable>
  );
}

function SpendingGoalsToggle({ value, onChange }: { value: 'spending' | 'goals'; onChange: (value: 'spending' | 'goals') => void }) {
  const { palette, t } = useVigil();
  return <View style={[styles.spendingGoalsToggle, { backgroundColor: palette.secondary }]}><Pressable testID="spending-view-toggle" onPress={() => onChange('spending')} style={({ pressed }) => pressStyle(pressed, [styles.spendingGoalsOption, value === 'spending' && { backgroundColor: palette.primary }])}><Ionicons name="trending-up-outline" size={15} color={value === 'spending' ? palette.primaryForeground : palette.mutedForeground} /><Text style={[styles.spendingGoalsOptionText, { color: value === 'spending' ? palette.primaryForeground : palette.mutedForeground }]}>{t('spending')}</Text></Pressable><Pressable testID="goals-view-toggle" onPress={() => onChange('goals')} style={({ pressed }) => pressStyle(pressed, [styles.spendingGoalsOption, value === 'goals' && { backgroundColor: palette.primary }])}><Ionicons name="flag-outline" size={15} color={value === 'goals' ? palette.primaryForeground : palette.mutedForeground} /><Text style={[styles.spendingGoalsOptionText, { color: value === 'goals' ? palette.primaryForeground : palette.mutedForeground }]}>{t('goals')}</Text></Pressable></View>;
}

function DashboardScreen({ onLog, onReceipt, onAsk, onUnlock }: { onLog: () => void; onReceipt: () => void; onAsk: () => void; onUnlock: () => void }) {
  const { palette, t, income, transactions, buckets, formatMoney, formatPercent, formatDate, profileFirstName } = useVigil();
  const insets = useSafeAreaInsets();
  const { displayName, email } = useIdentity();
  const [view, setView] = useState<'spending' | 'goals'>('spending');
  const firstName = displayName?.split(/\s+/)[0] || profileFirstName || email?.split('@')[0] || 'there';
  const spent = transactions.reduce((sum, item) => sum + item.amount, 0);
  const savings = Math.max(0, income - spent);
  const plannedSavings = income * (buckets.find((bucket) => bucket.id === 'savings')?.percent ?? 0) / 100;
  const spendableSpent = transactions.filter((item) => item.bucketId !== 'savings').reduce((sum, item) => sum + item.amount, 0);
  const remainingToSpend = Math.max(0, income - spendableSpent - plannedSavings);
  const kept = income ? Math.round((savings / income) * 100) : 0;
  return (
    <View style={styles.dashboardFrame}>
     <ScrollView
       contentContainerStyle={[styles.scrollContent, styles.dashboardScroll]}
       showsVerticalScrollIndicator={false}
       nestedScrollEnabled
       keyboardDismissMode="on-drag"
       keyboardShouldPersistTaps="handled"
       scrollEventThrottle={16}
     >
       <Header screen="spending" onReceipt={onReceipt} />
       <SpendingGoalsToggle value={view} onChange={setView} />
       {view === 'goals' ? <GoalsSection onUnlock={onUnlock} /> : <>
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.greeting, { color: palette.foreground }]}>{t('hello')}, {firstName}</Text>
          <Text style={[styles.dateLine, { color: palette.mutedForeground }]}>{formatDate(new Date(), { month: 'long', year: 'numeric' })}</Text>
        </View>
         <View style={styles.greetingButtons}>
           <Pressable testID="ask-ai-button" accessibilityLabel={t('askAI')} onPress={onAsk} style={({ pressed }) => pressStyle(pressed, [styles.askButton, { borderColor: palette.border, backgroundColor: palette.card }])}>
             <Ionicons name="sparkles-outline" size={17} color={palette.primary} />
             <Text style={[styles.askButtonText, { color: palette.foreground }]}>Ask AI</Text>
           </Pressable>
          <Pressable testID="quick-capture-button" accessibilityLabel={t('addSpending')} onPress={onLog} style={({ pressed }) => pressStyle(pressed, [styles.roundAction, { borderColor: palette.primary, backgroundColor: palette.accent }])}>
            <Ionicons name="add" size={21} color={palette.primary} />
          </Pressable>
        </View>
      </View>
      <View style={[styles.nudge, { backgroundColor: palette.secondary }]}>
        <Ionicons name="sparkles-outline" size={16} color={palette.primary} />
        <Text style={[styles.nudgeText, { color: palette.secondaryForeground }]}>{t('speakOrType')}</Text>
        <Ionicons name="close" size={15} color={palette.mutedForeground} />
      </View>
      <View style={styles.periodRow}>
        <View style={[styles.periodPill, { borderColor: palette.border }]}><Text style={[styles.periodText, { color: palette.mutedForeground }]}>{t('allTime')}</Text></View>
        <View style={[styles.periodPill, { backgroundColor: palette.primary, borderColor: palette.primary }]}><Text style={[styles.periodText, { color: palette.primaryForeground }]}>{formatDate(new Date(), { month: 'long', year: 'numeric' })}</Text></View>
      </View>
      <View style={[styles.savingsCard, { backgroundColor: palette.positiveSoft, borderColor: palette.positive + '55' }]}>
        <View>
          <Text style={[styles.eyebrow, { color: palette.positive }]}>{t('netSavings').toUpperCase()}</Text>
          <Text style={[styles.savingsValue, { color: palette.positive }]}>{formatMoney(savings)}</Text>
          <Text style={[styles.cardHint, { color: palette.mutedForeground }]}>{formatPercent(kept)} {t('kept')}</Text>
        </View>
        <Ionicons name="wallet-outline" size={27} color={palette.positive} />
      </View>
      <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: palette.border, backgroundColor: palette.card }]}>
          <Text style={[styles.statLabel, { color: palette.positive }]}>↗ {t('income').toUpperCase()}</Text>
          <Text style={[styles.statValue, { color: palette.foreground }]}>{formatMoney(income)}</Text>
          </View>
        <View style={[styles.statCard, { borderColor: palette.border, backgroundColor: palette.card }]}>
          <Text style={[styles.statLabel, { color: palette.primary }]}>↘ {t('expenses').toUpperCase()}</Text>
          <Text style={[styles.statValue, { color: palette.foreground }]}>{formatMoney(spent)}</Text>
        </View>
      </View>
      <View style={[styles.bucketsCard, { borderColor: palette.border, backgroundColor: palette.card }]}>
        <Text style={[styles.bucketCardEyebrow, { color: palette.mutedForeground }]}>{t('remaining').toUpperCase()}</Text>
        <Text style={[styles.remainingValue, { color: palette.positive }]}>{formatMoney(remainingToSpend)}</Text>
        <Text style={[styles.remainingHint, { color: palette.mutedForeground }]}>(Excluding savings)</Text>
        {buckets.map((bucket) => {
          const bucketSpent = transactions.filter((item) => item.bucketId === bucket.id).reduce((sum, item) => sum + item.amount, 0);
          return <BucketProgress key={bucket.id} bucket={bucket} spent={bucketSpent} income={income} />;
        })}
        <Pressable testID="view-transactions" onPress={() => router.push('/history')} style={({ pressed }) => pressStyle(pressed, [styles.outlineButton, { borderColor: palette.border }])}>
          <Text style={[styles.outlineButtonText, { color: palette.foreground }]}>{t('viewTransactions')}</Text>
        </Pressable>
      </View>
       </>}
    </ScrollView>
       {view === 'spending' && <Pressable testID="log-spending-fab" onPress={onLog} style={({ pressed }) => pressStyle(pressed, [styles.fab, { bottom: Math.max(insets.bottom + 92, 110), backgroundColor: palette.primary }])}>
        <Ionicons name="mic-outline" size={20} color={palette.primaryForeground} />
        <Text style={[styles.fabText, { color: palette.primaryForeground }]}>{t('logSpending')}</Text>
       </Pressable>}
    </View>
  );
}

type ReviewTransaction = {
  amount: number;
  note: string;
  date?: string | null;
  selected: boolean;
  currency?: CurrencyCode | null;
  originalAmount?: number;
  originalCurrency?: CurrencyCode | null;
  conversionError?: boolean;
};

type DuplicateDecision = 'replace' | 'add' | 'skip';
type PendingDuplicate = { candidateIndex: number; match: DuplicateMatch };

const speechLocaleByLanguage: Record<Language, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  cs: 'cs-CZ',
  de: 'de-DE',
  es: 'es-ES',
  ru: 'ru-RU',
  ar: 'ar-SA',
};

function LogModal({ visible, onClose, onUnlock, receiptRequest, shortcutRequest, onSuccessfulLog }: { visible: boolean; onClose: () => void; onUnlock: () => void; receiptRequest: number; shortcutRequest: ShortcutCaptureRequest | null; onSuccessfulLog: (count: number) => void }) {
  const { palette, t, buckets, transactions, addTransaction, updateTransaction, currency, rates, ratesUpdatedAt, refreshRates, toBaseAmount, formatDate, formatTransactionMoney, language } = useVigil();
  const { isPro } = useSubscription();
  const { getToken } = useIdentity();
  const handleUnlock = () => { onClose(); onUnlock(); };
  const runGatedAction = (action: () => void) => runProAction(isPro, handleUnlock, action);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [bucketId, setBucketId] = useState<BucketId>('needs');
  const [source, setSource] = useState<Transaction['source']>('manual');
  const [captureUri, setCaptureUri] = useState<string | null>(null);
  const [captureUris, setCaptureUris] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceVolume, setVoiceVolume] = useState(-2);
  const [voiceError, setVoiceError] = useState('');
  const [reviewTransactions, setReviewTransactions] = useState<ReviewTransaction[]>([]);
  const [originalCapture, setOriginalCapture] = useState<{ amount: number; currency: CurrencyCode; accountAmount: number; detected: boolean } | null>(null);
  const [duplicateQueue, setDuplicateQueue] = useState<PendingDuplicate[]>([]);
  const [duplicateDecisions, setDuplicateDecisions] = useState<Record<number, DuplicateDecision>>({});
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const voiceStateRef = useRef<VoiceCaptureState>(createVoiceCaptureState());
  const voiceUriRef = useRef<string | null>(null);
  const voiceStopRequestedRef = useRef(false);
  const voiceErrorRef = useRef<string | null>(null);
  const voiceProcessingStartedRef = useRef(false);
  const lastReceiptRequest = useRef(0);
  const lastShortcutRequest = useRef(0);

   const closeAndReset = () => {
     if (listening) {
       voiceStopRequestedRef.current = true;
       if (Platform.OS === 'web') {
         try { recorder.stop(); } catch { /* The modal is already closing. */ }
       }
       else ExpoSpeechRecognitionModule.abort();
     }
     voiceStateRef.current = recoverVoiceCapture();
     voiceUriRef.current = null;
     voiceErrorRef.current = null;
     voiceProcessingStartedRef.current = false;
     setAmount(''); setNote(''); setCaptureUri(null); setCaptureUris([]); setTranscript(''); setVoiceVolume(-2); setVoiceError(''); setExtracting(false); setListening(false); setReviewTransactions([]); setOriginalCapture(null); setDuplicateQueue([]); setDuplicateDecisions({}); setSource('manual'); onClose();
  };

  const processVoiceRecording = async (uri: string, mimeType: string) => {
    if (voiceProcessingStartedRef.current) return;
    voiceProcessingStartedRef.current = true;
    voiceStateRef.current = beginVoiceProcessing(voiceStateRef.current);
    setListening(false);
    setExtracting(true);
    try {
      const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const response = await fetch(`https://${domain}/api/vigil/capture/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audioBase64, mimeType, language }),
      });
      const data = await response.json() as {
        text?: string;
        transactions?: { amount: number; note: string; date?: string | null; currency?: string | null }[];
        message?: string;
      };
      if (!response.ok || !data.text) throw new Error(data.message || 'The voice note could not be transcribed.');
      const spoken = data.text.trim();
      setTranscript(spoken);
      setVoiceError('');
      const found = data.transactions?.filter((item) => Number.isFinite(item.amount) && item.amount > 0) ?? [];
      if (found.length) {
        setReviewTransactions(found.map((item) => ({ ...item, selected: true })));
        setAmount(String(found[0].amount));
        setNote(found[0].note || spoken);
        Alert.alert(
          t('voiceTransactionsReady'),
          found.length > 1
            ? t('voiceTransactionsFound').replace('{count}', String(found.length))
            : t('voiceTransactionReadyCopy'),
        );
      } else {
        const amountMatch = spoken.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?:\s|$)/);
        if (amountMatch) setAmount(amountMatch[1].replace(',', '.'));
        setNote(spoken);
        Alert.alert(t('voiceNoteReady'), t('voiceNoteReadyCopy'));
      }
      voiceStateRef.current = { ...voiceStateRef.current, phase: 'idle', error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : t('voiceUnavailableCopy');
      voiceErrorRef.current = message;
      setVoiceError(message);
      voiceStateRef.current = failVoiceCapture(voiceStateRef.current, message);
      Alert.alert(t('voiceUnavailable'), message);
    } finally {
      setExtracting(false);
      voiceProcessingStartedRef.current = false;
    }
  };

  const startVoiceRecording = async () => {
    try {
      voiceStateRef.current = startVoiceCapture();
      voiceUriRef.current = null;
      voiceStopRequestedRef.current = false;
      voiceErrorRef.current = null;
      voiceProcessingStartedRef.current = false;
      setTranscript('');
      setVoiceVolume(-2);
      setVoiceError('');
      if (Platform.OS === 'web') {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(t('recordNote'), 'Microphone access is required to record a spending note.');
          voiceStateRef.current = recoverVoiceCapture();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } else {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(t('recordNote'), 'Microphone and speech-recognition access are required for live transcription.');
          voiceStateRef.current = recoverVoiceCapture();
          return;
        }
        if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
          throw new Error('Speech recognition is not available on this device.');
        }
        ExpoSpeechRecognitionModule.start({
          lang: speechLocaleByLanguage[language],
          interimResults: true,
          continuous: true,
          addsPunctuation: true,
          iosTaskHint: 'dictation',
          recordingOptions: {
            persist: true,
            outputFileName: `vigil-voice-${Date.now()}.wav`,
            outputSampleRate: 16_000,
            outputEncoding: 'pcmFormatInt16',
          },
          volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
        });
      }
      setSource('voice');
      setListening(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The microphone could not start.';
      voiceStateRef.current = failVoiceCapture(voiceStateRef.current, message);
      setVoiceError(message);
      Alert.alert(t('recordNote'), message);
    }
  };

  const stopVoiceRecording = async () => {
    if (!listening) return;
    voiceStopRequestedRef.current = true;
    voiceStateRef.current = beginVoiceProcessing(voiceStateRef.current);
    if (Platform.OS !== 'web') {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording was created.');
      await processVoiceRecording(uri, 'audio/webm');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('voiceUnavailableCopy');
      voiceStateRef.current = failVoiceCapture(voiceStateRef.current, message);
      setVoiceError(message);
      Alert.alert(t('voiceUnavailable'), message);
    }
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (Platform.OS === 'web' || !listening) return;
    const nextTranscript = event.results.map((result) => result.transcript).join(' ').trim();
    voiceStateRef.current = updateVoiceTranscript(voiceStateRef.current, nextTranscript);
    setTranscript(nextTranscript);
  });
  useSpeechRecognitionEvent('volumechange', (event) => {
    if (Platform.OS === 'web' || !listening) return;
    setVoiceVolume(event.value);
    const update = updateVoiceVolume(voiceStateRef.current, event.value, Date.now());
    voiceStateRef.current = update.state;
    if (update.shouldStop) void stopVoiceRecording();
  });
  useSpeechRecognitionEvent('speechstart', () => {
    if (Platform.OS === 'web' || !listening) return;
    voiceStateRef.current = updateVoiceVolume(voiceStateRef.current, 1, Date.now()).state;
  });
  useSpeechRecognitionEvent('audioend', (event) => {
    if (Platform.OS !== 'web' && event.uri) voiceUriRef.current = event.uri;
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (Platform.OS === 'web' || (event.error === 'aborted' && voiceStopRequestedRef.current)) return;
    voiceErrorRef.current = event.message;
    voiceStateRef.current = failVoiceCapture(voiceStateRef.current, event.message);
    setVoiceError(event.message);
    setListening(false);
    setExtracting(false);
    Alert.alert(t('voiceUnavailable'), event.message || t('voiceUnavailableCopy'));
  });
  useSpeechRecognitionEvent('end', () => {
    if (Platform.OS === 'web' || voiceErrorRef.current || voiceProcessingStartedRef.current) return;
    voiceStopRequestedRef.current = true;
    setListening(false);
    voiceStateRef.current = beginVoiceProcessing(voiceStateRef.current);
    setTimeout(() => {
      const uri = voiceUriRef.current;
      if (uri) void processVoiceRecording(uri, 'audio/wav');
      else {
        const message = 'The speech recording was not available.';
        voiceStateRef.current = failVoiceCapture(voiceStateRef.current, message);
        Alert.alert(t('voiceUnavailable'), message);
      }
    }, 100);
  });
  const captureImage = async (camera: boolean) => {
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('cameraAccessNeeded'), camera
          ? t('cameraAccessCameraCopy')
          : t('cameraAccessLibraryCopy'));
        return;
      }
       const result = camera
         ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: false })
         : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: false, allowsMultipleSelection: true, selectionLimit: 12 });
       const assets = result.canceled ? [] : result.assets;
       if (!assets.length) return;
       const asset = assets[0];
       setCaptureUri(asset.uri);
       setCaptureUris(assets.map((item) => item.uri));
      setSource(camera ? 'receipt' : 'bank');
      setNote((current) => current || (camera ? 'Receipt capture' : 'Bank message capture'));
       setExtracting(true);
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
       const imageDataList = await Promise.all(assets.map(async (item) => {
         const base64 = await FileSystem.readAsStringAsync(item.uri, { encoding: FileSystem.EncodingType.Base64 });
         return `data:${item.mimeType ?? 'image/jpeg'};base64,${base64}`;
       }));
      const response = await fetch(`https://${domain}/api/vigil/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source: camera ? 'receipt' : 'bank',
           imageData: imageDataList[0],
           imageDataList,
        }),
      });
       const data = await response.json() as { amount?: number; note?: string; date?: string | null; transactions?: { amount: number; note: string; date?: string | null; currency?: string | null }[]; message?: string };
      if (!response.ok) throw new Error(data.message || 'The image could not be read.');
        const found = data.transactions?.length ? data.transactions : (typeof data.amount === 'number' && data.amount > 0 ? [{ amount: data.amount, note: data.note || '', date: data.date }] : []);
       if (found.length) {
         let conversionRates = rates;
         if (found.some((item) => {
           const sourceCurrency = normalizeCurrencyCode(item.currency);
           return sourceCurrency && sourceCurrency !== currency && !convertCurrencyAmount(item.amount, sourceCurrency, currency, rates);
         })) {
           conversionRates = { ...rates, ...(await refreshRates()) };
         }
         const prepared = found.map((item) => {
           const detectedCurrency = normalizeCurrencyCode(item.currency);
           const sourceCurrency = detectedCurrency ?? currency;
           const convertedAmount = convertCurrencyAmount(item.amount, sourceCurrency, currency, conversionRates);
           return {
             ...item,
             amount: convertedAmount ?? item.amount,
             currency: sourceCurrency,
             originalAmount: item.amount,
             originalCurrency: sourceCurrency,
             conversionError: convertedAmount === null,
             selected: true,
           };
         });
         const first = prepared[0];
         setReviewTransactions(prepared);
         setAmount(String(first.amount));
         setOriginalCapture({ amount: first.originalAmount ?? first.amount, currency: first.originalCurrency ?? currency, accountAmount: first.amount, detected: Boolean(normalizeCurrencyCode(found[0].currency)) });
        if (found[0].note) setNote(found[0].note);
         const hasMissingRate = prepared.some((item) => item.conversionError);
          Alert.alert(
            hasMissingRate ? t('currencyConversionNeeded') : t('captureDone'),
           hasMissingRate
              ? t('currencyConversionNeededCopy')
             : found.length > 1
                ? t('voiceTransactionsFound').replace('{count}', String(found.length))
                : t('reviewBeforeSaving'),
         );
      } else {
         Alert.alert(t('amountNotFound'), t('amountNotFoundCopy'));
      }
    } catch (error) {
      Alert.alert(t('captureUnavailable'), error instanceof Error ? error.message : t('captureUnavailableCopy'));
    } finally {
      setExtracting(false);
    }
  };
  useEffect(() => {
    if (!visible || receiptRequest === 0 || receiptRequest === lastReceiptRequest.current) return;
    lastReceiptRequest.current = receiptRequest;
    if (!runProAction(isPro, handleUnlock, () => undefined)) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void captureImage(true);
    });
    return () => task.cancel();
  }, [visible, receiptRequest, isPro]);
  useEffect(() => {
    if (!visible || !shortcutRequest || shortcutRequest.id === lastShortcutRequest.current) return;
    lastShortcutRequest.current = shortcutRequest.id;
    if (shortcutRequest.amount) setAmount(shortcutRequest.amount);
    if (shortcutRequest.note) setNote(shortcutRequest.note);
    if (shortcutRequest.bucketId && buckets.some((bucket) => bucket.id === shortcutRequest.bucketId)) {
      setBucketId(shortcutRequest.bucketId);
    }
  }, [buckets, shortcutRequest, visible]);
  const duplicateMatchForIndex = (index: number): DuplicateMatch | null => {
    const existing = findPossibleDuplicate(reviewTransactions[index], transactions);
    return existing ?? findOverlappingCandidate(reviewTransactions[index], index, reviewTransactions);
  };
  const buildTransaction = (item: ReviewTransaction, index: number, selectedCount: number, numericAmount: number): Omit<Transaction, 'id'> => ({
    amount: toBaseAmount(selectedCount === 1 ? numericAmount : item.amount),
    currency,
    originalAmount: selectedCount === 1 ? numericAmount : (item.originalAmount ?? item.amount),
    originalCurrency: selectedCount === 1 ? currency : (item.originalCurrency ?? currency),
    rateAsOf: ratesUpdatedAt,
    note: selectedCount === 1 ? (note.trim() || t('uncategorised')) : (item.note || t('uncategorised')),
    bucketId,
    date: item.date || new Date().toISOString().slice(0, 10),
    source,
  });
  const commitSave = (decisions: Record<number, DuplicateDecision>, confirmationKey?: 'transactionSavedWithNote' | 'transactionSavedInBucket' | 'transactionsSaved', cleanNoteOverride?: string) => {
    const selectedEntries = reviewTransactions.map((item, index) => ({ item, index })).filter(({ item }) => item.selected);
    let added = 0;
    let replaced = 0;
    let skipped = 0;
    selectedEntries.forEach(({ item, index }) => {
      const match = duplicateMatchForIndex(index);
      const decision = decisions[index];
      if (decision === 'skip') {
        skipped += 1;
        return;
      }
      const transaction = buildTransaction(item, index, selectedEntries.length, numericAmountForSave);
      if (decision === 'replace' && match?.kind === 'existing') {
        updateTransaction(match.transaction.id, transaction);
        replaced += 1;
      } else {
        addTransaction(transaction);
        added += 1;
      }
    });
    const bucketLabel = formatBucketLabel(t(buckets.find((bucket) => bucket.id === bucketId)?.labelKey ?? 'needs'));
    const cleanNote = cleanNoteOverride ?? (note.trim() || selectedEntries[0]?.item.note?.trim() || '').replace(/\s+/g, ' ').slice(0, 56);
    const fillTemplate = (template: string, values: Record<string, string>) => Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);
    const resolvedConfirmationKey = confirmationKey ?? (selectedEntries.length > 1 ? 'transactionsSaved' : cleanNote ? 'transactionSavedWithNote' : 'transactionSavedInBucket');
    const confirmation = selectedEntries.length > 1
      ? fillTemplate(t(resolvedConfirmationKey), {
        count: String(added + replaced),
        amount: `${currency} ${selectedEntries.reduce((total, { item }) => total + item.amount, 0).toFixed(2)}`,
      }) + (replaced || skipped ? ` ${t('duplicateSummary').replace('{replaced}', String(replaced)).replace('{skipped}', String(skipped))}` : '')
      : fillTemplate(t(resolvedConfirmationKey), {
        amount: `${currency} ${numericAmountForSave.toFixed(2)}`,
        note: cleanNote,
        bucket: bucketLabel,
      });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t('saved'), confirmation);
    if (added + replaced > 0) onSuccessfulLog(added + replaced);
    closeAndReset();
  };
  const numericAmountForSave = Number(amount.replace(',', '.'));
  const save = () => {
    const numeric = numericAmountForSave;
    const selected = reviewTransactions.filter((item) => item.selected);
    if (reviewTransactions.length > 0 && selected.length === 0) {
      Alert.alert(t('chooseTransaction'), t('chooseTransactionCopy'));
      return;
    }
    if (selected.some((item) => item.conversionError)) {
      Alert.alert(t('currencyConversionNeeded'), t('currencyConversionNeededCopy'));
      return;
    }
    if (!numeric || numeric <= 0) {
      Alert.alert(t('amount'), t('enterPositiveAmount'));
      return;
    }
    const confirmationKey = selected.length > 1 ? 'transactionsSaved' : note.trim() ? 'transactionSavedWithNote' : 'transactionSavedInBucket';
    const cleanNote = (note.trim() || selected[0]?.note?.trim() || '').replace(/\s+/g, ' ').slice(0, 56);
    const pending = reviewTransactions
      .map((item, index) => ({ item, index, match: duplicateMatchForIndex(index) }))
      .filter(({ item, match, index }) => item.selected && match && !duplicateDecisions[index])
      .map(({ index, match }) => ({ candidateIndex: index, match: match! }));
    if (pending.length > 0) {
      setDuplicateQueue(pending);
      return;
    }
    commitSave(duplicateDecisions, confirmationKey, cleanNote);
  };
  const currentDuplicate = duplicateQueue[0];
  const resolveDuplicate = (decision: DuplicateDecision) => {
    if (!currentDuplicate) return;
    const nextDecisions = { ...duplicateDecisions, [currentDuplicate.candidateIndex]: decision };
    const remaining = duplicateQueue.slice(1);
    setDuplicateDecisions(nextDecisions);
    setDuplicateQueue(remaining);
    if (remaining.length === 0) {
      const selectedCount = reviewTransactions.filter((item) => item.selected).length;
      const confirmationKey = selectedCount > 1 ? 'transactionsSaved' : note.trim() ? 'transactionSavedWithNote' : 'transactionSavedInBucket';
      const cleanNote = (note.trim() || reviewTransactions.find((item) => item.selected)?.note?.trim() || '').replace(/\s+/g, ' ').slice(0, 56);
      commitSave(nextDecisions, confirmationKey, cleanNote);
    }
  };
  const duplicateCandidate = currentDuplicate ? reviewTransactions[currentDuplicate.candidateIndex] : null;
  const duplicateExisting = currentDuplicate?.match.kind === 'existing' ? currentDuplicate.match.transaction : null;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeAndReset}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.modalSheet, { backgroundColor: palette.background }]}>
          <View style={styles.modalGrabber} />
          <View style={styles.modalHeader}>
            <View><Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('logTransaction')}</Text><Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('speakOrType')}</Text></View>
            <Pressable testID="close-log-modal" onPress={closeAndReset} style={({ pressed }) => pressStyle(pressed, styles.closeButton)}><Ionicons name="close" size={22} color={palette.foreground} /></Pressable>
          </View>
           <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll} bottomOffset={28} keyboardShouldPersistTaps="handled">
             <Text style={[styles.captureSectionLabel, { color: palette.foreground }]}>{t('howAdd')}</Text>
              <View style={[styles.captureHero, { backgroundColor: palette.accent, borderColor: palette.primary + '55' }]}>
               <View style={styles.captureHeroCopy}>
                 <Text style={[styles.captureHeroTitle, { color: palette.foreground }]}>{t('recordNote')}{!isPro ? ' · Pro' : ''}</Text>
                  <Text style={[styles.captureHeroHint, { color: palette.mutedForeground }]}>{listening ? `${t('recording')}${Platform.OS === 'web' ? ` ${Math.floor(recorderState.durationMillis / 1000)}s` : ''} · ${t('tapToStop')}` : t('tapMicrophone')}</Text>
               </View>
                <Pressable testID="voice-capture" accessibilityLabel={listening ? t('stopRecording') : t('startRecording')} onPress={() => runGatedAction(() => { if (listening) void stopVoiceRecording(); else void startVoiceRecording(); })} style={({ pressed }) => pressStyle(pressed, [styles.captureHeroMic, { backgroundColor: palette.primary }])}>
                  <Ionicons name={listening ? 'stop' : 'mic'} size={30} color={palette.primaryForeground} />
               </Pressable>
             </View>
             <View style={styles.captureMethodGrid}>
              <Pressable testID="manual-capture" onPress={() => { setSource('manual'); setListening(false); }} style={({ pressed }) => pressStyle(pressed, [styles.captureMethod, { borderColor: source === 'manual' ? palette.primary : palette.border, backgroundColor: source === 'manual' ? palette.accent : palette.card }])}>
                <Ionicons name="create-outline" size={20} color={source === 'manual' ? palette.primary : palette.foreground} />
                <Text style={[styles.captureMethodText, { color: source === 'manual' ? palette.primary : palette.foreground }]}>{t('logManually')}</Text>
              </Pressable>
              <Pressable testID="scan-receipt" onPress={() => runGatedAction(() => { void captureImage(true); })} style={({ pressed }) => pressStyle(pressed, [styles.captureMethod, { borderColor: source === 'receipt' ? palette.primary : palette.border, backgroundColor: source === 'receipt' ? palette.accent : palette.card }])}>
                <Ionicons name="receipt-outline" size={20} color={source === 'receipt' ? palette.primary : palette.foreground} />
                <Text style={[styles.captureMethodText, { color: source === 'receipt' ? palette.primary : palette.foreground }]}>{t('scanReceipt')}{!isPro ? ' · Pro' : ''}</Text>
              </Pressable>
              <Pressable testID="bank-screenshot" onPress={() => runGatedAction(() => { void captureImage(false); })} style={({ pressed }) => pressStyle(pressed, [styles.captureMethod, { borderColor: source === 'bank' ? palette.primary : palette.border, backgroundColor: source === 'bank' ? palette.accent : palette.card }])}>
                <Ionicons name="image-outline" size={20} color={source === 'bank' ? palette.primary : palette.foreground} />
                <Text style={[styles.captureMethodText, { color: source === 'bank' ? palette.primary : palette.foreground }]}>{t('uploadBank')}{!isPro ? ' · Pro' : ''}</Text>
              </Pressable>
            </View>
               {source === 'voice' && (listening || extracting || !!transcript || !!voiceError) && <View testID="voice-transcription" style={[styles.transcriptCard, { borderColor: palette.border, backgroundColor: palette.secondary }]}><Text style={[styles.reviewTitle, { color: palette.foreground }]}>{listening ? t('recording') : extracting ? t('processing') : voiceError ? t('voiceUnavailable') : t('transcription')}</Text>{listening && Platform.OS !== 'web' && <View style={[styles.voiceMeter, { backgroundColor: palette.border }]}><View style={[styles.voiceMeterFill, { width: `${Math.max(0, Math.min(100, ((voiceVolume + 2) / 12) * 100))}%`, backgroundColor: palette.primary }]} /></View>}<Text testID="voice-live-transcript" style={[styles.transcriptText, { color: palette.foreground }]}>{voiceError || transcript || t('voiceHint')}</Text></View>}
               {reviewTransactions.length > 0 && <View style={[styles.reviewList, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.reviewTitle, { color: palette.foreground }]}>{t('reviewTransactions')}</Text><Text style={[styles.reviewHint, { color: palette.mutedForeground }]}>{t('reviewBeforeSaving')}</Text>{reviewTransactions.map((item, index) => { const duplicate = duplicateMatchForIndex(index); return <View key={`${item.note}-${index}`} style={styles.reviewRow}><Pressable accessibilityLabel={item.selected ? t('deselectTransaction') : t('selectTransaction')} onPress={() => setReviewTransactions((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, selected: !candidate.selected } : candidate))}><Ionicons name={item.selected ? 'checkbox' : 'square-outline'} size={21} color={item.selected ? palette.primary : palette.mutedForeground} /></Pressable><View style={{ flex: 1, gap: 6 }}><TextInput value={String(item.amount)} onChangeText={(value) => setReviewTransactions((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, amount: Number(value.replace(',', '.')) || 0, originalAmount: Number(value.replace(',', '.')) || 0, originalCurrency: currency, conversionError: false } : candidate))} keyboardType="decimal-pad" style={[styles.reviewEditInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} /><TextInput value={item.note} onChangeText={(value) => setReviewTransactions((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, note: value } : candidate))} placeholder={t('notePlaceholder')} placeholderTextColor={palette.mutedForeground} style={[styles.reviewEditInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />{duplicate && <View style={[styles.duplicateBadge, { backgroundColor: palette.primary + '14', borderColor: palette.primary + '55' }]}><Ionicons name="copy-outline" size={14} color={palette.primary} /><Text style={[styles.duplicateBadgeText, { color: palette.primary }]}>{t('possibleDuplicateTitle')}</Text></View>}<Text style={[styles.reviewMeta, { color: item.conversionError || duplicate ? palette.primary : palette.mutedForeground }]}>{item.conversionError ? t('exchangeRateUnavailable') : duplicate ? t('possibleDuplicateCopy') : item.date || formatDate(new Date())}</Text></View><Pressable accessibilityLabel={t('removeTransaction')} onPress={() => setReviewTransactions((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} style={styles.deleteButton}><Ionicons name="trash-outline" size={17} color={palette.destructive} /></Pressable></View>; })}</View>}
            <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('amount')}</Text>
             <View style={styles.amountRow}>
               <View style={[styles.currencyBox, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.currencyText, { color: palette.foreground }]}>{currency}</Text><Ionicons name="chevron-down" size={15} color={palette.mutedForeground} /></View>
               <TextInput testID="amount-input" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={palette.mutedForeground} keyboardType="decimal-pad" style={[styles.amountInput, { borderColor: palette.border, color: palette.foreground, backgroundColor: palette.card }]} />
            </View>
              {source === 'bank' && originalCapture && <Text style={[styles.conversionNote, { color: palette.mutedForeground }]}>{originalCapture.detected
                ? t('bankConversionNoteDetected').replace('{original}', `${originalCapture.currency} ${originalCapture.amount.toFixed(2)}`).replace('{saving}', `${currency} ${amount || '0.00'}`)
                : t('bankConversionNoteAssumed').replace('{currency}', currency).replace('{saving}', `${currency} ${amount || '0.00'}`)}</Text>}
             {captureUri && <View testID="capture-status" style={[styles.capturePreview, { borderColor: extracting ? palette.primary : palette.positive, backgroundColor: extracting ? palette.accent : palette.positiveSoft }]}>
               <Image source={{ uri: captureUri }} style={styles.captureImage} />
               {extracting ? (
                 <>
                   <ActivityIndicator testID="capture-loading" size="small" color={palette.primary} />
                   <Text style={[styles.captureText, { color: palette.primary }]}>{source === 'bank' ? t('captureProcessingBank') : t('captureProcessingReceipt')}</Text>
                 </>
               ) : (
                 <>
                   <Ionicons name="checkmark-circle" size={19} color={palette.positive} />
                   <Text style={[styles.captureText, { color: palette.positive }]}>{t('captureDone')}</Text>
                 </>
               )}
             </View>}
            <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('date')}</Text>
            <View style={[styles.fullInput, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.fullInputText, { color: palette.foreground }]}>{formatDate(new Date())}</Text></View>
            <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('bucket')}</Text>
             <View style={styles.bucketGrid}>{buckets.map((bucket) => <Pressable testID={`select-${bucket.id}`} key={bucket.id} onPress={() => setBucketId(bucket.id)} style={({ pressed }) => pressStyle(pressed, [styles.bucketChoice, { borderColor: bucketId === bucket.id ? palette.primary : palette.border, backgroundColor: bucketId === bucket.id ? palette.accent : palette.card }])}><MaterialCommunityIcons name={bucket.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={17} color={bucketId === bucket.id ? palette.primary : palette.mutedForeground} /><Text style={[styles.bucketChoiceText, { color: bucketId === bucket.id ? palette.primary : palette.foreground }]} numberOfLines={2}>{formatBucketLabel(t(bucket.labelKey))}</Text></Pressable>)}</View>
            <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('note')}</Text>
            <TextInput testID="note-input" value={note} onChangeText={setNote} placeholder={t('notePlaceholder')} placeholderTextColor={palette.mutedForeground} style={[styles.input, { borderColor: palette.border, color: palette.foreground, backgroundColor: palette.card }]} />
              <Pressable testID="save-transaction" disabled={extracting} onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary, opacity: extracting ? 0.6 : 1 }])}><Ionicons name="checkmark" size={19} color={palette.primaryForeground} /><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{extracting ? t('processing') : t('saveTransaction')}</Text></Pressable>
           </KeyboardAwareScrollViewCompat>
        </View>
       </View>
       <Modal visible={Boolean(currentDuplicate)} transparent animationType="fade" onRequestClose={() => setDuplicateQueue([])}>
         <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
           <View style={[styles.duplicateModalCard, { backgroundColor: palette.card }]}>
             <View style={[styles.confirmationIcon, { backgroundColor: palette.primary + '18' }]}>
               <Ionicons name="copy-outline" size={24} color={palette.primary} />
             </View>
             <Text style={[styles.confirmationTitle, { color: palette.foreground }]}>{t('possibleDuplicateTitle')}</Text>
             <Text style={[styles.confirmationMessage, { color: palette.mutedForeground }]}>{t('possibleDuplicateCopy')}</Text>
             {duplicateCandidate && <View style={[styles.duplicateComparison, { borderColor: palette.border, backgroundColor: palette.background }]}>
               <View style={styles.duplicateComparisonRow}><Text style={[styles.duplicateComparisonLabel, { color: palette.mutedForeground }]}>{t('newTransaction')}</Text><Text style={[styles.duplicateComparisonValue, { color: palette.foreground }]}>{duplicateCandidate.originalCurrency ?? currency} {(duplicateCandidate.originalAmount ?? duplicateCandidate.amount).toFixed(2)}</Text></View>
               <View style={styles.duplicateComparisonRow}><Text style={[styles.duplicateComparisonLabel, { color: palette.mutedForeground }]}>{t('note')}</Text><Text style={[styles.duplicateComparisonValue, { color: palette.foreground }]} numberOfLines={2}>{duplicateCandidate.note || t('uncategorised')}</Text></View>
               <View style={styles.duplicateComparisonRow}><Text style={[styles.duplicateComparisonLabel, { color: palette.mutedForeground }]}>{t('date')}</Text><Text style={[styles.duplicateComparisonValue, { color: palette.foreground }]}>{duplicateCandidate.date || formatDate(new Date())}</Text></View>
               {duplicateExisting ? <><View style={[styles.duplicateDivider, { backgroundColor: palette.border }]} /><View style={styles.duplicateComparisonRow}><Text style={[styles.duplicateComparisonLabel, { color: palette.mutedForeground }]}>{t('existingTransaction')}</Text><Text style={[styles.duplicateComparisonValue, { color: palette.foreground }]}>{formatTransactionMoney({ amount: duplicateExisting.amount, originalAmount: duplicateExisting.originalAmount, originalCurrency: duplicateExisting.originalCurrency ?? undefined })}</Text></View><View style={styles.duplicateComparisonRow}><Text style={[styles.duplicateComparisonLabel, { color: palette.mutedForeground }]}>{t('note')}</Text><Text style={[styles.duplicateComparisonValue, { color: palette.foreground }]} numberOfLines={2}>{duplicateExisting.note || t('uncategorised')}</Text></View><View style={styles.duplicateComparisonRow}><Text style={[styles.duplicateComparisonLabel, { color: palette.mutedForeground }]}>{t('date')}</Text><Text style={[styles.duplicateComparisonValue, { color: palette.foreground }]}>{duplicateExisting.date || '—'}</Text></View></> : <Text style={[styles.duplicateOverlapText, { color: palette.primary }]}>{t('duplicateCandidate')}</Text>}
             </View>}
             <View style={styles.duplicateActions}>
               {duplicateExisting && <Pressable testID="duplicate-replace" onPress={() => resolveDuplicate('replace')} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary }])}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('replace')}</Text></Pressable>}
               <Pressable testID="duplicate-add-anyway" onPress={() => resolveDuplicate('add')} style={({ pressed }) => pressStyle(pressed, [styles.secondaryButton, { borderColor: palette.border }])}><Text style={[styles.secondaryButtonText, { color: palette.foreground }]}>{t('addAnyway')}</Text></Pressable>
               <Pressable testID="duplicate-keep-existing" onPress={() => resolveDuplicate('skip')} style={({ pressed }) => pressStyle(pressed, [styles.secondaryButton, { borderColor: palette.border }])}><Text style={[styles.secondaryButtonText, { color: palette.foreground }]}>{duplicateExisting ? t('keepExisting') : t('keepFirst')}</Text></Pressable>
             </View>
           </View>
         </View>
       </Modal>
    </Modal>
  );
}

function AdvisorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, income, transactions, buckets, currency } = useVigil();
  const { getToken } = useIdentity();
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const ask = async () => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || loading) return;
    setLoading(true);
    setReply('');
    try {
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const context = [
        `Currency: ${currency}`,
        `Income: ${income}`,
        `Transactions: ${transactions.length}`,
        `Buckets: ${buckets.map((bucket) => `${bucket.labelKey} ${bucket.percent}%`).join(', ')}`,
        `Recent spending: ${transactions.slice(0, 5).map((item) => `${item.note} ${item.amount}`).join('; ') || 'none'}`,
      ].join('\n');
      const response = await fetch(`https://${domain}/api/vigil/advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: cleanQuestion, context }),
      });
      const data = await response.json() as { reply?: string; message?: string };
      if (!response.ok) throw new Error(data.message || 'The advisor is unavailable right now.');
       setSubmittedQuestion(cleanQuestion);
       setQuestion('');
      setReply(data.reply || 'I could not find a useful answer this time.');
    } catch (error) {
      setReply(error instanceof Error ? error.message : 'The advisor is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.advisorSheet, { backgroundColor: palette.background }]}>
        <View style={styles.modalGrabber} />
        <View style={styles.modalHeader}><View style={[styles.advisorBadge, { backgroundColor: palette.accent }]}><Ionicons name="sparkles" size={20} color={palette.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.modalTitle, { color: palette.foreground }]}>Ask AI</Text><Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>Your calm Financial Advisor, using this app's snapshot.</Text></View><Pressable onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={palette.foreground} /></Pressable></View>
        <ScrollView style={styles.advisorMessages} contentContainerStyle={styles.advisorMessagesContent} keyboardShouldPersistTaps="handled">
          {!reply && <View style={[styles.advisorWelcome, { backgroundColor: palette.secondary }]}><Text style={[styles.advisorWelcomeTitle, { color: palette.foreground }]}>What would make your money feel clearer today?</Text><Text style={[styles.advisorWelcomeCopy, { color: palette.mutedForeground }]}>Try “Can I afford this?” or “Where should I cut back this month?”</Text></View>}
           {!!submittedQuestion && <View style={[styles.advisorQuestion, { backgroundColor: palette.secondary }]}><Text style={[styles.advisorQuestionText, { color: palette.foreground }]}>{submittedQuestion}</Text></View>}
          {loading && <View style={[styles.advisorReply, { backgroundColor: palette.positiveSoft }]}><Ionicons name="ellipsis-horizontal" size={20} color={palette.positive} /><Text style={[styles.advisorReplyText, { color: palette.foreground }]}>Thinking through your plan…</Text></View>}
          {!!reply && <View style={[styles.advisorReply, { backgroundColor: palette.positiveSoft }]}><Ionicons name="sparkles-outline" size={18} color={palette.positive} /><Text style={[styles.advisorReplyText, { color: palette.foreground }]}>{reply}</Text></View>}
        </ScrollView>
        <View style={styles.advisorInputRow}><TextInput value={question} onChangeText={setQuestion} multiline placeholder="Ask about your spending…" placeholderTextColor={palette.mutedForeground} style={[styles.advisorInput, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} /><Pressable testID="send-ai-question" disabled={!question.trim() || loading} onPress={() => void ask()} style={[styles.advisorSend, { backgroundColor: question.trim() && !loading ? palette.primary : palette.track }]}><Ionicons name="arrow-up" size={19} color={question.trim() && !loading ? palette.primaryForeground : palette.mutedForeground} /></Pressable></View>
        <Text style={[styles.advisorDisclaimer, { color: palette.mutedForeground }]}>For guidance, not regulated financial, tax, or investment advice.</Text>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function IncomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, t, addIncome, toBaseAmount } = useVigil();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('salary');
  const save = () => {
    const numeric = Number(amount.replace(',', '.'));
    if (!numeric || numeric <= 0) { Alert.alert(t('amount'), t('enterPositiveAmount')); return; }
    addIncome(toBaseAmount(numeric), type); setAmount(''); onClose(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert(t('excellent'), t('positiveAction'));
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
         <KeyboardAwareScrollViewCompat
           style={styles.incomeKeyboard}
           contentContainerStyle={styles.incomeKeyboardContent}
           bottomOffset={24}
           keyboardShouldPersistTaps="handled"
         >
         <View style={[styles.incomeSheet, { backgroundColor: palette.background }]}>
          <View style={styles.modalGrabber} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('addIncome')}</Text>
              <Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('moreIncome')}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={palette.foreground} /></Pressable>
          </View>
          <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('amount')}</Text>
          <TextInput testID="income-input" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={palette.mutedForeground} keyboardType="decimal-pad" style={[styles.amountInput, { borderColor: palette.border, color: palette.foreground, backgroundColor: palette.card }]} />
          <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('incomeType')}</Text>
          <View style={styles.typeRow}>{['salary', 'commission', 'client', 'other'].map((item) => (
            <Pressable key={item} onPress={() => setType(item)} style={({ pressed }) => pressStyle(pressed, [styles.typeChip, { borderColor: type === item ? palette.primary : palette.border, backgroundColor: type === item ? palette.accent : palette.card }])}>
              <Text style={[styles.typeChipText, { color: type === item ? palette.primary : palette.foreground }]}>{t(item)}</Text>
            </Pressable>
          ))}</View>
          <Pressable testID="save-income" onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary }])}>
            <Ionicons name="add" size={19} color={palette.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('saveIncome')}</Text>
          </Pressable>
        </View>
         </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

function getGoalEmoji(name: string) {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (/(car|vehicle|auto|سيارة|سياره)/i.test(normalizedName)) return '🚗';
  if (/(home|house|rent|mortgage|apartment|منزل|بيت|إيجار|ايجار)/i.test(normalizedName)) return '🏠';
  if (/(travel|trip|vacation|holiday|رحلة|سفر|عطلة)/i.test(normalizedName)) return '✈️';
  if (/(emergency|rainy|buffer|طوارئ|احتياطي)/i.test(normalizedName)) return '🛟';
  if (/(education|school|university|course|study|تعليم|دراسة|جامعة|مدرسة)/i.test(normalizedName)) return '🎓';
  if (/(wedding|marriage|زواج|عرس)/i.test(normalizedName)) return '💍';
  if (/(baby|child|kids|family|طفل|أطفال|اطفال|عائلة|عائله)/i.test(normalizedName)) return '👨‍👩‍👧‍👦';
  if (/(phone|laptop|computer|tech|هاتف|جوال|كمبيوتر)/i.test(normalizedName)) return '💻';
  if (/(health|medical|doctor|صحة|صحّه|طبيب|علاج)/i.test(normalizedName)) return '🩺';
  if (/(business|startup|project|عمل|مشروع)/i.test(normalizedName)) return '💼';
  if (/(gift|هدية|هديه)/i.test(normalizedName)) return '🎁';
  if (/(save|saving|savings|future|ادخار|توفير|مستقبل)/i.test(normalizedName)) return '💰';
  return '🎯';
}

function formatGoalDateForDisplay(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return isoMatch ? `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}` : value;
}

function formatGoalDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function GoalCard({ goal, onAdd, onComplete, onRemove }: { goal: Goal; onAdd: () => void; onComplete: () => void; onRemove: () => void }) {
  const { palette, t, formatMoney, formatNumber } = useVigil();
  const progress = goal.target > 0 ? Math.min(100, (goal.allocated / goal.target) * 100) : 0;
  const remaining = Math.max(0, goal.target - goal.allocated);
  return (
    <View style={[styles.goalCard, { borderColor: palette.border, backgroundColor: palette.card }]}>
      <View style={styles.goalCardTop}>
        <View style={[styles.goalIcon, { backgroundColor: goal.status === 'completed' ? palette.positiveSoft : palette.secondary }]}>
          <Ionicons name={goal.status === 'completed' ? 'checkmark-circle-outline' : 'flag-outline'} size={20} color={goal.status === 'completed' ? palette.positive : palette.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.goalName, { color: palette.foreground }]} numberOfLines={1}>{getGoalEmoji(goal.name)} {goal.name}</Text>
          <Text style={[styles.goalMeta, { color: palette.mutedForeground }]}>
            {formatMoney(goal.allocated)} {t('of')} {formatMoney(goal.target)}
            {goal.targetDate ? ` · ${formatGoalDateForDisplay(goal.targetDate)}` : ''}
          </Text>
        </View>
        <Text style={[styles.goalPercent, { color: goal.status === 'completed' ? palette.positive : palette.foreground }]}>{formatNumber(Math.round(progress))}%</Text>
      </View>
      <View style={[styles.goalTrack, { backgroundColor: palette.track }]}><View style={[styles.goalFill, { width: `${progress}%`, backgroundColor: goal.status === 'completed' ? palette.positive : palette.primary }]} /></View>
      <View style={styles.goalFooter}>
        <Text style={[styles.goalRemaining, { color: palette.mutedForeground }]}>{goal.status === 'completed' ? t('goalCompleted') : `${formatMoney(remaining)} ${t('remaining')}`}</Text>
        <View style={styles.goalActions}>
          {goal.status === 'active' && <Pressable testID={`add-to-goal-${goal.id}`} onPress={onAdd} style={({ pressed }) => pressStyle(pressed, styles.goalAction)}><Ionicons name="add-circle-outline" size={16} color={palette.primary} /><Text style={[styles.goalActionText, { color: palette.primary }]}>{t('addToGoal')}</Text></Pressable>}
          {goal.status === 'active' && <Pressable testID={`complete-goal-${goal.id}`} onPress={onComplete} style={styles.goalAction}><Ionicons name="checkmark" size={16} color={palette.positive} /><Text style={[styles.goalActionText, { color: palette.positive }]}>{t('complete')}</Text></Pressable>}
          <Pressable testID={`delete-goal-${goal.id}`} onPress={onRemove} style={styles.goalAction}><Ionicons name="trash-outline" size={15} color={palette.mutedForeground} /></Pressable>
        </View>
      </View>
    </View>
  );
}

function GoalEditor({ visible, currency, onClose, onSave }: { visible: boolean; currency: CurrencyCode; onClose: () => void; onSave: (goal: { name: string; target: number; allocated: number; targetDate: string | null }) => void }) {
  const { palette, t } = useVigil();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [allocated, setAllocated] = useState('');
  const [targetDate, setTargetDate] = useState('');
  useEffect(() => {
    if (visible) {
      setName('');
      setTarget('');
      setAllocated('');
      setTargetDate('');
    }
  }, [visible]);
  const save = () => {
    const cleanName = name.trim();
    const numericTarget = Number(target.replace(',', '.'));
    const numericAllocated = Number(allocated.replace(',', '.')) || 0;
    if (!cleanName || !Number.isFinite(numericTarget) || numericTarget <= 0) {
      Alert.alert(t('goal'), t('goalRequired'));
      return;
    }
    onSave({ name: cleanName, target: numericTarget, allocated: Math.max(0, numericAllocated), targetDate: targetDate.trim() || null });
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.editorKeyboardContent} bottomOffset={24}>
          <View style={[styles.editorCard, { backgroundColor: palette.card }]}>
            <Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('newGoal')}</Text>
            <Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('goalCopy')}</Text>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder={t('goalName')} placeholderTextColor={palette.mutedForeground} style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />
            <TextInput value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder={`${t('goalTarget')} · ${currency}`} placeholderTextColor={palette.mutedForeground} style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />
            <TextInput value={allocated} onChangeText={setAllocated} keyboardType="decimal-pad" placeholder={`${t('goalAllocated')} · ${currency}`} placeholderTextColor={palette.mutedForeground} style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />
            <TextInput value={targetDate} onChangeText={(value) => setTargetDate(formatGoalDateInput(value))} placeholder={t('goalDatePlaceholder')} placeholderTextColor={palette.mutedForeground} autoCapitalize="none" keyboardType="number-pad" style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />
            <View style={styles.editorActions}>
              <Pressable onPress={onClose} style={({ pressed }) => pressStyle(pressed, [styles.secondaryButton, { borderColor: palette.border }])}><Text style={[styles.secondaryButtonText, { color: palette.foreground }]}>{t('cancel')}</Text></Pressable>
              <Pressable onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, styles.editorSave, { backgroundColor: palette.primary }])}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('saveGoal')}</Text></Pressable>
            </View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

function GoalContributionEditor({ goal, visible, currency, onClose, onSave }: { goal: Goal | null; visible: boolean; currency: CurrencyCode; onClose: () => void; onSave: (amount: number) => void }) {
  const { palette, t } = useVigil();
  const [amount, setAmount] = useState('');
  useEffect(() => {
    if (visible) setAmount('');
  }, [visible, goal?.id]);
  const save = () => {
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      Alert.alert(t('amount'), t('enterPositiveAmount'));
      return;
    }
    onSave(numeric);
  };
  return (
    <Modal visible={visible && Boolean(goal)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.editorKeyboardContent} bottomOffset={24}>
          <View style={[styles.editorCard, { backgroundColor: palette.card }]}>
            <Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('addToGoal')}</Text>
            <Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{goal?.name}</Text>
            <Text style={[styles.goalContributionHint, { color: palette.mutedForeground }]}>{t('goalContributionCopy')}</Text>
            <TextInput autoFocus value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={`${t('amount')} · ${currency}`} placeholderTextColor={palette.mutedForeground} style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />
            <View style={styles.editorActions}>
              <Pressable onPress={onClose} style={({ pressed }) => pressStyle(pressed, [styles.secondaryButton, { borderColor: palette.border }])}><Text style={[styles.secondaryButtonText, { color: palette.foreground }]}>{t('cancel')}</Text></Pressable>
              <Pressable testID="save-goal-contribution" onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, styles.editorSave, { backgroundColor: palette.primary }])}><Ionicons name="add" size={18} color={palette.primaryForeground} /><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('addToGoal')}</Text></Pressable>
            </View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

function TransactionDetailsModal({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) {
  const { palette, t, buckets, updateTransaction, formatTransactionMoney, formatDate } = useVigil();
  const [note, setNote] = useState('');
  const [bucketId, setBucketId] = useState<BucketId>('needs');
  useEffect(() => {
    if (!transaction) return;
    setNote(transaction.note);
    setBucketId(transaction.bucketId);
  }, [transaction]);
  if (!transaction) return null;
  const bucket = buckets.find((item) => item.id === bucketId);
  const save = () => {
    updateTransaction(transaction.id, { ...transaction, note: note.trim() || t('uncategorised'), bucketId });
    onClose();
  };
  return (
    <Modal visible={Boolean(transaction)} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
        <KeyboardAwareScrollViewCompat style={styles.incomeKeyboard} contentContainerStyle={styles.incomeKeyboardContent} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <View style={[styles.incomeSheet, { backgroundColor: palette.background }]}>
            <View style={styles.modalGrabber} />
            <View style={styles.modalHeader}>
              <View><Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('transactionDetails')}</Text><Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{formatDate(transaction.date)}</Text></View>
              <Pressable onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={palette.foreground} /></Pressable>
            </View>
            <View style={[styles.transactionDetailAmount, { backgroundColor: palette.secondary }]}><Text style={[styles.eyebrow, { color: palette.mutedForeground }]}>{t('amount')}</Text><Text style={[styles.transactionDetailValue, { color: palette.foreground }]}>-{formatTransactionMoney(transaction)}</Text><Text style={[styles.transactionDetailMeta, { color: palette.mutedForeground }]}>{t(transaction.source)} · {transaction.originalCurrency || transaction.currency}</Text></View>
            <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('note')}</Text>
            <TextInput value={note} onChangeText={setNote} placeholder={t('note')} placeholderTextColor={palette.mutedForeground} style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.card }]} />
            <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('bucket')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>{buckets.map((item) => <Pressable key={item.id} onPress={() => setBucketId(item.id)} style={[styles.typeChip, { borderColor: item.id === bucketId ? palette.primary : palette.border, backgroundColor: item.id === bucketId ? palette.accent : palette.card }]}><Text style={[styles.typeChipText, { color: item.id === bucketId ? palette.primary : palette.foreground }]}>{t(item.labelKey)}</Text></Pressable>)}</ScrollView>
            <Text style={[styles.transactionDetailBucket, { color: palette.mutedForeground }]}>{t('savedIn')} {bucket ? t(bucket.labelKey) : ''}</Text>
            <Pressable onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary }])}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('saveTransaction')}</Text></Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

function IncomeDetailsModal({ entry, onClose }: { entry: IncomeEntry | null; onClose: () => void }) {
  const { palette, t, formatMoney, removeIncome } = useVigil();
  if (!entry) return null;
  const remove = () => {
    Alert.alert(t('deleteIncome'), t('deleteIncomeCopy'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => { removeIncome(entry.id); onClose(); } },
    ]);
  };
  return (
    <Modal visible={Boolean(entry)} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.incomeSheet, { backgroundColor: palette.background }]}>
          <View style={styles.modalGrabber} />
          <View style={styles.modalHeader}>
            <View><Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('incomeDetails')}</Text><Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('incoming')} · {entry.date}</Text></View>
            <Pressable onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={palette.foreground} /></Pressable>
          </View>
          <View style={[styles.transactionDetailAmount, { backgroundColor: palette.positiveSoft }]}>
            <Text style={[styles.eyebrow, { color: palette.mutedForeground }]}>{t('incoming')}</Text>
            <Text style={[styles.transactionDetailValue, { color: palette.positive }]}>+{formatMoney(entry.amount)}</Text>
            <Text style={[styles.transactionDetailMeta, { color: palette.mutedForeground }]}>{t(entry.type)}</Text>
          </View>
          <Pressable testID={`delete-income-${entry.id}`} onPress={remove} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.destructive }])}>
            <Ionicons name="trash-outline" size={18} color={palette.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('delete')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function GoalsSection({ onUnlock }: { onUnlock: () => void }) {
  const { palette, t, goals, currency, addGoal, updateGoal, completeGoal, removeGoal, formatMoney, toBaseAmount } = useVigil();
  const { isPro } = useSubscription();
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [goalEditorVisible, setGoalEditorVisible] = useState(false);
  const [contributionGoal, setContributionGoal] = useState<Goal | null>(null);
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const openGoalEditor = () => {
    if (!canAddActiveGoal(goals, isPro)) {
      onUnlock();
      return;
    }
    setGoalEditorVisible(true);
  };
  const saveContribution = (displayAmount: number) => {
    if (!contributionGoal) return;
    const amount = toBaseAmount(displayAmount);
    const nextAllocated = Math.min(contributionGoal.target, contributionGoal.allocated + amount);
    updateGoal(contributionGoal.id, { allocated: nextAllocated });
    setContributionGoal(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const visibleGoals = goals.filter((goal) => filter === 'all' || goal.status === filter);
  return (
    <>
      <LinearGradient colors={[palette.primary, '#c71931']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.goalsHero}>
        <View style={styles.goalsHeroTop}><View style={{ flex: 1 }}><Text style={styles.goalsHeroEyebrow}>{t('goalsHeroEyebrow')}</Text><Text style={styles.goalsHeroTitle}>{t('goalsHeroTitle')}</Text></View><View style={styles.goalsHeroIcon}><Ionicons name="flag-outline" size={24} color="#ffffff" /></View></View>
        <Text style={styles.goalsHeroCopy}>{t('goalsHeroCopy')}</Text>
      </LinearGradient>
      <View style={[styles.goalFilters, { backgroundColor: palette.secondary }]}>{(['active', 'completed', 'all'] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={({ pressed }) => pressStyle(pressed, [styles.goalFilter, filter === item && { backgroundColor: palette.primary }])}><Text style={[styles.goalFilterText, { color: filter === item ? palette.primaryForeground : palette.mutedForeground }]}>{t(item === 'active' ? 'goalActiveFilter' : item === 'completed' ? 'goalCompletedFilter' : 'goalAllFilter')}</Text></Pressable>)}</View>
      <View style={styles.goalsSectionHeader}><View><Text style={[styles.sectionTitle, { color: palette.foreground }]}>{t('goals')}</Text><Text style={[styles.goalsSectionCopy, { color: palette.mutedForeground }]}>{isPro ? t('proGoalsCopy') : activeGoals.length ? t('oneGoalFreeCopy') : t('firstGoalFreeCopy')}</Text></View><Pressable testID="add-goal-button" onPress={openGoalEditor} style={({ pressed }) => pressStyle(pressed, [styles.addGoalButton, { borderColor: palette.primary, backgroundColor: palette.accent }])}><Ionicons name="add" size={17} color={palette.primary} /><Text style={[styles.addBucketText, { color: palette.primary }]}>{t('newGoal')}{!isPro && goals.length >= 1 ? ` · ${t('pro')}` : ''}</Text></Pressable></View>
      {visibleGoals.length === 0 && <View style={[styles.emptyGoalCard, { borderColor: palette.border, backgroundColor: palette.card }]}><View style={[styles.emptyGoalIcon, { backgroundColor: palette.accent }]}><Ionicons name="flag-outline" size={22} color={palette.primary} /></View><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{filter === 'completed' ? t('noCompletedGoals') : t('noGoals')}</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{t('noGoalsCopy')}</Text></View>}
      {visibleGoals.map((goal) => <GoalCard key={goal.id} goal={goal} onAdd={() => setContributionGoal(goal)} onComplete={() => completeGoal(goal.id)} onRemove={() => Alert.alert(t('deleteGoal'), t('deleteGoalCopy'), [{ text: t('cancel'), style: 'cancel' }, { text: t('delete'), style: 'destructive', onPress: () => removeGoal(goal.id) }])} />)}
      <GoalEditor visible={goalEditorVisible} currency={currency} onClose={() => setGoalEditorVisible(false)} onSave={(goal) => { addGoal({ name: goal.name, target: toBaseAmount(goal.target), allocated: Math.min(toBaseAmount(goal.allocated), toBaseAmount(goal.target)), currency, targetDate: goal.targetDate }, isPro); setGoalEditorVisible(false); }} />
      <GoalContributionEditor goal={contributionGoal} visible={Boolean(contributionGoal)} currency={currency} onClose={() => setContributionGoal(null)} onSave={saveContribution} />
    </>
  );
}

function PlanScreen({ onIncome, onUnlock }: { onIncome: () => void; onUnlock: () => void }) {
  const { palette, t, buckets, income, transactions, setBucketPercent, addBucket, updateBucket, removeBucket, formatMoney, formatNumber } = useVigil();
  const { isPro } = useSubscription();
  const [editing, setEditing] = useState<Bucket | null>(null);
  const [adding, setAdding] = useState(false);
  const total = buckets.reduce((sum, item) => sum + item.percent, 0);
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Header screen="plan" />
      <View style={[styles.planIntro, { backgroundColor: palette.accent }]}>
        <Ionicons name="compass-outline" size={25} color={palette.primary} />
        <View style={{ flex: 1 }}><Text style={[styles.planIntroTitle, { color: palette.foreground }]}>{t('buckets')}</Text><Text style={[styles.planIntroCopy, { color: palette.secondaryForeground }]}>{t('bucketCopy')}</Text></View>
      </View>
      <Pressable testID="add-income-button" onPress={onIncome} style={({ pressed }) => pressStyle(pressed, [styles.planIncomeButton, { backgroundColor: palette.primary }])}>
        <View style={styles.planIncomeIcon}><Ionicons name="add" size={20} color={palette.primary} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.planIncomeTitle, { color: palette.primaryForeground }]}>{t('addIncome')}</Text><Text style={[styles.planIncomeCopy, { color: palette.primaryForeground }]}>{t('addIncomeCopy')}</Text></View>
        <Ionicons name="arrow-forward" size={19} color={palette.primaryForeground} />
      </Pressable>
      <View style={[styles.planSummary, { borderColor: palette.border, backgroundColor: palette.card }]}>
        <View><Text style={[styles.eyebrow, { color: palette.mutedForeground }]}>{t('total').toUpperCase()}</Text><Text style={[styles.planTotal, { color: total === 100 ? palette.positive : palette.warning }]}>{formatNumber(total)}%</Text></View>
        <Text style={[styles.planSummaryCopy, { color: palette.mutedForeground }]}>{formatMoney(income)} {t('income').toLowerCase()}<Text>{'\n'}{t('needsUnder')}</Text></Text>
      </View>
      <View style={styles.bucketManagerHeading}><Text style={[styles.sectionTitle, { color: palette.foreground }]}>{t('buckets')}</Text><Pressable testID="add-bucket-button" onPress={() => runProAction(isPro, onUnlock, () => setAdding(true))} style={({ pressed }) => pressStyle(pressed, [styles.addBucketButton, { borderColor: palette.primary, backgroundColor: palette.accent }])}><Ionicons name="add" size={16} color={palette.primary} /><Text style={[styles.addBucketText, { color: palette.primary }]}>Add bucket{!isPro ? ' · Pro' : ''}</Text></Pressable></View>
      {buckets.map((bucket) => {
        const bucketSpent = transactions.filter((item) => item.bucketId === bucket.id).reduce((sum, item) => sum + item.amount, 0);
         return <Pressable key={bucket.id} onPress={() => runProAction(isPro, onUnlock, () => setEditing(bucket))} style={({ pressed }) => pressStyle(pressed, [styles.planRow, { borderColor: palette.border, backgroundColor: palette.card }])}>
          <View style={[styles.bucketIcon, { backgroundColor: palette.secondary }]}><MaterialCommunityIcons name={bucket.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={20} color={toneColor(bucket.tone, palette)} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.bucketLabel, { color: palette.foreground }]} numberOfLines={1}>{t(bucket.labelKey)}</Text><Text style={[styles.planSpent, { color: palette.mutedForeground }]}>{formatMoney(bucketSpent)} {t('spent')}</Text></View>
          <View style={styles.planPercent}><Text style={[styles.percentValue, { color: palette.foreground }]}>{formatNumber(bucket.percent)}%</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></View>
        </Pressable>;
      })}
      <BucketEditor bucket={editing} onClose={() => setEditing(null)} onSave={(label, value) => { if (editing) { updateBucket(editing.id, label); setBucketPercent(editing.id, value); } setEditing(null); }} onDelete={() => { if (editing) removeBucket(editing.id); setEditing(null); }} />
      <BucketEditor bucket={adding ? { id: 'new', labelKey: '', icon: 'folder-outline', percent: 0, tone: 'fun' } : null} isNew onClose={() => setAdding(false)} onSave={(label, value) => { addBucket(label, value); setAdding(false); }} />
    </ScrollView>
  );
}

function BucketEditor({ bucket, isNew = false, onClose, onSave, onDelete }: { bucket: Bucket | null; isNew?: boolean; onClose: () => void; onSave: (label: string, value: number) => void; onDelete?: () => void }) {
  const { palette, t } = useVigil();
  const [label, setLabel] = useState(bucket?.labelKey ?? '');
  const [value, setValue] = useState(bucket ? String(bucket.percent) : '');
  React.useEffect(() => { setLabel(bucket?.labelKey ?? ''); setValue(bucket ? String(bucket.percent) : ''); }, [bucket]);
  const save = () => {
    if (!label.trim()) { Alert.alert(t('bucketName'), t('bucketNameCopy')); return; }
    onSave(label, Number(value) || 0);
  };
  return <Modal visible={!!bucket} transparent animationType="fade" onRequestClose={onClose}><View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}><KeyboardAwareScrollViewCompat contentContainerStyle={styles.editorKeyboardContent} bottomOffset={24}>
    <View style={[styles.editorCard, { backgroundColor: palette.card }]}>
    <Text style={[styles.modalTitle, { color: palette.foreground }]}>{isNew ? t('bucketName') : bucket ? t(bucket.labelKey) : ''}</Text>
    <Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('bucketCopy')}</Text>
    <TextInput autoFocus={isNew} returnKeyType="next" value={label} onChangeText={setLabel} placeholder={t('bucketName')} placeholderTextColor={palette.mutedForeground} style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />
    <View style={styles.editorInputRow}><TextInput returnKeyType="done" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={palette.mutedForeground} style={[styles.editorInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} /><Text style={[styles.percentSuffix, { color: palette.mutedForeground }]}>%</Text></View>
    <View style={styles.editorActions}><Pressable onPress={onClose} style={({ pressed }) => pressStyle(pressed, [styles.secondaryButton, { borderColor: palette.border }])}><Text style={[styles.secondaryButtonText, { color: palette.foreground }]}>{t('cancel')}</Text></Pressable><Pressable onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, styles.editorSave, { backgroundColor: palette.primary }])}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('saved')}</Text></Pressable></View>
    {!isNew && onDelete && <Pressable onPress={() => Alert.alert(t('removeBucket'), t('removeBucketCopy'), [{ text: t('cancel'), style: 'cancel' }, { text: t('removeBucketButton'), style: 'destructive', onPress: onDelete }])} style={styles.deleteBucketAction}><Ionicons name="trash-outline" size={16} color={palette.destructive} /><Text style={[styles.deleteBucketText, { color: palette.destructive }]}>{t('removeBucketButton')}</Text></Pressable>}
    </View>
  </KeyboardAwareScrollViewCompat></View></Modal>;
}

function HistoryScreen({ onUnlock }: { onUnlock: () => void }) {
  const { palette, t, transactions, incomeEntries, buckets, removeTransaction: deleteTransaction, formatMoney, formatTransactionMoney, formatDate, language } = useVigil();
  const params = useLocalSearchParams<{ bucketId?: string; month?: string }>();
  const [filter, setFilter] = useState<DateFilter>(params.month ? 'month' : 'all');
  const [query, setQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedIncome, setSelectedIncome] = useState<IncomeEntry | null>(null);
  const [month, setMonth] = useState(() => {
    if (params.month) {
      const [year, monthValue] = params.month.split('-').map(Number);
      if (Number.isFinite(year) && Number.isFinite(monthValue) && monthValue >= 1 && monthValue <= 12) return { year, month: monthValue - 1 };
    }
    return monthPeriod();
  });
  const locale = language === 'en' ? 'en-US' : language;
  const removeTransaction = (id: string) => Alert.alert(t('deleteTransaction'), t('deleteTransactionCopy'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('delete'), style: 'destructive', onPress: () => deleteTransaction(id) },
  ]);
  const filtered = useMemo(() => {
    const byDate = filterTransactions(transactions, filter, new Date(), month);
    const normalized = query.trim().toLocaleLowerCase();
    return byDate.filter((item) => {
      const bucket = buckets.find((candidate) => candidate.id === item.bucketId);
      return !normalized || item.note.toLocaleLowerCase().includes(normalized) || (bucket ? t(bucket.labelKey).toLocaleLowerCase().includes(normalized) : false);
    }).filter((item) => !params.bucketId || item.bucketId === params.bucketId);
  }, [buckets, filter, month, params.bucketId, query, t, transactions]);
  const groups = groupTransactionsByDay(filtered, locale);
  const visibleIncome = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return incomeEntries.filter((item) => {
      if (normalized && !`${item.type} ${t(item.type)}`.toLocaleLowerCase().includes(normalized)) return false;
      if (filter === 'month') return item.date.startsWith(`${month.year}-${String(month.month + 1).padStart(2, '0')}`);
      if (filter === 'today') return item.date === new Date().toISOString().slice(0, 10);
      if (filter === '7d' || filter === '30d' || filter === '3m' || filter === '6m' || filter === '1y') {
        const age = Date.now() - new Date(`${item.date}T12:00:00`).getTime();
        const days = filter === '7d' ? 7 : filter === '30d' ? 30 : filter === '3m' ? 92 : filter === '6m' ? 184 : 366;
        return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [filter, incomeEntries, month, query, t]);
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);
  return <>
   <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <Header screen="history" />
    <View style={[styles.historyBanner, { backgroundColor: palette.secondary }]}><Ionicons name="time-outline" size={22} color={palette.primary} /><Text style={[styles.historyBannerText, { color: palette.secondaryForeground }]}>{t('historyCopy')}</Text></View>
    <TextInput value={query} onChangeText={setQuery} placeholder={t('searchTransactions')} placeholderTextColor={palette.mutedForeground} style={[styles.historySearch, { borderColor: palette.border, color: palette.foreground, backgroundColor: palette.card }]} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
       {([['all', t('allTime')], ['today', t('today')], ['7d', t('last7Days')], ['30d', t('last30Days')], ['month', t('thisMonth')], ['3m', t('last3Months')], ['6m', t('last6Months')], ['1y', t('lastYear')]] as [DateFilter, string][]).map(([id, label]) => <Pressable key={id} onPress={() => setFilter(id)} style={[styles.filterChip, { borderColor: filter === id ? palette.primary : palette.border, backgroundColor: filter === id ? palette.accent : palette.card }]}><Text style={[styles.filterChipText, { color: filter === id ? palette.primary : palette.foreground }]}>{label}</Text></Pressable>)}
    </ScrollView>
    {filter === 'month' && <View style={[styles.monthNavigator, { borderColor: palette.border, backgroundColor: palette.card }]}><Pressable onPress={() => setMonth((current) => shiftMonth(current, -1))}><Ionicons name="chevron-back" size={19} color={palette.foreground} /></Pressable><Text style={[styles.monthNavigatorText, { color: palette.foreground }]}>{periodLabel(month, locale)}</Text><Pressable onPress={() => setMonth((current) => shiftMonth(current, 1))}><Ionicons name="chevron-forward" size={19} color={palette.foreground} /></Pressable></View>}
    <View style={styles.historySummary}><Text style={[styles.sectionTitle, { color: palette.foreground }]}>{t('transactions')}</Text><Text style={[styles.historyTotal, { color: palette.foreground }]}>{formatMoney(total)}</Text></View>
     {groups.length === 0 && visibleIncome.length === 0 ? <View style={[styles.historyCard, { borderColor: palette.border, backgroundColor: palette.card }]}><View style={styles.emptyState}><Ionicons name="file-tray-outline" size={28} color={palette.mutedForeground} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{t('noMatchingTransactions')}</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{t('noTransactionsCopy')}</Text></View></View> : groups.map((group) => <View key={group.key}><Text style={[styles.historyGroupTitle, { color: palette.mutedForeground }]}>{group.label}</Text><View style={[styles.historyCard, { borderColor: palette.border, backgroundColor: palette.card }]}>{group.items.map((item) => { const bucket = buckets.find((candidate) => candidate.id === item.bucketId); return <Pressable key={item.id} testID={`transaction-${item.id}`} onPress={() => setSelectedTransaction(item)} style={({ pressed }) => pressStyle(pressed, [styles.transactionRow, { borderBottomColor: palette.border }])}><View style={[styles.transactionIcon, { backgroundColor: palette.secondary }]}><MaterialCommunityIcons name={bucket?.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={palette.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.transactionNote, { color: palette.foreground }]} numberOfLines={1}>{item.note}</Text><Text style={[styles.transactionMeta, { color: palette.mutedForeground }]}>{bucket ? t(bucket.labelKey) : ''} • {formatDate(item.date, { month: 'short', day: 'numeric' })}</Text></View><Text style={[styles.transactionAmount, { color: palette.foreground }]}>-{formatTransactionMoney(item)}</Text><Pressable testID={`delete-${item.id}`} onPress={(event) => { event.stopPropagation(); removeTransaction(item.id); }} style={({ pressed }) => pressStyle(pressed, styles.deleteButton)}><Ionicons name="trash-outline" size={17} color={palette.mutedForeground} /></Pressable></Pressable>; })}</View></View>)}
     {visibleIncome.length > 0 && <View><Text style={[styles.historyGroupTitle, { color: palette.positive }]}>{t('incomeHistory')}</Text><View style={[styles.historyCard, { borderColor: palette.border, backgroundColor: palette.card }]}>{visibleIncome.map((item) => <Pressable key={item.id} testID={`income-${item.id}`} onPress={() => setSelectedIncome(item)} style={({ pressed }) => pressStyle(pressed, [styles.transactionRow, { borderBottomColor: palette.border }])}><View style={[styles.transactionIcon, { backgroundColor: palette.positiveSoft }]}><Ionicons name="arrow-down-outline" size={18} color={palette.positive} /></View><View style={{ flex: 1 }}><Text style={[styles.transactionNote, { color: palette.foreground }]}>{t(item.type)}</Text><Text style={[styles.transactionMeta, { color: palette.mutedForeground }]}>{t('incoming')} · {formatDate(item.date, { month: 'short', day: 'numeric' })}</Text></View><Text style={[styles.transactionAmount, { color: palette.positive }]}>+{formatMoney(item.amount)}</Text><Ionicons name="chevron-forward" size={17} color={palette.mutedForeground} /></Pressable>)}</View></View>}
    <TransactionDetailsModal transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
     <IncomeDetailsModal entry={selectedIncome} onClose={() => setSelectedIncome(null)} />
   </ScrollView>
  </>;
}

 function AnalysisDonut({ breakdown, total, formatMoney }: { breakdown: ReturnType<typeof categoryBreakdown>; total: number; formatMoney: (value: number) => string }) {
  const { palette, t } = useVigil();
   const radius = 73;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = [palette.primary, palette.warning, palette.positive, '#8b5cf6', '#1598f2', '#ef76b5', palette.mutedForeground];
   return <View style={styles.donutWrap}><Svg width={224} height={224} viewBox="0 0 224 224"><Circle cx="112" cy="112" r={radius} stroke={palette.track} strokeWidth="24" fill="none" /><Circle cx="112" cy="112" r={radius} stroke={palette.background} strokeWidth="26" fill="none" opacity={0.95} strokeDasharray="2 2" /><Circle cx="112" cy="112" r={radius} stroke={colors[0]} strokeWidth="24" fill="none" opacity={0} />{breakdown.map((item) => { const length = circumference * (item.percentage / 100); const node = <Circle key={item.bucketId} cx="112" cy="112" r={radius} stroke={colors[item.colorIndex % colors.length]} strokeWidth="24" fill="none" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 112 112)" />; offset += length; return node; })}</Svg><View style={styles.donutCenter}><Text style={[styles.donutLabel, { color: palette.mutedForeground }]}>{t('totalSpent')}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.donutValue, { color: palette.foreground }]}>{formatMoney(total)}</Text><Text style={[styles.donutMeta, { color: palette.primary }]}>{t('actualDataOnly')}</Text></View></View>;
}

 function AnalysisScreen({ onUnlock }: { onUnlock: () => void }) {
  const { palette, t, income, incomeEntries, transactions, buckets, formatMoney, formatNumber, formatPercent, language } = useVigil();
  const { isPro } = useSubscription();
  const [tab, setTab] = useState<'expenses' | 'income' | 'savings'>('expenses');
  const [period, setPeriod] = useState(monthPeriod());
  const locale = language === 'en' ? 'en-US' : language;
  const periodTransactions = useMemo(() => transactionsForMonth(transactions, period), [period, transactions]);
  const breakdown = useMemo(() => categoryBreakdown(periodTransactions, buckets), [buckets, periodTransactions]);
  const summary = useMemo(() => savingsSummary(income, periodTransactions, incomeEntries, period), [income, incomeEntries, period, periodTransactions]);
  const periodIncome = incomeForMonth(incomeEntries, period);
  const incomeSources = useMemo(() => {
    const entries = incomeEntries.filter((item) => item.date.startsWith(`${period.year}-${String(period.month + 1).padStart(2, '0')}`));
    const grouped = new Map<string, number>();
    entries.forEach((item) => grouped.set(item.type, (grouped.get(item.type) ?? 0) + item.amount));
    if (!entries.length && income > 0) grouped.set('recorded', income);
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  }, [income, incomeEntries, period]);
  const totalSpent = periodTransactions.reduce((sum, item) => sum + item.amount, 0);
  const tabLabel = tab === 'expenses' ? t('expenses') : tab === 'income' ? t('income') : t('savings');
   return <ScrollView contentContainerStyle={[styles.scrollContent, styles.analysisScrollContent]} showsVerticalScrollIndicator={false}>
     <Header screen="spending" />
     <LinearGradient colors={[palette.primary, '#c71931']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.analysisHero}>
       <View style={styles.analysisHeroTop}><View style={{ flex: 1 }}><Text style={styles.analysisHeroEyebrow}>{t('analysisHeroEyebrow')}</Text><Text style={styles.analysisHeroTitle}>{t('analysisHeroTitle')}</Text></View><View style={styles.analysisHeroIcon}><Ionicons name="analytics-outline" size={24} color="#ffffff" /></View></View>
       <Text style={styles.analysisHeroCopy}>{t('analysisHeroCopy')}</Text>
       <View style={styles.analysisHeroFooter}><Text style={styles.analysisHeroMeta}>{t('actualDataOnly')}</Text><Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.85)" /></View>
     </LinearGradient>
     <View style={[styles.analysisMonthCard, { borderColor: palette.border, backgroundColor: palette.card }]}><View><Text style={[styles.analysisPeriodEyebrow, { color: palette.mutedForeground }]}>{t('analysisPeriod')}</Text><Text style={[styles.analysisMonth, { color: palette.foreground }]}>{periodLabel(period, locale)}</Text></View><View style={styles.analysisMonthActions}><Pressable accessibilityLabel={t('previousMonth')} onPress={() => setPeriod((current) => shiftMonth(current, -1))} style={({ pressed }) => pressStyle(pressed, [styles.monthButton, { backgroundColor: palette.background }])}><Ionicons name="chevron-back" size={18} color={palette.foreground} /></Pressable><Pressable accessibilityLabel={t('nextMonth')} disabled={period.year === monthPeriod().year && period.month >= monthPeriod().month} onPress={() => setPeriod((current) => shiftMonth(current, 1))} style={({ pressed }) => pressStyle(pressed, [styles.monthButton, { backgroundColor: palette.background }, period.year === monthPeriod().year && period.month >= monthPeriod().month && { opacity: 0.35 }])}><Ionicons name="chevron-forward" size={18} color={palette.foreground} /></Pressable></View></View>
     <View style={[styles.analysisTabs, { backgroundColor: palette.secondary }]}>{(['expenses', 'income', 'savings'] as const).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={({ pressed }) => pressStyle(pressed, [styles.analysisTab, tab === item && { backgroundColor: palette.primary }])}><Text style={[styles.analysisTabText, { color: tab === item ? palette.primaryForeground : palette.mutedForeground }]}>{t(item)}</Text></Pressable>)}</View>
     {tab !== 'expenses' && <View style={[styles.snapshotCard, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.eyebrow, { color: palette.mutedForeground }]}>{t('monthlySnapshot').toUpperCase()}</Text><View style={styles.snapshotGrid}><View><Text style={[styles.snapshotLabel, { color: palette.mutedForeground }]}>{t('income')}</Text><Text style={[styles.snapshotValue, { color: palette.foreground }]}>{formatMoney(summary.income)}</Text></View><View><Text style={[styles.snapshotLabel, { color: palette.mutedForeground }]}>{t('expenses')}</Text><Text style={[styles.snapshotValue, { color: palette.foreground }]}>{formatMoney(summary.expenses)}</Text></View><View><Text style={[styles.snapshotLabel, { color: palette.mutedForeground }]}>{t('saved')}</Text><Text style={[styles.snapshotValue, { color: palette.positive }]}>{formatMoney(summary.retained)}</Text></View><View><Text style={[styles.snapshotLabel, { color: palette.mutedForeground }]}>{t('savingsRate')}</Text><Text style={[styles.snapshotValue, { color: palette.positive }]}>{formatPercent(summary.rate)}</Text></View></View></View>}
     {tab === 'expenses' && <><View style={[styles.analysisChartCard, { borderColor: palette.border, backgroundColor: palette.card }]}><AnalysisDonut breakdown={breakdown} total={totalSpent} formatMoney={formatMoney} /><View style={styles.chartHeadline}><Text style={[styles.chartTitle, { color: palette.foreground }]}>{t('expenses')}</Text><Text style={[styles.chartAmount, { color: palette.foreground }]}>{formatMoney(totalSpent)}</Text><Text style={[styles.chartMeta, { color: palette.mutedForeground }]}>{t('analysisChartHint')}</Text></View></View><View style={styles.analysisBreakdown}><View style={styles.analysisBreakdownHeader}><Text style={[styles.analysisBreakdownTitle, { color: palette.foreground }]}>{t('spendingByCategory')}</Text><Text style={[styles.analysisBreakdownMeta, { color: palette.mutedForeground }]}>{formatMoney(totalSpent)}</Text></View>{breakdown.length === 0 ? <View style={styles.emptyState}><Ionicons name="pie-chart-outline" size={28} color={palette.mutedForeground} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{t('noAnalysisData')}</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{t('analysisDataCopy')}</Text></View> : breakdown.map((item, index) => <Pressable key={item.bucketId} onPress={() => router.push({ pathname: '/history', params: { bucketId: item.bucketId, month: `${period.year}-${String(period.month + 1).padStart(2, '0')}` } })} style={({ pressed }) => pressStyle(pressed, [styles.analysisCategoryRow, { borderColor: palette.border, backgroundColor: palette.card }])}><View style={[styles.categoryDot, { backgroundColor: [palette.primary, palette.warning, palette.positive, '#8b5cf6', '#1598f2', '#ef76b5', palette.mutedForeground][index % 7] }]} /><Text style={[styles.categoryLabel, { color: palette.foreground }]}>{t(item.labelKey)}</Text><Text style={[styles.categoryAmount, { color: palette.foreground }]}>{formatMoney(item.amount)}</Text><Text style={[styles.categoryPercent, { color: palette.mutedForeground }]}>{formatNumber(Math.round(item.percentage))}%</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>)}</View></>}
    {tab === 'income' && <View style={[styles.analysisListCard, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.chartTitle, { color: palette.foreground }]}>{t('incomeSources')}</Text>{incomeSources.length === 0 ? <View style={styles.emptyState}><Ionicons name="trending-up-outline" size={28} color={palette.mutedForeground} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{t('noIncomeData')}</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{t('analysisDataCopy')}</Text></View> : incomeSources.map(([source, amount], index) => <View key={source} style={[styles.analysisListRow, { borderBottomColor: palette.border }]}><View style={[styles.categoryDot, { backgroundColor: index === 0 ? palette.positive : palette.primary }]} /><Text style={[styles.categoryLabel, { color: palette.foreground }]}>{source === 'recorded' ? t('recordedIncome') : t(source)}</Text><Text style={[styles.categoryAmount, { color: palette.foreground }]}>{formatMoney(amount)}</Text><Text style={[styles.categoryPercent, { color: palette.mutedForeground }]}>{summary.income ? formatNumber(Math.round(amount / summary.income * 100)) : 0}%</Text></View>)}</View>}
    {tab === 'savings' && <View style={styles.savingsAnalysisGrid}><View style={[styles.savingsMetric, { backgroundColor: palette.positiveSoft }]}><Text style={[styles.snapshotLabel, { color: palette.mutedForeground }]}>{t('saved')}</Text><Text style={[styles.savingsMetricValue, { color: palette.positive }]}>{formatMoney(summary.retained)}</Text><Text style={[styles.savingsMetricCopy, { color: palette.mutedForeground }]}>{t('afterExpenses')}</Text></View><View style={[styles.savingsMetric, { backgroundColor: palette.secondary }]}><Text style={[styles.snapshotLabel, { color: palette.mutedForeground }]}>{t('explicitSavings')}</Text><Text style={[styles.savingsMetricValue, { color: palette.foreground }]}>{formatMoney(summary.explicitlySaved)}</Text><Text style={[styles.savingsMetricCopy, { color: palette.mutedForeground }]}>{t('assignedToSavings')}</Text></View><View style={[styles.savingsMetric, { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 }]}><Text style={[styles.snapshotLabel, { color: palette.mutedForeground }]}>{t('incomeVsExpenses')}</Text><Text style={[styles.savingsMetricValue, { color: palette.foreground }]}>{formatMoney(summary.income - summary.expenses)}</Text><Text style={[styles.savingsMetricCopy, { color: palette.mutedForeground }]}>{tabLabel}</Text></View></View>}
    {!isPro && <View style={[styles.analysisUpgrade, { backgroundColor: palette.primary }]}><Ionicons name="sparkles-outline" size={20} color={palette.primaryForeground} /><View style={{ flex: 1 }}><Text style={[styles.analysisUpgradeTitle, { color: palette.primaryForeground }]}>{t('deeperInsights')}</Text><Text style={[styles.analysisUpgradeCopy, { color: palette.primaryForeground }]}>{t('deeperInsightsCopy')}</Text></View><Pressable testID="unlock-insights" onPress={onUnlock} style={[styles.analysisUpgradeButton, { backgroundColor: palette.primaryForeground }]}><Text style={[styles.reportButtonText, { color: palette.primary }]}>{t('unlock')}</Text></Pressable></View>}
  </ScrollView>;
}

function SubscriptionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, t } = useVigil();
  const { configured, error: subscriptionError, loading, isPro, monthlyPackage, yearlyPackage, yearlyTrialEligible, purchase, restore, refresh, retry } = useSubscription();
  const [selected, setSelected] = useState<Plan>('yearly');
  const [restoring, setRestoring] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const insets = useSafeAreaInsets();
  
  useEffect(() => {
    if (visible) {
      setSelected('yearly');
      if (configured) void refresh();
    }
  }, [configured, refresh, visible]);

  useEffect(() => {
    if (selected === 'yearly' && !yearlyPackage && monthlyPackage) setSelected('monthly');
    if (selected === 'monthly' && !monthlyPackage && yearlyPackage) setSelected('yearly');
  }, [monthlyPackage, selected, yearlyPackage]);

  const handlePurchase = async () => {
    if (isPro) {
      onClose();
      return;
    }
    if (!configured || purchasing) return;
    const selectedPackage = selected === 'monthly' ? monthlyPackage : yearlyPackage;
    setPurchasing(true);
    try {
      const outcome = await purchase(selected);
      if (outcome === 'cancelled') return;
      if (outcome === 'purchased') {
        Alert.alert(t('proActive'), t('proUnlocked'));
        onClose();
      } else {
        Alert.alert(t('subscriptionNotActive'), t('pleaseTryAgain'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('authCopy');
      Alert.alert(t('proOptions'), message);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true); 
    try { 
      const restored = await restore(); 
      Alert.alert(t('restorePurchases'), restored ? t('proUnlocked') : t('noPurchaseFound')); 
      if (restored) onClose();
    } catch (error) { 
      Alert.alert(t('restorePurchases'), error instanceof Error ? error.message : t('restoreFailed')); 
    } finally { 
      setRestoring(false); 
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.subscriptionSheet, { backgroundColor: palette.background }]}>
          <PaywallContent
            selectedPlan={selected}
            onSelectPlan={setSelected}
            onPurchase={handlePurchase}
            onRestore={handleRestore}
            onClose={onClose}
            onRetry={retry}
            yearlyPackage={yearlyPackage}
            monthlyPackage={monthlyPackage}
            yearlyTrialEligible={yearlyTrialEligible}
            loading={loading}
            purchasing={purchasing}
            restoring={restoring}
            configured={configured}
            isPro={isPro}
          />
        </View>
      </View>
    </Modal>
  );
}

function SettingsScreen({ onSubscribe, onRequestReview }: { onSubscribe: () => void; onRequestReview: () => Promise<boolean> }) {
  const { palette, t, language, setLanguage, themeMode, setThemeMode, morningReminder, eveningReminder, setMorningReminder, setEveningReminder, countryCode, currency, setCountry: updateCountry, setCurrency: updateCurrency, ratesUpdatedAt, startOver, profileFirstName } = useVigil();
  const { displayName, firstName, lastName, email, isSignedIn, isAdmin, signOut, deleteAccount: deleteIdentityAccount } = useIdentity();
  const { isPro, restore } = useSubscription();
  const copy = settingsCopy(language);
  const [restoring, setRestoring] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [doubleTapVisible, setDoubleTapVisible] = useState(false);
  const diagnosticsTapCount = useRef(0);
  const version = appVersionBuild();
  const languages: { id: Language; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'fr', label: 'Français' }, { id: 'cs', label: 'Čeština' }, { id: 'de', label: 'Deutsch' }, { id: 'es', label: 'Español' }, { id: 'ru', label: 'Русский' }, { id: 'ar', label: 'العربية' }];
  const themes: { id: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [{ id: 'light', label: t('themeLight'), icon: 'sunny-outline' }, { id: 'dark', label: t('themeDark'), icon: 'moon-outline' }, { id: 'auto', label: t('themeAuto'), icon: 'contrast-outline' }];
  const fullName = displayName || profileFirstName || email || 'Vigil Spend member';
  const selectedCountry = countries.find((country) => country.code === countryCode) ?? countries[0];
  const setCountry = (nextCountry: CountryCode) => { runProAction(isPro, onSubscribe, () => updateCountry(nextCountry)); };
  const setCurrency = (nextCurrency: string) => { runProAction(isPro, onSubscribe, () => updateCurrency(nextCurrency)); };
  const resetEverything = () => {
    if (!resetting) setResetVisible(true);
  };
  const confirmResetEverything = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await startOver();
      setResetVisible(false);
      router.replace('/onboarding');
    } catch (error) {
      setResetVisible(false);
      Alert.alert(t('deleteAllData'), error instanceof Error ? error.message : t('authCopy'));
    } finally {
      setResetting(false);
    }
  };
  const signOutNow = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await Promise.race([
        signOut(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Sign out timed out')), 10000)),
      ]);
      router.replace('/sign-in');
    } catch (error) {
      setSigningOut(false);
      Alert.alert(t('signOut'), error instanceof Error && /timed out/i.test(error.message) ? copy.signingOut : t('authCopy'));
    }
  };
  const openAppleSubscriptions = () => {
    void Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {
      Alert.alert(t('manageSubscription'), t('pleaseTryAgain'));
    });
  };
  const requestReview = async () => {
    const available = await onRequestReview();
    if (!available) Alert.alert(t('rateVigil'), t('reviewUnavailable'));
  };
  const deleteWarningCopy = language === 'en'
    ? t('deleteAccountWarningCopy')
    : `${t('deleteAccountWarningCopy')}\n\n${subscriptionDeletionNotice[language]}`;
  const deleteAccount = () => Alert.alert(t('deleteAccountWarningTitle'), deleteWarningCopy, [{ text: t('manageSubscription'), onPress: openAppleSubscriptions }, { text: t('cancel'), style: 'cancel' }, { text: t('deleteAccountConfirm'), style: 'destructive', onPress: async () => {
    try {
      await deleteIdentityAccount();
      await startOver();
      router.replace('/sign-in');
    } catch (error) {
      Alert.alert(t('deleteAccount'), error instanceof Error ? error.message : t('authCopy'));
    }
  } }]);
  const tapVersion = () => {
    diagnosticsTapCount.current += 1;
    if (diagnosticsTapCount.current >= 5) {
      diagnosticsTapCount.current = 0;
      router.push('/diagnostics');
    }
  };
  return <>
   <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <Header screen="settings" />
     <View style={[styles.profileCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Avatar />
       <View style={{ flex: 1 }}><Text style={[styles.profileName, { color: palette.foreground }]}>{[firstName, lastName].filter(Boolean).join(' ') || displayName || profileFirstName || 'Vigil Spend member'}</Text><Text style={[styles.profileMeta, { color: palette.mutedForeground }]}>{email || '—'}</Text><Text style={[styles.profileMeta, { color: palette.mutedForeground }]}>{isPro ? t('pro') : t('free')} · {currency} • {selectedCountry.name}</Text></View>
      <Ionicons name={isPro ? 'shield-checkmark' : 'person-outline'} size={20} color={palette.primary} />
    </View>
     <Pressable testID="help-support-link" onPress={() => router.push('/support')} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.primary, backgroundColor: palette.card }])}><Ionicons name="help-circle-outline" size={19} color={palette.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{supportText(language, 'helpSupport')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{supportText(language, 'helpSupportCopy')}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.primary} /></Pressable>
      {Platform.OS === 'ios' && <Pressable testID="rate-vigil" onPress={() => void requestReview()} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.card }])}><Ionicons name="star-outline" size={19} color={palette.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('rateVigil')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{t('rateVigilCopy')}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>}
      <SectionTitle title={copy.yourPlan} />
    <View style={[styles.planCompare, { backgroundColor: palette.card, borderColor: palette.border }]}>
       <View style={styles.planCompareHead}><View><Text style={[styles.settingTitle, { color: palette.foreground }]}>{isPro ? 'Vigil Spend Pro' : 'Vigil Spend Free'}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{isPro ? copy.proUnlocked : copy.freeClarity}</Text></View><View style={[styles.planPill, { backgroundColor: isPro ? palette.positiveSoft : palette.secondary }]}><Text style={[styles.planPillText, { color: isPro ? palette.positive : palette.foreground }]}>{isPro ? 'PRO' : 'FREE'}</Text></View></View>
        <View style={styles.featureColumns}><View style={{ flex: 1 }}><Text style={[styles.featureHeading, { color: palette.foreground }]}>FREE</Text>{copy.freeFeatures.map((item) => <Text key={item} style={[styles.featureLine, { color: palette.mutedForeground }]}>• {item}</Text>)}</View><View style={{ flex: 1 }}><Text style={[styles.featureHeading, { color: palette.primary }]}>VIGIL PRO</Text>{copy.proFeatures.map((item) => <Text key={item} style={[styles.featureLine, { color: palette.mutedForeground }]}>• {item}</Text>)}</View></View>
       {!isPro && <Pressable testID="settings-subscribe" onPress={onSubscribe} style={[styles.compactPrimary, { backgroundColor: palette.primary }]}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('viewPlans')}</Text></Pressable>}
        <Pressable disabled={restoring} onPress={async () => { setRestoring(true); try { const restored = await restore(); Alert.alert(copy.restoreTitle, restored ? copy.restoreSuccess : copy.restoreNone); } catch (error) { Alert.alert(copy.restoreTitle, error instanceof Error ? error.message : copy.restoreError); } finally { setRestoring(false); } }} style={{ alignItems: 'center', paddingTop: 12 }}><Text style={[styles.settingsLinkText, { color: palette.primary }]}>{restoring ? t('restoring') : copy.restoreTitle}</Text></Pressable>
    </View>
      {isAdmin && <Text style={[styles.helperText, { color: palette.mutedForeground }]}>{copy.adminMode}</Text>}
    <SectionTitle title={isPro ? t('country') : `${t('country')} · Pro`} />
    <CountryPicker value={countryCode} onChange={setCountry} disabled={!isPro} onBlocked={onSubscribe} />
     <Text style={[styles.helperText, { color: palette.mutedForeground }]}>{selectedCountry.taxPercent > 0 ? copy.taxEstimate(selectedCountry.taxPercent) : copy.noTaxBucket}</Text>
     <View style={{ marginTop: 12 }}><CurrencyPicker value={currency} onChange={setCurrency} disabled={!isPro} onBlocked={onSubscribe} /></View>
    
    <SectionTitle title={t('appearance')} />
    <View style={[styles.segmented, { backgroundColor: palette.secondary }]}>{themes.map((theme) => <Pressable key={theme.id} onPress={() => setThemeMode(theme.id)} style={({ pressed }) => pressStyle(pressed, [styles.segment, themeMode === theme.id && { backgroundColor: palette.card }])}><Ionicons name={theme.icon} size={16} color={themeMode === theme.id ? palette.primary : palette.mutedForeground} /><Text style={[styles.segmentText, { color: themeMode === theme.id ? palette.foreground : palette.mutedForeground }]}>{theme.label}</Text></Pressable>)}</View>
    <SectionTitle title={t('language')} /><View style={styles.languageGrid}>{languages.map((item) => <Pressable key={item.id} onPress={() => setLanguage(item.id)} style={({ pressed }) => pressStyle(pressed, [styles.languageChip, { borderColor: language === item.id ? palette.primary : palette.border, backgroundColor: language === item.id ? palette.accent : palette.card }])}><Text style={[styles.languageText, { color: language === item.id ? palette.primary : palette.foreground }]}>{item.label}</Text></Pressable>)}</View>
    <SectionTitle title={t('morning')} />
     <View style={[styles.settingRow, { borderColor: palette.border, backgroundColor: palette.card }]}><View style={[styles.settingIcon, { backgroundColor: palette.positiveSoft }]}><Ionicons name="sunny-outline" size={18} color={palette.positive} /></View><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('morning')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{copy.morningReminderCopy}</Text></View><Switch testID="morning-reminder" value={morningReminder} onValueChange={setMorningReminder} trackColor={{ false: palette.track, true: palette.positive }} thumbColor={palette.card} /></View>
     <View style={[styles.settingRow, { borderColor: palette.border, backgroundColor: palette.card }]}><View style={[styles.settingIcon, { backgroundColor: palette.warningSoft }]}><Ionicons name="moon-outline" size={18} color={palette.warning} /></View><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('evening')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{copy.eveningReminderCopy}</Text></View><Switch testID="evening-reminder" value={eveningReminder} onValueChange={setEveningReminder} trackColor={{ false: palette.track, true: palette.warning }} thumbColor={palette.card} /></View>
    <Text style={[styles.helperText, { color: palette.mutedForeground }]}>{t('reminderCopy')}</Text>
     {Platform.OS === 'ios' && <Pressable testID="double-tap-logging" onPress={() => setDoubleTapVisible(true)} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.primary, backgroundColor: palette.card }])}><Ionicons name="finger-print-outline" size={19} color={palette.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('doubleTapTitle')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{t('doubleTapSummary')}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.primary} /></Pressable>}
     {!isSignedIn && <Pressable testID="sign-in-link" onPress={() => Linking.openURL('vigil-spend://sign-in')} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.card }])}><Ionicons name="person-circle-outline" size={19} color={palette.primary} /><Text style={[styles.settingsLinkText, { color: palette.foreground }]}>{t('signIn')}{copy.signInMethods}</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>}
     {isSignedIn && <Pressable testID="sign-out-button" disabled={signingOut} onPress={() => void signOutNow()} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.card, opacity: signingOut ? 0.6 : 1 }])}><Ionicons name="log-out-outline" size={19} color={palette.mutedForeground} /><Text style={[styles.settingsLinkText, { color: palette.mutedForeground }]}>{signingOut ? copy.signingOut : t('signOut')}</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>}
     {isAdmin && <Pressable onPress={() => router.push('/admin')} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.primary, backgroundColor: palette.card }])}><Ionicons name="shield-checkmark-outline" size={19} color={palette.primary} /><Text style={[styles.settingsLinkText, { color: palette.foreground }]}>{copy.adminLabel}</Text><Ionicons name="chevron-forward" size={16} color={palette.primary} /></Pressable>}
    <SectionTitle title={t('account')} />
    <Pressable testID="delete-all-data" onPress={resetEverything} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.card }])}><Ionicons name="refresh-outline" size={19} color={palette.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('deleteAllData')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{t('deleteAllDataCopy')}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>
    <Pressable testID="delete-account" onPress={deleteAccount} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.destructive, backgroundColor: palette.card }])}><Ionicons name="person-remove-outline" size={19} color={palette.destructive} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.destructive }]}>{t('deleteAccount')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{t('deleteAccountCopy')}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.destructive} /></Pressable>
      <Pressable testID="diagnostics-version-tap" onPress={tapVersion} style={({ pressed }) => pressStyle(pressed, [styles.appVersionCard, { borderColor: palette.border, backgroundColor: palette.card }])}>
        <View style={styles.appVersionRow}><View style={[styles.appVersionIcon, { backgroundColor: palette.secondary }]}><Ionicons name="build-outline" size={18} color={palette.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>Vigil Spend</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>Version {version.version} · Build {version.build}</Text></View></View>
      </Pressable>
        <View style={styles.legalRow}><Pressable testID="privacy-link" onPress={() => router.push('/legal?document=privacy')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('privacyPolicy')}</Text></Pressable><Pressable testID="terms-link" onPress={() => router.push('/legal?document=terms')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('termsConditions')}</Text></Pressable><Pressable testID="terms-use-link" onPress={() => router.push('/legal?document=use')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('termsOfUse')}</Text></Pressable></View>
   </ScrollView>
    <DoubleTapLoggingModal visible={doubleTapVisible} onClose={() => setDoubleTapVisible(false)} />
   <DestructiveConfirmationModal
     visible={resetVisible}
     title={t('clearHistoryWarningTitle')}
     message={t('clearHistoryWarningCopy')}
     cancelLabel={t('cancel')}
     confirmLabel={t('clearHistoryConfirm')}
     confirming={resetting}
     onCancel={() => setResetVisible(false)}
     onConfirm={() => void confirmResetEverything()}
   />
  </>;
}

export default function VigilApp({ screen }: { screen: Screen }) {
  const insets = useSafeAreaInsets();
  const { palette, language, hydrated, onboardingComplete } = useVigil();
  const { userId } = useIdentity();
  const { requestManualReview, recordSuccessfulLog } = useReviewRequest(userId, onboardingComplete);
  const params = useLocalSearchParams<{ capture?: string; amount?: string; note?: string; bucket?: string }>();
  const [logVisible, setLogVisible] = useState(false);
  const [receiptRequest, setReceiptRequest] = useState(0);
  const [shortcutRequest, setShortcutRequest] = useState<ShortcutCaptureRequest | null>(null);
  const shortcutRequestId = useRef(0);
  const [incomeVisible, setIncomeVisible] = useState(false);
  const [advisorVisible, setAdvisorVisible] = useState(false);
  const [subscriptionVisible, setSubscriptionVisible] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  useEffect(() => {
    if (!hydrated || !onboardingComplete) return;
    const openCapture = (request: Omit<ShortcutCaptureRequest, 'id'>) => {
      shortcutRequestId.current += 1;
      setShortcutRequest({ ...request, id: shortcutRequestId.current });
      setLogVisible(true);
    };
    const openCaptureFromUrl = (url: string | null) => {
      if (!url || !/capture/i.test(url)) return;
      const parsed = ExpoLinking.parse(url);
      const query = parsed.queryParams ?? {};
      const stringParam = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
      openCapture({
        amount: stringParam(query.amount),
        note: stringParam(query.note),
        bucketId: stringParam(query.bucket),
      });
    };
    if (params.capture === '1') {
      openCapture({
        amount: params.amount,
        note: params.note,
        bucketId: params.bucket,
      });
    }
    if (params.capture !== '1') {
      void Linking.getInitialURL().then(openCaptureFromUrl);
    }
    const subscription = Linking.addEventListener('url', ({ url }) => openCaptureFromUrl(url));
    return () => subscription.remove();
  }, [hydrated, onboardingComplete, params.amount, params.bucket, params.capture, params.note]);
  useEffect(() => {
    if (!hydrated || !onboardingComplete) return;
    const key = tutorialStorageKey(userId);
    void AsyncStorage.getItem(key).then((seen) => {
      if (shouldShowTutorial(seen)) setTutorialVisible(true);
    });
  }, [hydrated, onboardingComplete, userId]);
  const finishTutorial = () => {
    setTutorialVisible(false);
    void AsyncStorage.setItem(tutorialStorageKey(userId), '1');
  };
  const unlockPro = () => {
    setSubscriptionVisible(true);
  };
  const openReceiptCapture = () => {
    setReceiptRequest((value) => value + 1);
    setLogVisible(true);
  };
  const content = screen === 'spending' ? <DashboardScreen onLog={() => setLogVisible(true)} onReceipt={openReceiptCapture} onAsk={() => setAdvisorVisible(true)} onUnlock={unlockPro} /> : screen === 'plan' ? <PlanScreen onIncome={() => setIncomeVisible(true)} onUnlock={unlockPro} /> : screen === 'history' ? <HistoryScreen onUnlock={unlockPro} /> : screen === 'analysis' ? <AnalysisScreen onUnlock={unlockPro} /> : <SettingsScreen onSubscribe={unlockPro} onRequestReview={requestManualReview} />;
  const safeTop = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top + 8;
  return <View style={[styles.app, { backgroundColor: palette.background, paddingTop: safeTop, direction: language === 'ar' ? 'rtl' : 'ltr' }]}>{content}<LogModal visible={logVisible} receiptRequest={receiptRequest} shortcutRequest={shortcutRequest} onClose={() => setLogVisible(false)} onUnlock={unlockPro} onSuccessfulLog={(count) => { void recordSuccessfulLog(count); }} /><IncomeModal visible={incomeVisible} onClose={() => setIncomeVisible(false)} /><AdvisorModal visible={advisorVisible} onClose={() => setAdvisorVisible(false)} /><SubscriptionModal visible={subscriptionVisible} onClose={() => setSubscriptionVisible(false)} /><TutorialModal visible={tutorialVisible} onFinish={finishTutorial} /></View>;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  dashboardFrame: { flex: 1 },
  dashboardScroll: { paddingBottom: 150 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { paddingTop: 10, paddingBottom: 8 },
  headerTopRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMarkFrame: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brandMark: { width: 36, height: 36 },
  brandName: { fontSize: 17, fontWeight: '700', letterSpacing: 0.7 },
  brandTag: { fontSize: 10, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 7 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  spendingGoalsToggle: { flexDirection: 'row', borderRadius: 16, padding: 4, marginTop: 14, marginBottom: 4 },
  spendingGoalsOption: { flex: 1, minHeight: 39, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  spendingGoalsOptionText: { fontSize: 12, fontWeight: '700' },
  screenTitle: { fontSize: 27, lineHeight: 34, fontWeight: '700', marginTop: 7 },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  greeting: { fontSize: 25, fontWeight: '700' },
  dateLine: { fontSize: 15, marginTop: 4 },
  greetingButtons: { flexDirection: 'row', gap: 9 },
  askButton: { minHeight: 40, borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  askButtonText: { fontSize: 11, fontWeight: '700' },
  roundAction: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginTop: 18 },
  nudgeText: { flex: 1, fontSize: 12 },
  periodRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  periodPill: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 13, borderWidth: 1 },
  periodText: { fontSize: 12, fontWeight: '600' },
  savingsCard: { marginTop: 18, borderRadius: 20, borderWidth: 1, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 12, letterSpacing: 0.4, fontWeight: '600' },
  savingsValue: { fontSize: 26, fontWeight: '700', marginTop: 7 },
  cardHint: { fontSize: 13, marginTop: 7 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 16 },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  statValue: { fontSize: 17, fontWeight: '700', marginTop: 10 },
  bucketsCard: { marginTop: 14, borderWidth: 1, borderRadius: 20, padding: 16 },
  bucketCardEyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  remainingValue: { fontSize: 24, fontWeight: '700', marginTop: 5 },
  remainingHint: { fontSize: 11, marginTop: 2, marginBottom: 12 },
  bucketRow: { flexDirection: 'row', gap: 10, paddingVertical: 9 },
  bucketIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bucketMain: { flex: 1 },
  bucketHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bucketLabel: { fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  bucketAmount: { fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },
  track: { height: 9, borderRadius: 6, overflow: 'hidden', marginTop: 7 },
  trackFill: { height: '100%', borderRadius: 6 },
  bucketMeta: { fontSize: 11, lineHeight: 15, fontWeight: '500', marginTop: 5, letterSpacing: 0.05 },
  outlineButton: { borderWidth: 1, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  outlineButtonText: { fontSize: 13, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 72, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 22, paddingHorizontal: 21, paddingVertical: 13, shadowColor: '#000', shadowOpacity: 0.17, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4, zIndex: 10 },
  fabText: { fontSize: 14, fontWeight: '700' },
  clearText: { textAlign: 'center', fontSize: 12, marginTop: 21 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 11 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionAction: { fontSize: 13, fontWeight: '600' },
  planIntro: { padding: 17, borderRadius: 19, flexDirection: 'row', gap: 12, marginTop: 15 },
  planIntroTitle: { fontSize: 17, fontWeight: '700' },
  planIntroCopy: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  planIncomeButton: { minHeight: 66, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 14 },
  planIncomeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  planIncomeTitle: { fontSize: 15, fontWeight: '700' },
  planIncomeCopy: { fontSize: 12, lineHeight: 16, opacity: 0.88, marginTop: 2 },
  planSummary: { borderWidth: 1, borderRadius: 19, padding: 17, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTotal: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  planSummaryCopy: { fontSize: 12, lineHeight: 19, textAlign: 'right' },
  planRow: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 10 },
  planSpent: { fontSize: 12, marginTop: 3 },
  planPercent: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  percentValue: { fontSize: 17, fontWeight: '700' },
  historyBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, marginTop: 15 },
  historyBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  historyCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderBottomWidth: 1 },
  transactionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  transactionNote: { fontSize: 13, fontWeight: '600' },
  transactionMeta: { fontSize: 11, marginTop: 4 },
  transactionAmount: { fontSize: 12, fontWeight: '600' },
  deleteButton: { padding: 5 },
  emptyState: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptyCopy: { textAlign: 'center', fontSize: 13, marginTop: 4 },
  reportHero: { borderRadius: 22, padding: 19, marginTop: 15 },
  reportIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  reportHeroTitle: { fontSize: 23, fontWeight: '700', marginTop: 17 },
  reportHeroCopy: { fontSize: 13, lineHeight: 19, opacity: 0.9, marginTop: 5 },
  reportButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, marginTop: 16 },
  reportButtonText: { fontSize: 12, fontWeight: '700' },
  insightGrid: { flexDirection: 'row', gap: 11 },
  insightCard: { flex: 1, borderRadius: 17, padding: 15 },
  insightNumber: { fontSize: 25, fontWeight: '700', marginTop: 10 },
  insightLabel: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  adviceCard: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, marginTop: 13 },
  adviceTitle: { fontSize: 15, fontWeight: '700' },
  adviceCopy: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  topSpendCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 13 },
  topSpendAmount: { fontSize: 25, fontWeight: '700', marginTop: 6 },
  topSpendNote: { fontSize: 12, marginTop: 4 },
  profileCard: { borderWidth: 1, borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 15 },
  appVersionCard: { borderWidth: 1, borderRadius: 17, padding: 13, gap: 10, marginTop: 12 },
  appVersionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appVersionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copyDiagnosticsButton: { minHeight: 42, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  copyDiagnosticsText: { fontSize: 13, fontWeight: '600' },
  avatar: { width: 47, height: 47, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  profileName: { fontSize: 16, fontWeight: '700' },
  profileMeta: { fontSize: 12, marginTop: 4 },
  planCompare: { borderWidth: 1, borderRadius: 20, padding: 16 },
  planCompareHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  planPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  featureColumns: { flexDirection: 'row', gap: 14, marginTop: 16 },
  featureHeading: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 6 },
  featureLine: { fontSize: 10, lineHeight: 17 },
  compactPrimary: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  horizontalChips: { gap: 8, paddingRight: 12 },
  currencyChip: { minWidth: 62, paddingHorizontal: 15, paddingVertical: 10, borderWidth: 1, borderRadius: 20, alignItems: 'center' },
  segmented: { padding: 4, borderRadius: 16, flexDirection: 'row', gap: 3 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12 },
  segmentText: { fontSize: 12, fontWeight: '600' },
  languageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languageChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  languageText: { fontSize: 12, fontWeight: '600' },
  settingRow: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  settingIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 13, fontWeight: '600' },
  settingCopy: { fontSize: 11, marginTop: 3 },
  helperText: { fontSize: 12, lineHeight: 18, marginTop: 9, marginLeft: 2 },
  settingsLink: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  settingsLinkText: { flex: 1, fontSize: 13, fontWeight: '600' },
  quietSubscriptionLink: { alignItems: 'center', marginTop: 28, paddingVertical: 7 },
  quietSubscriptionText: { fontSize: 11, fontWeight: '500' },
  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 26 },
  legalText: { fontSize: 11 },
  shortcutHelpSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '93%', paddingHorizontal: 20, paddingTop: 18 },
  shortcutHelpIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  shortcutSteps: { gap: 14, marginTop: 6 },
  shortcutStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  shortcutStepNumber: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  shortcutStepNumberText: { fontSize: 13, fontWeight: '800' },
  shortcutStepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  shortcutNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 15, padding: 13, marginTop: 18 },
  shortcutNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
   tutorialBackdrop: { paddingHorizontal: 16 },
   tutorialCard: { width: '100%', maxHeight: '88%', borderRadius: 24, padding: 22 },
  tutorialIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tutorialStep: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 24 },
  tutorialTitle: { fontSize: 25, fontWeight: '700', lineHeight: 31, marginTop: 8 },
  tutorialCopy: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  tutorialDots: { flexDirection: 'row', gap: 6, marginTop: 22 },
  tutorialDot: { width: 24, height: 4, borderRadius: 2 },
  tutorialSkip: { alignItems: 'center', paddingTop: 15 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  confirmationBackdrop: { justifyContent: 'center', padding: 20 },
  confirmationCard: { width: '100%', maxWidth: 430, borderRadius: 22, padding: 22, alignSelf: 'center' },
  confirmationIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  confirmationTitle: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  confirmationMessage: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  confirmationActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  confirmationButton: { flex: 1, minHeight: 49, marginTop: 0, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  duplicateModalCard: { width: '100%', maxWidth: 430, borderRadius: 22, padding: 22, alignSelf: 'center' },
  duplicateComparison: { borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 18, gap: 9 },
  duplicateComparisonRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  duplicateComparisonLabel: { fontSize: 11, fontWeight: '600' },
  duplicateComparisonValue: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  duplicateDivider: { height: 1, marginVertical: 4 },
  duplicateOverlapText: { fontSize: 12, fontWeight: '700', marginTop: 5 },
  duplicateActions: { gap: 9, marginTop: 20 },
  subscriptionSheet: {
    width: '100%',
    height: '94%',
    maxHeight: '94%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '93%', paddingHorizontal: 20, paddingTop: 9 },
  incomeKeyboard: { flex: 1 },
  incomeKeyboardContent: { flexGrow: 1, justifyContent: 'flex-end' },
  incomeSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 9, paddingBottom: 30 },
  modalGrabber: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#c4c7cb', alignSelf: 'center', marginBottom: 13 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: '700' },
  modalSubtitle: { fontSize: 13, marginTop: 4, maxWidth: 290 },
  closeButton: { width: 33, height: 33, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#c4c7cb' },
  modalScroll: { paddingBottom: 25 },
  captureSectionLabel: { fontSize: 14, fontWeight: '700', marginTop: 4, marginBottom: 10 },
  captureHero: { minHeight: 154, borderWidth: 1, borderRadius: 20, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  captureHeroIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  captureHeroCopy: { alignItems: 'center', minWidth: 0 },
  captureHeroTitle: { fontSize: 14, fontWeight: '800' },
  captureHeroHint: { fontSize: 11, lineHeight: 16, marginTop: 3, textAlign: 'center' },
  captureHeroButton: { minHeight: 40, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  captureHeroButtonText: { fontSize: 11, fontWeight: '800' },
  captureMethodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  captureMethod: { width: '48%', minHeight: 64, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 9 },
  captureMethodText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  captureHeroMic: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  transcriptCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 8 },
  voiceMeter: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 8, marginBottom: 8 },
  voiceMeterFill: { height: '100%', borderRadius: 3, minWidth: 3 },
  transcriptText: { fontSize: 14, lineHeight: 20 },
  reviewList: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 12 },
  reviewTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  reviewHint: { fontSize: 11, lineHeight: 16, marginBottom: 3 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e6e7e9' },
  duplicateBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  duplicateBadgeText: { fontSize: 10, fontWeight: '700' },
  reviewNote: { fontSize: 12, fontWeight: '600' },
  reviewMeta: { fontSize: 10, marginTop: 3 },
  reviewEditInput: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13 },
  reviewAmount: { fontSize: 12, fontWeight: '700' },
  inputLabel: { fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  amountRow: { flexDirection: 'row', gap: 8 },
  conversionNote: { fontSize: 11, lineHeight: 16, marginTop: 7 },
  currencyBox: { width: 112, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currencyText: { fontSize: 14, fontWeight: '600' },
  amountInput: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 15, minHeight: 52, paddingHorizontal: 14, fontSize: 19 },
  sourceButton: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  sourceText: { fontSize: 13, fontWeight: '600' },
  capturePreview: { borderWidth: 1, borderRadius: 13, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 },
  captureImage: { width: 34, height: 34, borderRadius: 8 },
  captureText: { flex: 1, fontSize: 12, fontWeight: '600' },
  fullInput: { height: 53, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  fullInputText: { fontSize: 15 },
  bucketGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bucketChoice: { width: '31.5%', minHeight: 54, borderWidth: 1, borderRadius: 14, padding: 7, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bucketChoiceText: { fontSize: 10, textAlign: 'center', fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 15, minHeight: 52, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  primaryButton: { borderRadius: 15, minHeight: 51, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10 },
  typeChipText: { fontSize: 12, fontWeight: '600' },
  editorKeyboardContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  editorCard: { marginHorizontal: 24, borderRadius: 22, padding: 20 },
  editorInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 19 },
  editorTextInput: { minHeight: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 16, marginTop: 18 },
  editorInput: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 22 },
  percentSuffix: { fontSize: 20 },
  editorActions: { flexDirection: 'row', gap: 10, marginTop: 17 },
  secondaryButton: { flex: 1, minHeight: 49, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, fontWeight: '600' },
  editorSave: { flex: 1, marginTop: 0 },
  deleteBucketAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 17 },
  deleteBucketText: { fontSize: 13, fontWeight: '700' },
  bucketManagerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 1 },
  addBucketButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  addBucketText: { fontSize: 12, fontWeight: '700' },
  goalCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 11 },
  goalCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  goalName: { fontSize: 15, fontWeight: '700' },
  goalMeta: { fontSize: 11, marginTop: 4 },
  goalPercent: { fontSize: 14, fontWeight: '700' },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 14 },
  goalFill: { height: '100%', borderRadius: 4 },
  goalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  goalRemaining: { fontSize: 11 },
  goalActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3 },
  goalActionText: { fontSize: 11, fontWeight: '700' },
  emptyGoalCard: { borderWidth: 1, borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 12 },
  goalsHero: { borderRadius: 24, padding: 20, marginTop: 14, overflow: 'hidden' },
  goalsHeroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  goalsHeroEyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  goalsHeroTitle: { color: '#ffffff', fontSize: 27, lineHeight: 31, fontWeight: '700', letterSpacing: -0.6, marginTop: 8, maxWidth: 245 },
  goalsHeroCopy: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 19, marginTop: 11, maxWidth: 295 },
  goalsHeroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  goalFilters: { flexDirection: 'row', borderRadius: 15, padding: 4, marginTop: 13 },
  goalFilter: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  goalFilterText: { fontSize: 12, fontWeight: '700' },
  goalsSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20, marginBottom: 2 },
  goalsSectionCopy: { fontSize: 11, lineHeight: 16, marginTop: 3, maxWidth: 210 },
  addGoalButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  emptyGoalIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goalContributionHint: { fontSize: 12, lineHeight: 18, marginTop: 14 },
  historySearch: { minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 14, marginTop: 10 },
  filterRow: { gap: 8, paddingVertical: 12 },
  filterChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  monthNavigator: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  monthNavigatorText: { fontSize: 13, fontWeight: '700' },
  historySummary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2, marginBottom: 10 },
  historyTotal: { fontSize: 18, fontWeight: '700' },
  historyGroupTitle: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 7, textTransform: 'capitalize' },
  analysisScrollContent: { paddingBottom: 136 },
  analysisHero: { borderRadius: 24, padding: 20, marginTop: 10, overflow: 'hidden' },
  analysisHeroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  analysisHeroEyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  analysisHeroTitle: { color: '#ffffff', fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.7, marginTop: 8, maxWidth: 240 },
  analysisHeroCopy: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 19, marginTop: 10, maxWidth: 285 },
  analysisHeroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  analysisHeroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingTop: 12, marginTop: 18 },
  analysisHeroMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600' },
  analysisMonthCard: { minHeight: 66, borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13 },
  analysisPeriodEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  analysisMonthActions: { flexDirection: 'row', gap: 6 },
  monthButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  analysisMonth: { fontSize: 17, fontWeight: '700', textTransform: 'capitalize', marginTop: 3 },
  analysisTabs: { flexDirection: 'row', borderRadius: 15, padding: 4, marginTop: 13, marginBottom: 13 },
  analysisTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  analysisTabText: { fontSize: 12, fontWeight: '700' },
  snapshotCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 13 },
  snapshotGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginTop: 15 },
  snapshotLabel: { fontSize: 11, fontWeight: '600' },
  snapshotValue: { fontSize: 17, fontWeight: '700', marginTop: 5, marginRight: 26 },
  analysisChartCard: { borderWidth: 1, borderRadius: 22, padding: 17, alignItems: 'center', gap: 3 },
  donutWrap: { width: 224, height: 224, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 136 },
  donutLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, fontWeight: '600' },
  donutValue: { fontFamily: 'Inter_700Bold', fontSize: 17, fontWeight: '700', marginTop: 5, letterSpacing: -0.35 },
  donutMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 9, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  chartHeadline: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 3 },
  chartTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, fontWeight: '700' },
  chartAmount: { fontFamily: 'Inter_700Bold', fontSize: 22, fontWeight: '700', marginTop: 5, letterSpacing: -0.25 },
  chartMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4, textAlign: 'center' },
  analysisBreakdown: { gap: 8, marginTop: 15 },
  analysisBreakdownHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 2 },
  analysisBreakdownTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, fontWeight: '700' },
  analysisBreakdownMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 11, fontWeight: '600' },
  analysisCategoryRow: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  categoryDot: { width: 9, height: 9, borderRadius: 5 },
  categoryLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  categoryAmount: { fontSize: 13, fontWeight: '700' },
  categoryPercent: { width: 35, textAlign: 'right', fontSize: 11 },
  analysisListCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  analysisListRow: { minHeight: 52, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  savingsAnalysisGrid: { gap: 11 },
  savingsMetric: { minHeight: 117, borderRadius: 18, padding: 16 },
  savingsMetricValue: { fontSize: 24, fontWeight: '700', marginTop: 10 },
  savingsMetricCopy: { fontSize: 11, marginTop: 4 },
  analysisUpgrade: { borderRadius: 18, padding: 15, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  analysisUpgradeTitle: { fontSize: 14, fontWeight: '700' },
  analysisUpgradeCopy: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  analysisUpgradeButton: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9 },
  transactionDetailAmount: { borderRadius: 16, padding: 15, marginTop: 5 },
  transactionDetailValue: { fontSize: 24, fontWeight: '700', marginTop: 6 },
  transactionDetailMeta: { fontSize: 11, marginTop: 5 },
  transactionDetailBucket: { fontSize: 11, marginTop: 10, marginBottom: 15 },
  profileSheet: { borderRadius: 24, marginHorizontal: 20, padding: 18 },
  profileSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  advisorSheet: { flex: 1, maxHeight: '82%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 9, paddingBottom: 13 },
  advisorBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  advisorMessages: { marginTop: 11 },
  advisorMessagesContent: { paddingBottom: 10, flexGrow: 1, justifyContent: 'flex-end' },
  advisorWelcome: { borderRadius: 17, padding: 15, marginTop: 12 },
  advisorWelcomeTitle: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  advisorWelcomeCopy: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  advisorQuestion: { borderRadius: 17, padding: 13, marginTop: 12, alignSelf: 'flex-end', maxWidth: '88%' },
  advisorQuestionText: { fontSize: 14, lineHeight: 20 },
  advisorReply: { borderRadius: 17, padding: 15, flexDirection: 'row', gap: 9, marginTop: 12 },
  advisorReplyText: { flex: 1, fontSize: 14, lineHeight: 21 },
  advisorInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  advisorInput: { flex: 1, minHeight: 49, maxHeight: 110, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  advisorSend: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  advisorDisclaimer: { fontSize: 10, textAlign: 'center', marginTop: 8 },
  subscriptionClose: { alignSelf: 'flex-end', padding: 5 },
  subscriptionBadge: { width: 49, height: 49, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  subscriptionTitle: { fontSize: 27, fontWeight: '700', marginTop: 17 },
  subscriptionCopy: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  subscriptionBenefits: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 9, marginTop: 14 },
  subscriptionBenefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  subscriptionBenefitText: { flex: 1, fontSize: 12, lineHeight: 17 },
  subscriptionOptions: { gap: 10, marginTop: 20 },
  subscriptionOption: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center' },
  subscriptionLabel: { fontSize: 16, fontWeight: '700' },
  subscriptionTrial: { fontSize: 12, marginTop: 4 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  subscriptionFootnote: { textAlign: 'center', fontSize: 11, marginTop: 12 },
});