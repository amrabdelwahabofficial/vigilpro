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
import { useVigil, Bucket, BucketId, countries, CountryCode, CurrencyCode, Language, ThemeMode, Transaction } from '@/context/AppContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { CountryPicker } from '@/components/CountryPicker';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { runProAction, shouldShowTutorial, tutorialStorageKey } from '@/lib/flowGuards';
import { PaywallContent, Plan } from '@/components/Paywall';
import { useIdentity } from '@/context/IdentityContext';
import { convertCurrencyAmount, normalizeCurrencyCode } from '@/lib/currency';

type Screen = 'spending' | 'plan' | 'history' | 'analysis' | 'settings';

function pressStyle(pressed: boolean, extra?: object) {
  return [extra, pressed && { opacity: 0.72, transform: [{ scale: 0.985 }] }];
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
    steady: 'Future-you is already on the right side of the deadline.',
    tight: 'A little more breathing room here keeps surprises boring.',
    over: 'The tax bucket is running hot. Keep the receipt, not the panic.',
  },
  needs: {
    steady: 'The essentials are covered. Let the extras wait their turn.',
    tight: 'Necessities are taking the stage. Time for a gentle edit.',
    over: 'The basics went off-script. A small reset beats a dramatic one.',
  },
  savings: {
    steady: 'This emergency fund protects calm decisions when life changes.',
    tight: 'Build toward six months of essentials so pressure does not force desperate choices.',
    over: 'Your emergency fund is getting stronger. Keep building toward six months of essentials.',
  },
  investment: {
    steady: 'Small seeds, serious compounding.',
    tight: 'The long game likes consistency more than perfection.',
    over: 'Compounding called. It approves of this energy.',
  },
  development: {
    steady: 'Your curiosity has a budget. Spend it boldly.',
    tight: 'Growth is funded, even if the syllabus is still loading.',
    over: 'Your brain is having an excellent quarter.',
  },
  charity: {
    steady: 'The more you give with intention, the more abundance you notice around you.',
    tight: 'Generosity grows best when it is sustainable. Give what you can, then keep your own foundation strong.',
    over: 'You gave generously. Giving can return purpose, connection, and perspective in ways money cannot measure.',
  },
  fun: {
    steady: 'Joy is funded. Excellent financial judgment.',
    tight: 'Fun is still on the plan. Choose the good stuff.',
    over: 'Joy happened. Now let the budget enjoy a quiet evening.',
  },
};

function Avatar({ size = 42, onPress }: { size?: number; onPress?: () => void }) {
  const { palette, profileImageUri, setProfileImageUri, profileFirstName } = useVigil();
  const { displayName, email } = useIdentity();
  const fullName = displayName || profileFirstName || email || 'Vigil member';
  
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
      {profileImageUri ? (
        <Image source={{ uri: profileImageUri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={[styles.avatarText, { color: palette.primaryForeground, fontSize: size * 0.4 }]}>{fullName.charAt(0).toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

function Header({ screen, onReceipt }: { screen: Screen; onReceipt?: () => void }) {
  const { palette, t, countryCode, currency, morningReminder, eveningReminder, setMorningReminder, setEveningReminder, profileImageUri, profileFirstName } = useVigil();
  const { displayName, email, signOut } = useIdentity();
  const [profileVisible, setProfileVisible] = useState(false);
  const [remindersVisible, setRemindersVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const firstName = displayName?.split(/\s+/)[0] || profileFirstName || email?.split('@')[0] || 'there';
  const fullName = displayName || profileFirstName || email || 'Vigil member';
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
            <Text style={[styles.brandName, { color: palette.foreground }]}>VIGIL</Text>
            <Text style={[styles.brandTag, { color: palette.mutedForeground }]}>{t('where')}, {firstName}?</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {onReceipt && <Pressable testID="header-receipt" accessibilityLabel="Scan receipt" onPress={onReceipt} style={({ pressed }) => pressStyle(pressed, styles.iconButton)}>
            <Ionicons name="camera-outline" size={20} color={palette.foreground} />
          </Pressable>}
          <Pressable testID="header-notifications" accessibilityLabel="Reminders" onPress={() => setRemindersVisible(true)} style={({ pressed }) => pressStyle(pressed, styles.iconButton)}>
            <Ionicons name="notifications-outline" size={20} color={palette.foreground} />
          </Pressable>
          <Pressable testID="header-profile" accessibilityLabel="Profile" onPress={() => setProfileVisible(true)} style={({ pressed }) => pressStyle(pressed, styles.iconButton)}>
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
              <View style={{ flex: 1 }}><Text style={[styles.profileName, { color: palette.foreground }]}>{fullName}</Text><Text style={[styles.profileMeta, { color: palette.mutedForeground }]}>{currency} • {countries.find((country) => country.code === countryCode)?.name}</Text></View>
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
  { icon: 'document-text-outline' as const, title: 'See the full picture', copy: 'History keeps your trail, while Analysis turns it into clear guidance with Vigil Pro.' },
];

function TutorialModal({ visible, onFinish }: { visible: boolean; onFinish: () => void }) {
  const { palette } = useVigil();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const current = tutorialSteps[step];
  const { t } = useVigil();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onFinish}><View style={[styles.modalBackdrop, styles.tutorialBackdrop, { backgroundColor: palette.overlay, paddingBottom: Math.max(insets.bottom + 8, 16) }]}><View style={[styles.tutorialCard, { backgroundColor: palette.card }]}><View style={[styles.tutorialIcon, { backgroundColor: palette.accent }]}><Ionicons name={current.icon} size={28} color={palette.primary} /></View><Text style={[styles.tutorialStep, { color: palette.primary }]}>{t('quickStart')} · {step + 1}/{tutorialSteps.length}</Text><Text style={[styles.tutorialTitle, { color: palette.foreground }]}>{current.title}</Text><Text style={[styles.tutorialCopy, { color: palette.mutedForeground }]}>{current.copy}</Text><View style={styles.tutorialDots}>{tutorialSteps.map((item, index) => <View key={item.title} style={[styles.tutorialDot, { backgroundColor: index === step ? palette.primary : palette.border }]} />)}</View><Pressable testID="tutorial-next" onPress={() => { if (step === tutorialSteps.length - 1) onFinish(); else setStep((value) => value + 1); }} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary }])}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{step === tutorialSteps.length - 1 ? t('startUsing') : t('next')}</Text><Ionicons name={step === tutorialSteps.length - 1 ? 'checkmark' : 'arrow-forward'} size={18} color={palette.primaryForeground} /></Pressable><Pressable onPress={onFinish} style={styles.tutorialSkip}><Text style={[styles.settingsLinkText, { color: palette.mutedForeground }]}>{t('skipTutorial')}</Text></Pressable></View></View></Modal>;
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
   const commentary = isOver
    ? copy.over
    : availableRatio > 0.67
      ? copy.steady
      : copy.tight;
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

function DashboardScreen({ onLog, onReceipt, onAsk }: { onLog: () => void; onReceipt: () => void; onAsk: () => void }) {
  const { palette, t, income, transactions, buckets, formatMoney, formatPercent, formatDate, profileFirstName } = useVigil();
  const insets = useSafeAreaInsets();
  const { displayName, email } = useIdentity();
  const firstName = displayName?.split(/\s+/)[0] || profileFirstName || email?.split('@')[0] || 'there';
  const spent = transactions.reduce((sum, item) => sum + item.amount, 0);
  const savings = Math.max(0, income - spent);
  const plannedSavings = income * (buckets.find((bucket) => bucket.id === 'savings')?.percent ?? 0) / 100;
  const spendableSpent = transactions.filter((item) => item.bucketId !== 'savings').reduce((sum, item) => sum + item.amount, 0);
  const remainingToSpend = Math.max(0, income - spendableSpent - plannedSavings);
  const kept = income ? Math.round((savings / income) * 100) : 0;
  return (
    <View style={styles.dashboardFrame}>
    <ScrollView contentContainerStyle={[styles.scrollContent, styles.dashboardScroll]} showsVerticalScrollIndicator={false}>
       <Header screen="spending" onReceipt={onReceipt} />
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.greeting, { color: palette.foreground }]}>{t('hello')}, {firstName}</Text>
          <Text style={[styles.dateLine, { color: palette.mutedForeground }]}>{formatDate(new Date(), { month: 'long', year: 'numeric' })}</Text>
        </View>
         <View style={styles.greetingButtons}>
           <Pressable testID="ask-ai-button" accessibilityLabel="Ask AI financial advisor" onPress={onAsk} style={({ pressed }) => pressStyle(pressed, [styles.askButton, { borderColor: palette.border, backgroundColor: palette.card }])}>
             <Ionicons name="sparkles-outline" size={17} color={palette.primary} />
             <Text style={[styles.askButtonText, { color: palette.foreground }]}>Ask AI</Text>
           </Pressable>
          <Pressable testID="quick-capture-button" accessibilityLabel="Add spending" onPress={onLog} style={({ pressed }) => pressStyle(pressed, [styles.roundAction, { borderColor: palette.primary, backgroundColor: palette.accent }])}>
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
    </ScrollView>
      <Pressable testID="log-spending-fab" onPress={onLog} style={({ pressed }) => pressStyle(pressed, [styles.fab, { bottom: Math.max(insets.bottom + 92, 110), backgroundColor: palette.primary }])}>
        <Ionicons name="mic-outline" size={20} color={palette.primaryForeground} />
        <Text style={[styles.fabText, { color: palette.primaryForeground }]}>{t('logSpending')}</Text>
      </Pressable>
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

function LogModal({ visible, onClose, onUnlock, receiptRequest }: { visible: boolean; onClose: () => void; onUnlock: () => void; receiptRequest: number }) {
  const { palette, t, buckets, addTransaction, currency, rates, refreshRates, toBaseAmount, formatDate, language } = useVigil();
  const { isPro } = useSubscription();
  const { getToken } = useIdentity();
  const handleUnlock = () => { onClose(); onUnlock(); };
  const runGatedAction = (action: () => void) => runProAction(isPro, handleUnlock, action);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [bucketId, setBucketId] = useState<BucketId>('needs');
  const [source, setSource] = useState<Transaction['source']>('manual');
  const [captureUri, setCaptureUri] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [listening, setListening] = useState(false);
  const [reviewTransactions, setReviewTransactions] = useState<ReviewTransaction[]>([]);
  const [originalCapture, setOriginalCapture] = useState<{ amount: number; currency: CurrencyCode; accountAmount: number; detected: boolean } | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const lastReceiptRequest = useRef(0);

  const closeAndReset = () => {
    setAmount(''); setNote(''); setCaptureUri(null); setExtracting(false); setListening(false); setReviewTransactions([]); setOriginalCapture(null); setSource('manual'); onClose();
  };
  const startVoiceRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('recordNote'), 'Microphone access is required to record a spending note.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setSource('voice');
      setListening(true);
    } catch (error) {
      Alert.alert(t('recordNote'), error instanceof Error ? error.message : 'The microphone could not start.');
    }
  };
  const stopVoiceRecording = async () => {
    try {
      await recorder.stop();
      setListening(false);
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording was created.');
      setExtracting(true);
      const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
       const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';
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
        const found = data.transactions?.filter((item) => Number.isFinite(item.amount) && item.amount > 0) ?? [];
       if (found.length) {
          setReviewTransactions(found.map((item) => ({ ...item, selected: true })));
         setAmount(String(found[0].amount));
         setNote(found[0].note || spoken);
         Alert.alert(
           'Voice transactions ready',
           found.length > 1
             ? `${found.length} transactions found. Review the list before saving.`
             : 'Review the amount, note, and bucket, then save the transaction.',
         );
       } else {
         const amountMatch = spoken.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?:\s|$)/);
         if (amountMatch) setAmount(amountMatch[1].replace(',', '.'));
         setNote(spoken);
         Alert.alert('Voice note ready', 'Review the transcription and amount, then save the transaction.');
       }
    } catch (error) {
      Alert.alert('Voice capture unavailable', error instanceof Error ? error.message : 'Type the note and save it manually.');
    } finally {
      setExtracting(false);
    }
  };
  const captureImage = async (camera: boolean) => {
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', camera
          ? 'Allow Vigil to use the camera in Settings, then try receipt capture again.'
          : 'Allow Vigil to access selected photos in Settings, then try again.');
        return;
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: false });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setCaptureUri(asset.uri);
      setSource(camera ? 'receipt' : 'bank');
      setNote((current) => current || (camera ? 'Receipt capture' : 'Bank message capture'));
       setExtracting(true);
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const response = await fetch(`https://${domain}/api/vigil/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source: camera ? 'receipt' : 'bank',
          imageData: `data:${asset.mimeType ?? 'image/jpeg'};base64,${base64}`,
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
           hasMissingRate ? 'Currency conversion needs attention' : 'Details found',
           hasMissingRate
             ? 'Vigil found a currency without a current exchange rate. Enter that amount in your account currency before saving.'
             : found.length > 1
               ? `${found.length} transactions found and converted to ${currency}. Review the list before saving.`
               : 'Vigil filled in the amount, currency, and note. Review them, choose a bucket, and tap Save transaction.',
         );
      } else {
        Alert.alert('Amount not found', 'Vigil attached the image, but could not confidently find an amount. Enter it manually and tap Save transaction.');
      }
    } catch (error) {
      Alert.alert('Capture unavailable', error instanceof Error ? error.message : 'Enter the amount manually and save the transaction.');
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
  const save = () => {
    const numeric = Number(amount.replace(',', '.'));
    const selected = reviewTransactions.filter((item) => item.selected);
    if (reviewTransactions.length > 0 && selected.length === 0) {
      Alert.alert('Choose a transaction', 'Select at least one detected transaction before saving.');
      return;
    }
    if (selected.some((item) => item.conversionError)) {
      Alert.alert('Currency conversion needed', 'One selected bank transaction could not be converted into your account currency. Enter the converted amount manually or deselect it.');
      return;
    }
    if (!numeric || numeric <= 0) {
      Alert.alert(t('amount'), t('enterPositiveAmount'));
      return;
    }
    if (selected.length > 1) {
      selected.forEach((item) => addTransaction({ amount: toBaseAmount(item.amount), currency, note: item.note || t('uncategorised'), bucketId, date: item.date || new Date().toISOString().slice(0, 10), source }));
    } else {
      addTransaction({ amount: toBaseAmount(numeric), currency, note: note.trim() || t('uncategorised'), bucketId, date: selected[0]?.date || new Date().toISOString().slice(0, 10), source });
    }
    const bucketLabel = formatBucketLabel(t(buckets.find((bucket) => bucket.id === bucketId)?.labelKey ?? 'needs'));
    const cleanNote = (note.trim() || selected[0]?.note?.trim() || '').replace(/\s+/g, ' ').slice(0, 56);
    const fillTemplate = (template: string, values: Record<string, string>) => Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);
    const confirmation = selected.length > 1
      ? fillTemplate(t('transactionsSaved'), {
        count: String(selected.length),
        amount: `${currency} ${selected.reduce((total, item) => total + item.amount, 0).toFixed(2)}`,
      })
      : fillTemplate(t(cleanNote ? 'transactionSavedWithNote' : 'transactionSavedInBucket'), {
        amount: `${currency} ${numeric.toFixed(2)}`,
        note: cleanNote,
        bucket: bucketLabel,
      });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t('saved'), confirmation);
    closeAndReset();
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeAndReset}>
      <View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.modalSheet, { backgroundColor: palette.background }]}>
          <View style={styles.modalGrabber} />
          <View style={styles.modalHeader}>
            <View><Text style={[styles.modalTitle, { color: palette.foreground }]}>{t('logTransaction')}</Text><Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>{t('speakOrType')}</Text></View>
            <Pressable testID="close-log-modal" onPress={closeAndReset} style={({ pressed }) => pressStyle(pressed, styles.closeButton)}><Ionicons name="close" size={22} color={palette.foreground} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
            <Text style={[styles.captureSectionLabel, { color: palette.foreground }]}>{t('howAdd')}</Text>
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
                <Pressable testID="voice-capture" onPress={() => runGatedAction(() => { if (listening) void stopVoiceRecording(); else void startVoiceRecording(); })} style={({ pressed }) => pressStyle(pressed, [styles.captureMethod, { borderColor: source === 'voice' ? palette.primary : palette.border, backgroundColor: source === 'voice' ? palette.accent : palette.card }])}>
                <Ionicons name={listening ? 'mic' : 'mic-outline'} size={20} color={source === 'voice' ? palette.primary : palette.foreground} />
                 <Text style={[styles.captureMethodText, { color: source === 'voice' ? palette.primary : palette.foreground }]}>{listening ? 'Stop recording' : t('recordNote')}{!isPro ? ' · Pro' : ''}</Text>
              </Pressable>
            </View>
             {source === 'voice' && <View style={styles.voiceRecorderPanel}><Pressable accessibilityLabel={listening ? 'Stop voice recording' : 'Start voice recording'} onPress={() => { if (listening) void stopVoiceRecording(); else void startVoiceRecording(); }} style={({ pressed }) => pressStyle(pressed, [styles.voiceMicButton, { backgroundColor: listening ? palette.primary : palette.accent, borderColor: palette.primary }])}><Ionicons name={listening ? 'stop' : 'mic'} size={30} color={listening ? palette.primaryForeground : palette.primary} /></Pressable><Text style={[styles.voiceHint, { color: listening ? palette.primary : palette.mutedForeground }]}>{listening ? `Recording ${Math.floor(recorderState.durationMillis / 1000)}s — tap to stop` : `Tap the microphone and speak in any language. ${t('voiceHint')}`}</Text></View>}
             {reviewTransactions.length > 1 && <View style={[styles.reviewList, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.reviewTitle, { color: palette.foreground }]}>Review transactions before saving</Text>{reviewTransactions.map((item, index) => <Pressable key={`${item.note}-${index}`} onPress={() => setReviewTransactions((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, selected: !candidate.selected } : candidate))} style={styles.reviewRow}><Ionicons name={item.selected ? 'checkbox' : 'square-outline'} size={21} color={item.selected ? palette.primary : palette.mutedForeground} /><View style={{ flex: 1 }}><Text style={[styles.reviewNote, { color: palette.foreground }]}>{item.note || t('uncategorised')}</Text><Text style={[styles.reviewMeta, { color: item.conversionError ? palette.primary : palette.mutedForeground }]}>{item.conversionError ? 'Exchange rate unavailable' : item.date || formatDate(new Date())}</Text></View><Text style={[styles.reviewAmount, { color: palette.foreground }]}>{item.originalCurrency && item.originalAmount !== undefined && item.originalCurrency !== currency ? `${item.originalCurrency} ${item.originalAmount.toFixed(2)} → ${currency} ${item.amount.toFixed(2)}` : `${currency} ${item.amount.toFixed(2)}`}</Text></Pressable>)}</View>}
            {listening && <TextInput autoFocus value={note} onChangeText={setNote} placeholder={t('writeWhatSay')} placeholderTextColor={palette.mutedForeground} style={[styles.input, { borderColor: palette.primary, color: palette.foreground, backgroundColor: palette.card }]} />}
            <Text style={[styles.inputLabel, { color: palette.foreground }]}>{t('amount')}</Text>
             <View style={styles.amountRow}>
               <View style={[styles.currencyBox, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.currencyText, { color: palette.foreground }]}>{currency}</Text><Ionicons name="chevron-down" size={15} color={palette.mutedForeground} /></View>
               <TextInput testID="amount-input" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={palette.mutedForeground} keyboardType="decimal-pad" style={[styles.amountInput, { borderColor: palette.border, color: palette.foreground, backgroundColor: palette.card }]} />
            </View>
             {source === 'bank' && originalCapture && <Text style={[styles.conversionNote, { color: palette.mutedForeground }]}>{originalCapture.detected ? `Original bank amount: ${originalCapture.currency} ${originalCapture.amount.toFixed(2)}` : `Bank currency was unclear; assumed ${currency}`} · Saving as: {currency} {amount || '0.00'}</Text>}
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
             <Pressable testID="save-transaction" disabled={extracting} onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, { backgroundColor: palette.primary, opacity: extracting ? 0.6 : 1 }])}><Ionicons name="checkmark" size={19} color={palette.primaryForeground} /><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{extracting ? 'Processing…' : t('saveTransaction')}</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AdvisorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, income, transactions, buckets, currency } = useVigil();
  const { getToken } = useIdentity();
  const [question, setQuestion] = useState('');
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
    addIncome(toBaseAmount(numeric)); setAmount(''); onClose(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert(t('excellent'), t('positiveAction'));
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
    if (!label.trim()) { Alert.alert('Bucket name', 'Give this bucket a name first.'); return; }
    onSave(label, Number(value) || 0);
  };
  return <Modal visible={!!bucket} transparent animationType="fade" onRequestClose={onClose}><View style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}><KeyboardAwareScrollViewCompat contentContainerStyle={styles.editorKeyboardContent} bottomOffset={24}>
    <View style={[styles.editorCard, { backgroundColor: palette.card }]}>
    <Text style={[styles.modalTitle, { color: palette.foreground }]}>{isNew ? 'Add bucket' : bucket ? t(bucket.labelKey) : ''}</Text>
    <Text style={[styles.modalSubtitle, { color: palette.mutedForeground }]}>Name it and set the share of each new income.</Text>
    <TextInput autoFocus={isNew} returnKeyType="next" value={label} onChangeText={setLabel} placeholder="Bucket name" placeholderTextColor={palette.mutedForeground} style={[styles.editorTextInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} />
    <View style={styles.editorInputRow}><TextInput returnKeyType="done" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={palette.mutedForeground} style={[styles.editorInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]} /><Text style={[styles.percentSuffix, { color: palette.mutedForeground }]}>%</Text></View>
    <View style={styles.editorActions}><Pressable onPress={onClose} style={({ pressed }) => pressStyle(pressed, [styles.secondaryButton, { borderColor: palette.border }])}><Text style={[styles.secondaryButtonText, { color: palette.foreground }]}>Cancel</Text></Pressable><Pressable onPress={save} style={({ pressed }) => pressStyle(pressed, [styles.primaryButton, styles.editorSave, { backgroundColor: palette.primary }])}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('saved')}</Text></Pressable></View>
    {!isNew && onDelete && <Pressable onPress={() => Alert.alert('Remove bucket?', 'Transactions in this bucket will move to the first remaining bucket.', [{ text: t('cancel'), style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onDelete }])} style={styles.deleteBucketAction}><Ionicons name="trash-outline" size={16} color={palette.destructive} /><Text style={[styles.deleteBucketText, { color: palette.destructive }]}>Remove bucket</Text></Pressable>}
    </View>
  </KeyboardAwareScrollViewCompat></View></Modal>;
}

function HistoryScreen({ onUnlock }: { onUnlock: () => void }) {
  const { palette, t, transactions, buckets, removeTransaction: deleteTransaction, formatMoney } = useVigil();
  const removeTransaction = (id: string) => Alert.alert(t('deleteTransaction'), t('deleteTransactionCopy'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('delete'), style: 'destructive', onPress: () => deleteTransaction(id) },
  ]);
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}><Header screen="history" /><View style={[styles.historyBanner, { backgroundColor: palette.secondary }]}><Ionicons name="time-outline" size={22} color={palette.primary} /><Text style={[styles.historyBannerText, { color: palette.secondaryForeground }]}>Every honest log makes the next decision easier.</Text></View><SectionTitle title={t('recent')} /><View style={[styles.historyCard, { borderColor: palette.border, backgroundColor: palette.card }]}>{transactions.length === 0 ? <View style={styles.emptyState}><Ionicons name="file-tray-outline" size={28} color={palette.mutedForeground} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{t('noTransactions')}</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{t('noTransactionsCopy')}</Text></View> : transactions.map((item) => { const bucket = buckets.find((candidate) => candidate.id === item.bucketId); return <View key={item.id} style={[styles.transactionRow, { borderBottomColor: palette.border }]}><View style={[styles.transactionIcon, { backgroundColor: palette.secondary }]}><MaterialCommunityIcons name={bucket?.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={palette.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.transactionNote, { color: palette.foreground }]} numberOfLines={1}>{item.note}</Text><Text style={[styles.transactionMeta, { color: palette.mutedForeground }]}>{bucket ? t(bucket.labelKey) : ''} • {item.date}</Text></View><Text style={[styles.transactionAmount, { color: palette.foreground }]}>-{formatMoney(item.amount)}</Text><Pressable testID={`delete-${item.id}`} onPress={() => removeTransaction(item.id)} style={({ pressed }) => pressStyle(pressed, styles.deleteButton)}><Ionicons name="trash-outline" size={17} color={palette.mutedForeground} /></Pressable></View>; })}</View></ScrollView>;
}

 function AnalysisScreen({ onUnlock }: { onUnlock: () => void }) {
  const { palette, t, income, transactions, formatMoney } = useVigil();
  const { isPro } = useSubscription();
  const spent = transactions.reduce((sum, item) => sum + item.amount, 0);
  const needsSpent = transactions.filter((item) => item.bucketId === 'needs').reduce((sum, item) => sum + item.amount, 0);
  const needsRatio = income ? needsSpent / income * 100 : 0;
  const topSpend = useMemo(() => transactions.reduce((top, item) => item.amount > top.amount ? item : top, transactions[0] ?? { amount: 0, note: '—' } as Transaction), [transactions]);
  if (!isPro) return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}><Header screen="analysis" /><View style={[styles.reportHero, { backgroundColor: palette.primary }]}><View style={styles.reportIcon}><Ionicons name="sparkles" size={20} color={palette.primary} /></View><Text style={[styles.reportHeroTitle, { color: palette.primaryForeground }]}>{t('locked')}</Text><Text style={[styles.reportHeroCopy, { color: palette.primaryForeground }]}>{t('reportCopy')}</Text><Pressable testID="unlock-insights" onPress={onUnlock} style={({ pressed }) => pressStyle(pressed, [styles.reportButton, { backgroundColor: palette.primaryForeground }])}><Text style={[styles.reportButtonText, { color: palette.primary }]}>{t('unlock')}</Text><Ionicons name="arrow-forward" size={16} color={palette.primary} /></Pressable></View><View style={[styles.historyCard, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{t('ready')}</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{t('reportCopy')}</Text></View></ScrollView>;
   return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}><Header screen="analysis" /><View style={[styles.reportHero, { backgroundColor: palette.primary }]}><View style={styles.reportIcon}><Ionicons name="sparkles" size={20} color={palette.primary} /></View><Text style={[styles.reportHeroTitle, { color: palette.primaryForeground }]}>{t('report')}</Text><Text style={[styles.reportHeroCopy, { color: palette.primaryForeground }]}>{t('reportCopy')}</Text></View><SectionTitle title={t('analysis')} /><View style={styles.insightGrid}><View style={[styles.insightCard, { backgroundColor: palette.positiveSoft }]}><Ionicons name="trending-up-outline" size={21} color={palette.positive} /><Text style={[styles.insightNumber, { color: palette.positive }]}>{income ? Math.round((1 - spent / income) * 100) : 0}%</Text><Text style={[styles.insightLabel, { color: palette.secondaryForeground }]}>{t('remaining')}</Text></View><View style={[styles.insightCard, { backgroundColor: palette.warningSoft }]}><Ionicons name="home-outline" size={21} color={palette.warning} /><Text style={[styles.insightNumber, { color: palette.warning }]}>{Math.round(needsRatio)}%</Text><Text style={[styles.insightLabel, { color: palette.secondaryForeground }]}>{t('needs')}</Text></View></View><View style={[styles.adviceCard, { borderColor: palette.border, backgroundColor: palette.card }]}><Ionicons name="bulb-outline" size={21} color={palette.primary} /><View style={{ flex: 1 }}><Text style={[styles.adviceTitle, { color: palette.foreground }]}>{t('needsUnder')}</Text><Text style={[styles.adviceCopy, { color: palette.mutedForeground }]}>Keeping needs near 45% protects choice: when essentials consume every dirham, the brain shifts into scarcity mode and small surprises feel like emergencies. A clear ceiling creates room to decide calmly.</Text></View></View><View style={[styles.topSpendCard, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.eyebrow, { color: palette.mutedForeground }]}>{t('recent').toUpperCase()}</Text><Text style={[styles.topSpendAmount, { color: palette.foreground }]}>{formatMoney(topSpend.amount)}</Text><Text style={[styles.topSpendNote, { color: palette.mutedForeground }]}>{topSpend.note}</Text></View></ScrollView>;
}

function SubscriptionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, t } = useVigil();
  const { configured, error: subscriptionError, loading, isPro, monthlyPackage, yearlyPackage, purchase, restore, refresh, retry } = useSubscription();
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

function SettingsScreen({ onSubscribe }: { onSubscribe: () => void }) {
  const { palette, t, language, setLanguage, themeMode, setThemeMode, morningReminder, eveningReminder, setMorningReminder, setEveningReminder, countryCode, currency, setCountry: updateCountry, setCurrency: updateCurrency, ratesUpdatedAt, startOver, profileFirstName } = useVigil();
  const { displayName, email, isSignedIn, isAdmin, signOut, deleteAccount: deleteIdentityAccount } = useIdentity();
  const { isPro, restore } = useSubscription();
  const [restoring, setRestoring] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const languages: { id: Language; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'fr', label: 'Français' }, { id: 'cs', label: 'Čeština' }, { id: 'de', label: 'Deutsch' }, { id: 'es', label: 'Español' }, { id: 'ru', label: 'Русский' }, { id: 'ar', label: 'العربية' }];
  const themes: { id: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [{ id: 'light', label: t('themeLight'), icon: 'sunny-outline' }, { id: 'dark', label: t('themeDark'), icon: 'moon-outline' }, { id: 'auto', label: t('themeAuto'), icon: 'contrast-outline' }];
  const fullName = displayName || profileFirstName || email || 'Vigil member';
  const selectedCountry = countries.find((country) => country.code === countryCode) ?? countries[0];
  const setCountry = (nextCountry: CountryCode) => { runProAction(isPro, onSubscribe, () => updateCountry(nextCountry)); };
  const setCurrency = (nextCurrency: string) => { runProAction(isPro, onSubscribe, () => updateCurrency(nextCurrency)); };
  const resetEverything = () => Alert.alert(t('clearHistoryWarningTitle'), t('clearHistoryWarningCopy'), [{ text: t('cancel'), style: 'cancel' }, { text: t('clearHistoryConfirm'), style: 'destructive', onPress: async () => { await startOver(); router.replace('/onboarding'); } }]);
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
      Alert.alert(t('signOut'), error instanceof Error && /timed out/i.test(error.message) ? 'Sign out took too long. Please try again.' : t('authCopy'));
    }
  };
  const deleteAccount = () => Alert.alert(t('deleteAccountWarningTitle'), t('deleteAccountWarningCopy'), [{ text: t('cancel'), style: 'cancel' }, { text: t('deleteAccountConfirm'), style: 'destructive', onPress: async () => {
    try {
      await deleteIdentityAccount();
      await startOver();
      router.replace('/sign-in');
    } catch (error) {
      Alert.alert(t('deleteAccount'), error instanceof Error ? error.message : t('authCopy'));
    }
  } }]);
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <Header screen="settings" />
    <View style={[styles.profileCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Avatar />
      <View style={{ flex: 1 }}><Text style={[styles.profileName, { color: palette.foreground }]}>{fullName}</Text><Text style={[styles.profileMeta, { color: palette.mutedForeground }]}>{currency} • {selectedCountry.name}</Text></View>
      <Ionicons name={isPro ? 'shield-checkmark' : 'person-outline'} size={20} color={palette.primary} />
    </View>
    <SectionTitle title="Your Vigil plan" />
    <View style={[styles.planCompare, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.planCompareHead}><View><Text style={[styles.settingTitle, { color: palette.foreground }]}>{isPro ? 'Vigil Pro' : 'Vigil Free'}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{isPro ? 'Every feature is unlocked.' : 'Simple daily clarity, always free.'}</Text></View><View style={[styles.planPill, { backgroundColor: isPro ? palette.positiveSoft : palette.secondary }]}><Text style={[styles.planPillText, { color: isPro ? palette.positive : palette.foreground }]}>{isPro ? 'PRO' : 'FREE'}</Text></View></View>
       <View style={styles.featureColumns}><View style={{ flex: 1 }}><Text style={[styles.featureHeading, { color: palette.foreground }]}>FREE</Text><Text style={[styles.featureLine, { color: palette.mutedForeground }]}>• Manual spending logs</Text><Text style={[styles.featureLine, { color: palette.mutedForeground }]}>• Income and bucket planning</Text><Text style={[styles.featureLine, { color: palette.mutedForeground }]}>• Recent transaction history</Text></View><View style={{ flex: 1 }}><Text style={[styles.featureHeading, { color: palette.primary }]}>VIGIL PRO</Text><Text style={[styles.featureLine, { color: palette.mutedForeground }]}>• Voice, receipt, and screenshot capture</Text><Text style={[styles.featureLine, { color: palette.mutedForeground }]}>• Country-aware tax planning and currencies</Text><Text style={[styles.featureLine, { color: palette.mutedForeground }]}>• Full Analysis reports and bucket insights</Text></View></View>
       {!isPro && <Pressable testID="settings-subscribe" onPress={onSubscribe} style={[styles.compactPrimary, { backgroundColor: palette.primary }]}><Text style={[styles.primaryButtonText, { color: palette.primaryForeground }]}>{t('viewPlans')}</Text></Pressable>}
       <Pressable disabled={restoring} onPress={async () => { setRestoring(true); try { const restored = await restore(); Alert.alert('Restore purchases', restored ? 'Vigil Pro restored.' : 'No active Vigil Pro purchase was found for this Apple ID.'); } catch (error) { Alert.alert('Restore purchases', error instanceof Error ? error.message : 'Restore purchases could not be completed. Please try again.'); } finally { setRestoring(false); } }} style={{ alignItems: 'center', paddingTop: 12 }}><Text style={[styles.settingsLinkText, { color: palette.primary }]}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text></Pressable>
    </View>
     {isAdmin && <Text style={[styles.helperText, { color: palette.mutedForeground }]}>Admin testing mode is active. Pro capture and analysis are available without a purchase.</Text>}
    <SectionTitle title={isPro ? t('country') : `${t('country')} · Pro`} />
    <CountryPicker value={countryCode} onChange={setCountry} disabled={!isPro} onBlocked={onSubscribe} />
    <Text style={[styles.helperText, { color: palette.mutedForeground }]}>{selectedCountry.taxPercent > 0 ? `A ${selectedCountry.taxPercent}% planning estimate is reserved in Tax. Adjust this bucket for your actual situation.` : 'No personal income-tax bucket is shown for this country.'}</Text>
     <View style={{ marginTop: 12 }}><CurrencyPicker value={currency} onChange={setCurrency} disabled={!isPro} onBlocked={onSubscribe} /></View>
    
    <SectionTitle title={t('appearance')} />
    <View style={[styles.segmented, { backgroundColor: palette.secondary }]}>{themes.map((theme) => <Pressable key={theme.id} onPress={() => setThemeMode(theme.id)} style={({ pressed }) => pressStyle(pressed, [styles.segment, themeMode === theme.id && { backgroundColor: palette.card }])}><Ionicons name={theme.icon} size={16} color={themeMode === theme.id ? palette.primary : palette.mutedForeground} /><Text style={[styles.segmentText, { color: themeMode === theme.id ? palette.foreground : palette.mutedForeground }]}>{theme.label}</Text></Pressable>)}</View>
    <SectionTitle title={t('language')} /><View style={styles.languageGrid}>{languages.map((item) => <Pressable key={item.id} onPress={() => setLanguage(item.id)} style={({ pressed }) => pressStyle(pressed, [styles.languageChip, { borderColor: language === item.id ? palette.primary : palette.border, backgroundColor: language === item.id ? palette.accent : palette.card }])}><Text style={[styles.languageText, { color: language === item.id ? palette.primary : palette.foreground }]}>{item.label}</Text></Pressable>)}</View>
    <SectionTitle title={t('morning')} />
    <View style={[styles.settingRow, { borderColor: palette.border, backgroundColor: palette.card }]}><View style={[styles.settingIcon, { backgroundColor: palette.positiveSoft }]}><Ionicons name="sunny-outline" size={18} color={palette.positive} /></View><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('morning')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>8:00 AM · Log before life gets loud.</Text></View><Switch testID="morning-reminder" value={morningReminder} onValueChange={setMorningReminder} trackColor={{ false: palette.track, true: palette.positive }} thumbColor={palette.card} /></View>
    <View style={[styles.settingRow, { borderColor: palette.border, backgroundColor: palette.card }]}><View style={[styles.settingIcon, { backgroundColor: palette.warningSoft }]}><Ionicons name="moon-outline" size={18} color={palette.warning} /></View><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('evening')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>8:30 PM · Close the loop with kindness.</Text></View><Switch testID="evening-reminder" value={eveningReminder} onValueChange={setEveningReminder} trackColor={{ false: palette.track, true: palette.warning }} thumbColor={palette.card} /></View>
    <Text style={[styles.helperText, { color: palette.mutedForeground }]}>{t('reminderCopy')}</Text>
     {!isSignedIn && <Pressable testID="sign-in-link" onPress={() => Linking.openURL('vigil-spend://sign-in')} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.card }])}><Ionicons name="person-circle-outline" size={19} color={palette.primary} /><Text style={[styles.settingsLinkText, { color: palette.foreground }]}>{t('signIn')} · Google or email</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>}
    {isSignedIn && <Pressable testID="sign-out-button" disabled={signingOut} onPress={() => void signOutNow()} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.card, opacity: signingOut ? 0.6 : 1 }])}><Ionicons name="log-out-outline" size={19} color={palette.mutedForeground} /><Text style={[styles.settingsLinkText, { color: palette.mutedForeground }]}>{signingOut ? 'Signing out…' : t('signOut')}</Text><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>}
    {isAdmin && <Pressable onPress={() => router.push('/admin')} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.primary, backgroundColor: palette.card }])}><Ionicons name="shield-checkmark-outline" size={19} color={palette.primary} /><Text style={[styles.settingsLinkText, { color: palette.foreground }]}>Admin</Text><Ionicons name="chevron-forward" size={16} color={palette.primary} /></Pressable>}
    <SectionTitle title={t('account')} />
    <Pressable testID="delete-all-data" onPress={resetEverything} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.border, backgroundColor: palette.card }])}><Ionicons name="refresh-outline" size={19} color={palette.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.foreground }]}>{t('deleteAllData')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{t('deleteAllDataCopy')}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} /></Pressable>
    <Pressable testID="delete-account" onPress={deleteAccount} style={({ pressed }) => pressStyle(pressed, [styles.settingsLink, { borderColor: palette.destructive, backgroundColor: palette.card }])}><Ionicons name="person-remove-outline" size={19} color={palette.destructive} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: palette.destructive }]}>{t('deleteAccount')}</Text><Text style={[styles.settingCopy, { color: palette.mutedForeground }]}>{t('deleteAccountCopy')}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.destructive} /></Pressable>
        <View style={styles.legalRow}><Pressable testID="privacy-link" onPress={() => router.push('/legal?document=privacy')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('privacyPolicy')}</Text></Pressable><Pressable testID="terms-link" onPress={() => router.push('/legal?document=terms')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('termsConditions')}</Text></Pressable><Pressable testID="terms-use-link" onPress={() => router.push('/legal?document=use')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('termsOfUse')}</Text></Pressable></View>
  </ScrollView>;
}

export default function VigilApp({ screen }: { screen: Screen }) {
  const insets = useSafeAreaInsets();
  const { palette, hydrated, onboardingComplete } = useVigil();
  const { userId } = useIdentity();
  const [logVisible, setLogVisible] = useState(false);
  const [receiptRequest, setReceiptRequest] = useState(0);
  const [incomeVisible, setIncomeVisible] = useState(false);
  const [advisorVisible, setAdvisorVisible] = useState(false);
  const [subscriptionVisible, setSubscriptionVisible] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  useEffect(() => {
    if (!hydrated || !onboardingComplete) return;
    const openCaptureFromUrl = (url: string | null) => {
      if (!url || !/capture/i.test(url)) return;
      setReceiptRequest((value) => value + 1);
      setLogVisible(true);
    };
    void Linking.getInitialURL().then(openCaptureFromUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => openCaptureFromUrl(url));
    return () => subscription.remove();
  }, [hydrated, onboardingComplete]);
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
  const unlockPro = () => setSubscriptionVisible(true);
  const openReceiptCapture = () => {
    setReceiptRequest((value) => value + 1);
    setLogVisible(true);
  };
  const content = screen === 'spending' ? <DashboardScreen onLog={() => setLogVisible(true)} onReceipt={openReceiptCapture} onAsk={() => setAdvisorVisible(true)} /> : screen === 'plan' ? <PlanScreen onIncome={() => setIncomeVisible(true)} onUnlock={unlockPro} /> : screen === 'history' ? <HistoryScreen onUnlock={unlockPro} /> : screen === 'analysis' ? <AnalysisScreen onUnlock={unlockPro} /> : <SettingsScreen onSubscribe={unlockPro} />;
  const safeTop = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top + 8;
  return <View style={[styles.app, { backgroundColor: palette.background, paddingTop: safeTop }]}>{content}<LogModal visible={logVisible} receiptRequest={receiptRequest} onClose={() => setLogVisible(false)} onUnlock={() => setSubscriptionVisible(true)} /><IncomeModal visible={incomeVisible} onClose={() => setIncomeVisible(false)} /><AdvisorModal visible={advisorVisible} onClose={() => setAdvisorVisible(false)} /><SubscriptionModal visible={subscriptionVisible} onClose={() => setSubscriptionVisible(false)} /><TutorialModal visible={tutorialVisible} onFinish={finishTutorial} /></View>;
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
  captureMethodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  captureMethod: { width: '48%', minHeight: 64, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 9 },
  captureMethodText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  voiceRecorderPanel: { alignItems: 'center', paddingVertical: 10 },
  voiceMicButton: { width: 82, height: 82, borderRadius: 41, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  voiceHint: { textAlign: 'center', fontSize: 12, marginTop: 8, marginBottom: 17 },
  reviewList: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 12 },
  reviewTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e6e7e9' },
  reviewNote: { fontSize: 12, fontWeight: '600' },
  reviewMeta: { fontSize: 10, marginTop: 3 },
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
  profileSheet: { borderRadius: 24, marginHorizontal: 20, padding: 18 },
  profileSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  advisorSheet: { flex: 1, maxHeight: '82%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 9, paddingBottom: 13 },
  advisorBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  advisorMessages: { marginTop: 11 },
  advisorMessagesContent: { paddingBottom: 10, flexGrow: 1, justifyContent: 'flex-end' },
  advisorWelcome: { borderRadius: 17, padding: 15, marginTop: 12 },
  advisorWelcomeTitle: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  advisorWelcomeCopy: { fontSize: 12, lineHeight: 18, marginTop: 6 },
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