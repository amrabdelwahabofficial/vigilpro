import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVigil } from '@/context/AppContext';
import { useIdentity } from '@/context/IdentityContext';
import { supportCopy, supportText } from '@/lib/supportCopy';

type AdminUser = {
  id: string;
  provider: 'clerk' | 'apple';
  name: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string | null;
  email: string;
  createdAt?: string | null;
  subscription: 'trial' | 'paid' | 'free';
  subscriptionStatus?: string;
  plan?: string | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  revenueUsd: number;
  renews: boolean;
  proOverride: boolean;
  subscriptions?: SubscriptionDetail[];
};
type SubscriptionDetail = {
  id: string;
  productId: string;
  status: string;
  givesAccess: boolean;
  revenueUsd: number;
  renews: boolean;
  startsAt: string | null;
  endsAt: string | null;
};
type Overview = {
  users: AdminUser[];
  page?: { offset: number; limit: number; nextOffset: number | null; totalCount: number };
  totals: { totalUsers: number; trials: number; paid: number; revenueUsd: number; monthlyRevenueUsd: number; yearlyRevenueUsd: number; estimatedStoreFeesUsd: number; estimatedNetProceedsUsd: number };
  note?: string;
};
type SupportRequest = {
  id: string;
  userId: string;
  provider: string;
  accountEmail?: string | null;
  category: string;
  subject: string;
  message: string;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentData?: string | null;
  appVersion?: string | null;
  osVersion?: string | null;
  language: string;
  plan: string;
  status: 'new' | 'in_progress' | 'resolved';
  submittedAt: string;
};

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useVigil();
  const { getToken, isLoaded, isSignedIn, isAdmin, provider } = useIdentity();
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<'subscribers' | 'support'>('subscribers');
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { language } = useVigil();
  const copy = supportCopy(language);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in?redirect=/admin');
  }, [isLoaded, isSignedIn]);

  const load = useCallback(async (search = '', append = false, offset = 0) => {
    if (!isAdmin) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const response = await fetch(`https://${domain}/api/vigil/admin?search=${encodeURIComponent(search)}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const responseText = await response.text();
      const body = responseText ? JSON.parse(responseText) as Overview & { message?: string } : null;
      if (!body) throw new Error('The admin server returned an empty response.');
      if (!response.ok) {
        if (response.status === 401) throw new Error('Your admin session has expired. Sign out and sign in again, then reopen Admin.');
        if (response.status === 403) throw new Error('This account is no longer marked as an admin.');
        throw new Error(body.message || `Admin data unavailable (${response.status})`);
      }
      if (!body.totals || !Array.isArray(body.users)) throw new Error('The admin response was incomplete.');
      setOverview((current) => append && current ? { ...body, users: [...current.users, ...body.users] } : body);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Check the admin role and server connection, then try again.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [getToken, isAdmin]);

  useEffect(() => { if (isAdmin) void load(''); }, [isAdmin, load]);

  const loadSupportRequests = useCallback(async () => {
    if (!isAdmin) return;
    setSupportLoading(true);
    setSupportError(null);
    try {
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const response = await fetch(`https://${domain}/api/vigil/admin/support-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => null) as { requests?: SupportRequest[]; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || 'Support requests are unavailable.');
      if (!Array.isArray(body?.requests)) throw new Error('The support response was incomplete.');
      setSupportRequests(body.requests);
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Support requests are unavailable.');
    } finally {
      setSupportLoading(false);
    }
  }, [getToken, isAdmin]);

  useEffect(() => { if (section === 'support') void loadSupportRequests(); }, [loadSupportRequests, section]);

  const mutate = async (path: string, method: 'POST' | 'DELETE', payload?: Record<string, unknown>) => {
    try {
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const response = await fetch(`https://${domain}/api/vigil/admin/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      const responseText = await response.text();
      const responseBody = responseText ? JSON.parse(responseText) as { message?: string } : {};
      if (!response.ok) throw new Error(responseBody.message || 'Action failed');
      Alert.alert('Admin action', responseBody.message || 'Done');
      await load(query);
    } catch (error) {
      Alert.alert('Admin action failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    await mutate(`users/${pendingDelete.id}`, 'DELETE');
    setDeleting(false);
    setPendingDelete(null);
  };

  const updateSupportStatus = async (requestId: string, status: SupportRequest['status']) => {
    try {
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const response = await fetch(`https://${domain}/api/vigil/admin/support-requests/${encodeURIComponent(requestId)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || 'The status could not be updated.');
      setSupportRequests((current) => current.map((item) => item.id === requestId ? { ...item, status } : item));
    } catch (error) {
      Alert.alert('Admin action failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  if (!isLoaded) {
    return <View style={[styles.centered, { backgroundColor: palette.background, paddingTop: insets.top }]}><ActivityIndicator color={palette.primary} /><Text style={[styles.deniedCopy, { color: palette.mutedForeground }]}>Checking admin access…</Text></View>;
  }

  if (!isAdmin || provider !== 'clerk') {
    return <View style={[styles.centered, { backgroundColor: palette.background, paddingTop: insets.top }]}><Ionicons name="shield-outline" size={42} color={palette.primary} /><Text style={[styles.deniedTitle, { color: palette.foreground }]}>Admin access only</Text><Text style={[styles.deniedCopy, { color: palette.mutedForeground }]}>This area requires the admin role in your secure user profile.</Text><Pressable onPress={() => router.back()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>Back to Vigil Spend</Text></Pressable></View>;
  }

  return (
    <View style={[styles.page, { backgroundColor: palette.background, paddingTop: insets.top + 8 }]}>
       <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={22} color={palette.foreground} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: palette.primary }]}>VIGIL SPEND ADMIN</Text><Text style={[styles.title, { color: palette.foreground }]}>{section === 'support' ? supportText(language, 'adminSupportTitle') : supportText(language, 'adminSubscribers')}</Text></View><Pressable onPress={() => { if (section === 'support') void loadSupportRequests(); else void load(query); }} style={styles.iconButton}><Ionicons name="refresh" size={21} color={palette.foreground} /></Pressable></View>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }} showsVerticalScrollIndicator={false}>
         <View style={[styles.sectionToggle, { backgroundColor: palette.secondary }]}><Pressable onPress={() => setSection('subscribers')} style={[styles.sectionToggleButton, section === 'subscribers' && { backgroundColor: palette.primary }]}><Text style={[styles.sectionToggleText, { color: section === 'subscribers' ? palette.primaryForeground : palette.mutedForeground }]}>{supportText(language, 'adminSubscribers')}</Text></Pressable><Pressable onPress={() => setSection('support')} style={[styles.sectionToggleButton, section === 'support' && { backgroundColor: palette.primary }]}><Text style={[styles.sectionToggleText, { color: section === 'support' ? palette.primaryForeground : palette.mutedForeground }]}>{supportText(language, 'adminSupport')}</Text></Pressable></View>
         {section === 'support' ? <>
           {supportError && <View style={[styles.errorBanner, { backgroundColor: palette.warningSoft, borderColor: palette.warning }]}><Ionicons name="warning-outline" size={18} color={palette.warning} /><Text style={[styles.errorCopy, { color: palette.foreground }]}>{supportError}</Text></View>}
           {supportLoading && <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} />}
           {!supportLoading && supportRequests.length === 0 && <View style={styles.emptyState}><Ionicons name="mail-unread-outline" size={30} color={palette.mutedForeground} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{copy.adminNoRequests}</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{copy.adminNoRequestsCopy}</Text></View>}
           {supportRequests.map((item) => {
             const statusColor = item.status === 'resolved' ? palette.positive : item.status === 'in_progress' ? palette.warning : palette.primary;
             const statusLabel = item.status === 'in_progress' ? 'In Progress' : item.status === 'resolved' ? 'Resolved' : 'New';
             return <View key={item.id} style={[styles.supportCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
               <View style={styles.supportTop}><View style={{ flex: 1 }}><Text style={[styles.supportCategory, { color: palette.primary }]}>{copy.categories[item.category] || item.category}</Text><Text style={[styles.supportSubject, { color: palette.foreground }]}>{item.subject}</Text><Text style={[styles.supportMeta, { color: palette.mutedForeground }]}>{item.accountEmail || item.userId} · {new Date(item.submittedAt).toLocaleString()}</Text></View><View style={[styles.status, { backgroundColor: item.status === 'resolved' ? palette.positiveSoft : item.status === 'in_progress' ? palette.warningSoft : palette.accent }]}><Text style={[styles.statusText, { color: statusColor }]}>{statusLabel.toUpperCase()}</Text></View></View>
               <Text style={[styles.supportMessage, { color: palette.foreground }]}>{item.message}</Text>
               <Text style={[styles.supportContext, { color: palette.mutedForeground }]}>{item.plan.toUpperCase()} · {item.language.toUpperCase()} · {item.appVersion || '—'} · {item.osVersion || '—'}</Text>
               {item.attachmentData && item.attachmentMimeType && <View style={styles.supportAttachment}><Image source={{ uri: `data:${item.attachmentMimeType};base64,${item.attachmentData}` }} style={styles.supportAttachmentImage} /><Text style={[styles.supportAttachmentName, { color: palette.foreground }]}>{item.attachmentName || copy.adminAttachment}</Text></View>}
               <Text style={[styles.supportStatusLabel, { color: palette.mutedForeground }]}>{copy.adminStatus}</Text>
               <View style={styles.statusActions}>{(['new', 'in_progress', 'resolved'] as const).map((nextStatus) => <Pressable key={nextStatus} onPress={() => void updateSupportStatus(item.id, nextStatus)} style={[styles.statusAction, { borderColor: item.status === nextStatus ? palette.primary : palette.border, backgroundColor: item.status === nextStatus ? palette.accent : palette.background }]}><Text style={[styles.statusActionText, { color: item.status === nextStatus ? palette.primary : palette.mutedForeground }]}>{nextStatus === 'in_progress' ? 'In Progress' : nextStatus === 'resolved' ? 'Resolved' : 'New'}</Text></Pressable>)}</View>
             </View>;
           })}
         </> : <>
         {loadError && <View style={[styles.errorBanner, { backgroundColor: palette.warningSoft, borderColor: palette.warning }]}><Ionicons name="warning-outline" size={18} color={palette.warning} /><View style={{ flex: 1 }}><Text style={[styles.errorTitle, { color: palette.foreground }]}>Admin data could not be refreshed</Text><Text style={[styles.errorCopy, { color: palette.mutedForeground }]}>{loadError}</Text></View><Pressable onPress={() => void load(query)}><Text style={[styles.retryText, { color: palette.primary }]}>Retry</Text></Pressable></View>}
        <View style={styles.metrics}>
           <Metric label="Total users" value={String(overview?.totals.totalUsers ?? 0)} color={palette.foreground} />
           <Metric label="Free trials" value={String(overview?.totals.trials ?? 0)} color={palette.warning} />
          <Metric label="Paid" value={String(overview?.totals.paid ?? 0)} color={palette.positive} />
          <Metric label="Gross profit" value={`$${(overview?.totals.revenueUsd ?? 0).toFixed(2)}`} color={palette.primary} />
        </View>
        <View style={[styles.dataNote, { backgroundColor: palette.secondary, borderColor: palette.border }]}>
          <Text style={[styles.dataNoteTitle, { color: palette.foreground }]}>Where Vigil Spend data lives</Text>
           <Text style={[styles.dataNoteCopy, { color: palette.secondaryForeground }]}>Signups and verified account names come from Clerk. Subscription status and revenue summaries come from RevenueCat. Budget plans, transactions, and the inputs used by Analysis remain on each user’s device in local app storage; they are not visible here unless server-side sync is added. Pro overrides are support access only and take effect for the user after their next session refresh.</Text>
        </View>
        <View style={[styles.breakdown, { backgroundColor: palette.card, borderColor: palette.border }]}><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>MONTHLY</Text><Text style={[styles.breakdownValue, { color: palette.foreground }]}>${(overview?.totals.monthlyRevenueUsd ?? 0).toFixed(2)}</Text></View><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>YEARLY</Text><Text style={[styles.breakdownValue, { color: palette.foreground }]}>${(overview?.totals.yearlyRevenueUsd ?? 0).toFixed(2)}</Text></View><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>EST. FEES</Text><Text style={[styles.breakdownValue, { color: palette.warning }]}>${(overview?.totals.estimatedStoreFeesUsd ?? 0).toFixed(2)}</Text></View><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>EST. NET</Text><Text style={[styles.breakdownValue, { color: palette.positive }]}>${(overview?.totals.estimatedNetProceedsUsd ?? 0).toFixed(2)}</Text></View></View>
        <View style={styles.searchRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void load(query)} placeholder="Search user or email" placeholderTextColor={palette.mutedForeground} style={[styles.search, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} /><Pressable onPress={() => void load(query)} style={[styles.searchButton, { backgroundColor: palette.primary }]}><Ionicons name="search" size={19} color={palette.primaryForeground} /></Pressable></View>
        {loading && <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} />}
          {overview?.users.map((item) => {
            const displayName = item.name?.trim() || item.email?.trim() || 'Vigil Spend member';
            const revenue = Number.isFinite(item.revenueUsd) ? item.revenueUsd : 0;
            const status = item.proOverride ? 'override' : item.subscription;
            const statusColor = status === 'paid' ? palette.positive : status === 'trial' ? palette.warning : status === 'override' ? palette.primary : palette.mutedForeground;
            const statusBackground = status === 'paid' ? palette.positiveSoft : status === 'trial' ? palette.warningSoft : status === 'override' ? palette.accent : palette.secondary;
            const createdLabel = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null;
            const subscriptions = item.subscriptions ?? [];
            return <View key={`${item.provider}:${item.id}`} style={[styles.userCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.userTop}>
                <View style={[styles.avatar, { backgroundColor: palette.secondary }]}>
                  {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.avatarImage} /> : <Text style={[styles.avatarText, { color: palette.foreground }]}>{displayName.charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.userName, { color: palette.foreground }]}>{displayName}</Text>
                  <Text style={[styles.userEmail, { color: palette.mutedForeground }]}>{item.email || 'No email available'}</Text>
                  <Text style={[styles.userMeta, { color: palette.mutedForeground }]}>{item.provider === 'apple' ? 'Apple account' : 'Clerk account'} · {item.plan || 'Free plan'} · {item.subscriptionStatus || 'inactive'}{item.trialEndsAt ? ` · trial ends ${item.trialEndsAt.slice(0, 10)}` : ''}{createdLabel ? ` · joined ${createdLabel}` : ''}</Text>
                </View>
                <View style={[styles.status, { backgroundColor: statusBackground }]}><Text style={[styles.statusText, { color: statusColor }]}>{status.toUpperCase()}</Text></View>
              </View>
              {subscriptions.length > 0 && <View style={[styles.subscriptionList, { borderTopColor: palette.border }]}>
                <Text style={[styles.subscriptionListTitle, { color: palette.mutedForeground }]}>SUBSCRIPTIONS</Text>
                {subscriptions.map((subscription) => <Text key={subscription.id} style={[styles.subscriptionItem, { color: subscription.givesAccess ? palette.positive : palette.mutedForeground }]}>{subscription.productId} · {subscription.status}{subscription.endsAt ? ` · ends ${subscription.endsAt.slice(0, 10)}` : ''}{subscription.renews ? ' · renews' : ''}</Text>)}
              </View>}
              <View style={styles.userBottom}>
                <Text style={[styles.revenue, { color: palette.mutedForeground }]}>{item.proOverride ? 'Support access enabled' : `Revenue $${revenue.toFixed(2)}`}</Text>
                <View style={styles.actions}>
                  <View style={styles.overrideControl}><Text style={[styles.overrideLabel, { color: palette.mutedForeground }]}>Pro override</Text><Switch testID={`pro-override-${item.id}`} value={item.proOverride} onValueChange={(enabled) => void mutate(`users/${item.id}/pro-override`, 'POST', { enabled })} trackColor={{ false: palette.track, true: palette.primary }} thumbColor={palette.card} /></View>
                  {item.subscription !== 'free' && <Pressable onPress={() => void mutate(`users/${item.id}/cancel`, 'POST')} style={[styles.actionButton, { borderColor: palette.border }]}><Text style={[styles.actionText, { color: palette.foreground }]}>Subscription help</Text></Pressable>}
                  <Pressable onPress={() => setPendingDelete(item)} style={[styles.actionButton, { borderColor: palette.primary }]}><Text style={[styles.actionText, { color: palette.primary }]}>Delete</Text></Pressable>
                </View>
              </View>
            </View>;
          })}
          {overview?.page?.nextOffset !== null && overview?.page?.nextOffset !== undefined && <Pressable onPress={() => void load(query, true, overview.page?.nextOffset ?? 0)} disabled={loadingMore} style={[styles.loadMoreButton, { borderColor: palette.border, backgroundColor: palette.card }]}>{loadingMore ? <ActivityIndicator color={palette.primary} /> : <Text style={[styles.loadMoreText, { color: palette.primary }]}>Load more users</Text>}</Pressable>}
         {overview && overview.users.length === 0 && !loading && <View style={styles.emptyState}><Ionicons name="people-outline" size={30} color={palette.mutedForeground} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>No users found</Text><Text style={[styles.emptyCopy, { color: palette.mutedForeground }]}>{query ? 'Try a different search.' : 'Clerk has not returned any users for this account.'}</Text></View>}
        {overview?.note && <Text style={[styles.note, { color: palette.mutedForeground }]}>{overview.note}</Text>}
         </>}
      </ScrollView>
       <Modal visible={Boolean(pendingDelete)} transparent animationType="fade" onRequestClose={() => { if (!deleting) setPendingDelete(null); }}>
         <View style={styles.modalBackdrop}>
           <View style={[styles.confirmCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
             <Text style={[styles.confirmTitle, { color: palette.foreground }]}>Delete account?</Text>
             <Text style={[styles.confirmCopy, { color: palette.mutedForeground }]}>This permanently deletes {pendingDelete?.email || pendingDelete?.name || 'this account'} and its Vigil Spend support records. RevenueCat and Apple subscription history will not be changed.</Text>
             <View style={styles.confirmActions}>
               <Pressable disabled={deleting} onPress={() => setPendingDelete(null)} style={[styles.confirmButton, { borderColor: palette.border }]}><Text style={[styles.actionText, { color: palette.foreground }]}>Keep account</Text></Pressable>
               <Pressable disabled={deleting} onPress={() => void confirmDelete()} style={[styles.confirmButton, { backgroundColor: palette.primary, borderColor: palette.primary }]}>{deleting ? <ActivityIndicator color={palette.primaryForeground} /> : <Text style={[styles.actionText, { color: palette.primaryForeground }]}>Delete</Text>}</Pressable>
             </View>
           </View>
         </View>
       </Modal>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  const { palette } = useVigil();
  return <View style={[styles.metric, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={[styles.metricLabel, { color: palette.mutedForeground }]}>{label}</Text><Text style={[styles.metricValue, { color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 18 },
  centered: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.9 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 25, marginTop: 2 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dataNote: { borderWidth: 1, borderRadius: 17, padding: 13, marginTop: 10 },
  dataNoteTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  dataNoteCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 5 },
  metric: { flex: 1, borderWidth: 1, borderRadius: 17, padding: 12 },
  metricLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 7 },
  breakdown: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'space-around' },
  breakdownLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.5 },
  breakdownValue: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 5 },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  search: { flex: 1, minHeight: 49, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 13 },
  searchButton: { width: 49, height: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  userCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 10 },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 13 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  userName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  userEmail: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  userMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  status: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.5 },
  userBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  subscriptionList: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  subscriptionListTitle: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 },
  subscriptionItem: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 16, marginTop: 4 },
  revenue: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 7 },
  overrideControl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  overrideLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  actionButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 15, textAlign: 'center' },
  sectionToggle: { flexDirection: 'row', borderRadius: 15, padding: 4, marginTop: 6, marginBottom: 4 },
  sectionToggleButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  sectionToggleText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  supportCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 10 },
  supportTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  supportCategory: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  supportSubject: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 5 },
  supportMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 5 },
  supportMessage: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 13 },
  supportContext: { fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 0.4, marginTop: 12 },
  supportAttachment: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  supportAttachmentImage: { width: 58, height: 58, borderRadius: 10 },
  supportAttachmentName: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  supportStatusLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 13 },
  statusActions: { flexDirection: 'row', gap: 7, marginTop: 7 },
  statusAction: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  statusActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  errorBanner: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  errorTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  errorCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 11, paddingVertical: 3 },
  emptyState: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 10 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: 'center' },
  deniedTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 18 },
  deniedCopy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  primaryButton: { minHeight: 51, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, marginTop: 22 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  loadMoreButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  loadMoreText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.52)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  confirmCard: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 20, padding: 18 },
  confirmTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  confirmCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  confirmButton: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
});