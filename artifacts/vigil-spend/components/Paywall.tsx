import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useVigil } from '@/context/AppContext';
import type { PurchasesPackage } from 'react-native-purchases';
import { LegalContent, LegalDocument } from '@/app/legal';

export type Plan = 'yearly' | 'monthly';

export interface PaywallProps {
  selectedPlan: Plan;
  onSelectPlan: (plan: Plan) => void;
  onPurchase: () => void;
  onRestore: () => void;
  onClose?: () => void;
  onContinueBasic?: () => void;
  onRetry?: () => void;
  yearlyPackage: PurchasesPackage | null;
  monthlyPackage: PurchasesPackage | null;
  yearlyTrialEligible: boolean;
  loading: boolean;
  purchasing: boolean;
  restoring: boolean;
  configured: boolean;
  isPro?: boolean;
  introHeadline?: string;
  introCopy?: string;
  goalLine?: string;
  hideUnlockHeadline?: boolean;
}

export function PaywallContent({
  selectedPlan,
  onSelectPlan,
  onPurchase,
  onRestore,
  onClose,
  onContinueBasic,
  onRetry,
  yearlyPackage,
  monthlyPackage,
  yearlyTrialEligible,
  loading,
  purchasing,
  restoring,
  configured,
  isPro,
  introHeadline,
  introCopy,
  goalLine,
  hideUnlockHeadline = false,
}: PaywallProps) {
  const { palette, t, language } = useVigil();
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);
  
  const selectedPackage = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
  // A configured SDK is not enough to purchase. Require the selected package
  // so the CTA can never show a fallback price while the store catalog is
  // missing or still loading.
  const canAttemptPurchase = configured && !loading && Boolean(selectedPackage);
  const monthlyPrice = monthlyPackage?.product.priceString ?? '';
  const yearlyPrice = yearlyPackage?.product.priceString ?? '';
  const yearlyTrial = selectedPlan === 'yearly' && yearlyTrialEligible && Boolean(yearlyPackage);
  const selectedPrice = selectedPackage?.product.priceString ?? '';
  const purchaseCta = yearlyTrial
    ? t('trialStart')
    : selectedPackage
      ? t('payPlanToday').replace('{price}', selectedPrice)
      : t('planUnavailable');
  const disableActions = purchasing || restoring;

  return (
    <View style={[styles.container, { direction: language === 'ar' ? 'rtl' : 'ltr' }]}>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Top section */}
        <View style={styles.topSection}>
          {onClose && (
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel={t('back')}>
               <Ionicons name="chevron-back" size={28} color={palette.foreground} />
            </Pressable>
          )}
          
          <View style={styles.introSection}>
            <Text style={[styles.preparingHeadline, { color: palette.foreground, textAlign: language === 'ar' ? 'right' : 'left' }]}>{introHeadline ?? t('paywallPreparing')}</Text>
            <Text style={[styles.preparingCopy, { color: palette.mutedForeground, textAlign: language === 'ar' ? 'right' : 'left' }]}>{introCopy ?? t('paywallPreparingCopy')}</Text>
            {goalLine ? <Text style={[styles.goalLine, { color: palette.primary, textAlign: language === 'ar' ? 'right' : 'left' }]}>{goalLine}</Text> : null}
          </View>

          <View style={styles.benefitsList}>
            <BenefitRow icon="mic-outline" text={t('paywallBenefit1')} palette={palette} />
            <BenefitRow icon="receipt-outline" text={t('paywallBenefit2')} palette={palette} />
            <BenefitRow icon="sparkles-outline" text={t('paywallBenefit3')} palette={palette} />
          </View>
        </View>

        {/* 2. Main paywall section */}
        <View style={styles.paywallSection}>
          {!hideUnlockHeadline && <Text style={[styles.unlockHeadline, { color: palette.foreground }]}>{t('paywallUnlock')}</Text>}
          
          {/* 3. Pricing options */}
          <View style={styles.planList}>
            {/* Yearly Card (First) */}
            <PlanCard
              plan="yearly"
              selected={selectedPlan === 'yearly'}
              onSelect={() => onSelectPlan('yearly')}
              pkg={yearlyPackage}
              title={t('premiumYearly')}
                details={yearlyTrialEligible ? t('annualTrialDetails') : t('annualPlanDetails')}
               price={yearlyPrice}
              loading={loading}
              palette={palette}
              bestValue={t('bestValue')}
            />
            {/* Monthly Card (Second) */}
            <PlanCard
              plan="monthly"
              selected={selectedPlan === 'monthly'}
              onSelect={() => onSelectPlan('monthly')}
              pkg={monthlyPackage}
              title={t('premiumMonthly')}
               details={t('monthlyPlanDetails')}
               price={monthlyPrice}
              loading={loading}
              palette={palette}
            />
          </View>
          
            {!loading && !selectedPackage && onRetry && (
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.planTrial, { color: palette.mutedForeground, marginTop: 8 }]}>{t('plansUnavailableCopy')}</Text>
              <Pressable testID="retry-subscription-plans" onPress={onRetry} style={styles.textButton}>
                <Text style={[styles.textButtonLabel, { color: palette.primary }]}>{t('billingRetry')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomSection}>
        {/* 4. CTA */}
        <Pressable 
          testID="paywall-subscribe" 
          disabled={disableActions || !canAttemptPurchase || isPro}
          onPress={onPurchase} 
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.primary, opacity: disableActions || !canAttemptPurchase || isPro ? 0.6 : 1 }, pressed && styles.pressed]}
        >
          {purchasing ? (
            <ActivityIndicator color={palette.primaryForeground} />
          ) : (
            <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>
              {isPro ? t('proActive') : purchaseCta}
            </Text>
          )}
        </Pressable>

        {onContinueBasic && (
           <Pressable testID="continue-basic" onPress={onContinueBasic} style={styles.textButton} accessibilityLabel={t('back')}>
              <Text style={[styles.textButtonLabel, { color: palette.foreground }]}>{t('continueBasic')}</Text>
           </Pressable>
        )}
        <Text style={[styles.finePrint, { color: palette.mutedForeground }]}>
          {selectedPackage
             ? t(selectedPlan === 'yearly' && yearlyTrialEligible ? 'annualTrialFinePrint' : selectedPlan === 'yearly' ? 'annualFinePrint' : 'monthlyFinePrint')
              .replaceAll('{price}', selectedPlan === 'yearly' ? yearlyPrice : monthlyPrice)
            : t('plansUnavailableCopy')}
        </Text>

        {/* 5. Footer */}
        <View style={styles.footer}>
           <Pressable onPress={() => setLegalDoc('terms')} style={styles.footerLink}>
              <Text style={[styles.footerText, { color: palette.mutedForeground }]}>{t('paywallTerms')}</Text>
           </Pressable>
           <Text style={[styles.footerDot, { color: palette.border }]}>•</Text>
           <Pressable onPress={() => setLegalDoc('privacy')} style={styles.footerLink}>
              <Text style={[styles.footerText, { color: palette.mutedForeground }]}>{t('paywallPrivacy')}</Text>
           </Pressable>
           <Text style={[styles.footerDot, { color: palette.border }]}>•</Text>
           <Pressable disabled={!configured || disableActions} onPress={onRestore} style={styles.footerLink}>
              <Text style={[styles.footerText, { color: palette.mutedForeground }, (!configured || disableActions) && { opacity: 0.5 }]}>
                {restoring ? t('restoring') : t('paywallRestore')}
              </Text>
           </Pressable>
        </View>
      </View>
      <Modal visible={!!legalDoc} animationType="slide" onRequestClose={() => setLegalDoc(null)}>
        {legalDoc && <LegalContent document={legalDoc} onClose={() => setLegalDoc(null)} />}
      </Modal>
    </View>
  );
}

function BenefitRow({ icon, text, palette }: { icon: keyof typeof Ionicons.glyphMap; text: string; palette: ReturnType<typeof useVigil>['palette'] }) {
  return (
    <View style={styles.benefitRow}>
      <View style={[styles.benefitIcon, { backgroundColor: palette.accent }]}>
        <Ionicons name={icon} size={18} color={palette.primary} />
      </View>
      <Text style={[styles.benefitText, { color: palette.foreground }]}>{text}</Text>
    </View>
  );
}

function PlanCard({ plan, selected, onSelect, pkg, title, details, price, loading, palette, bestValue }: { plan: Plan; selected: boolean; onSelect: () => void; pkg: PurchasesPackage | null; title: string; details: string; price: string; loading: boolean; palette: ReturnType<typeof useVigil>['palette']; bestValue?: string }) {
  const { t } = useVigil();
  const available = Boolean(pkg);
  const livePrice = pkg?.product.priceString;
  return (
    <Pressable 
      disabled={!available || loading} 
      onPress={() => {
        void Haptics.selectionAsync();
        onSelect();
      }} 
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.planChoice, 
        { 
          opacity: available ? 1 : 0.6, 
          backgroundColor: selected ? palette.accent : palette.card, 
          borderColor: selected ? palette.primary : palette.border 
        }, 
        pressed && styles.pressed
      ]}
    >
      <View style={{ flex: 1 }}>
          <Text style={[styles.planTitle, { color: palette.foreground }]}>{title}</Text>
          <Text style={[styles.planTrial, { color: palette.mutedForeground }]}>
             {loading ? t('loadingPlan') : available ? details : t('plansUnavailableCopy')}
          </Text>
           {!loading && available && <Text style={[styles.planPrice, { color: palette.foreground }]}>{livePrice || price}</Text>}
      </View>
      {bestValue && (
        <View style={[styles.bestBadge, { backgroundColor: palette.primary }]}>
          <Text style={[styles.bestText, { color: palette.primaryForeground }]}>{bestValue.toUpperCase()}</Text>
        </View>
      )}
      <View style={[styles.radio, { borderColor: selected ? palette.primary : palette.border }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: palette.primary }]} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  topSection: {
  },
  closeBtn: {
    alignSelf: 'flex-start',
    marginBottom: 4,
    paddingVertical: 8,
    paddingRight: 16,
  },
  introSection: {
    marginBottom: 24,
    marginTop: 4,
  },
  preparingHeadline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
  },
  preparingCopy: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  goalLine: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  benefitsList: {
    gap: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    flex: 1,
  },
  paywallSection: {
    marginTop: 36,
  },
  unlockHeadline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 28,
    marginBottom: 20,
    textAlign: 'center',
  },
  planList: {
    gap: 12,
  },
  planChoice: { 
    minHeight: 80, 
    borderWidth: 1, 
    borderRadius: 18, 
    padding: 16, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  planTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  planTrial: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 5 },
  planPrice: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 6 },
  bestBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'center', marginRight: 10 },
  bestText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  bottomSection: {
    paddingTop: 16,
  },
  primaryButton: { minHeight: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  trialCharge: { fontFamily: 'Inter_700Bold', fontSize: 14, textAlign: 'center', marginBottom: 9 },
  textButton: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  textButtonLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  finePrint: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 12,
  },
  footerLink: {
    paddingVertical: 8,
  },
  footerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  footerDot: {
    fontSize: 10,
  }
});
