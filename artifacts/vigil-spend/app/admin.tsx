import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVigil } from '@/context/AppContext';
import { useIdentity } from '@/context/IdentityContext';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  subscription: 'trial' | 'paid' | 'free';
  revenueUsd: number;
  renews: boolean;
  proOverride: boolean;
};
type Overview = {
  users: AdminUser[];
  totals: { trials: number; paid: number; revenueUsd: number; monthlyRevenueUsd: number; yearlyRevenueUsd: number; estimatedStoreFeesUsd: number; estimatedNetProceedsUsd: number };
  note?: string;
};

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useVigil();
  const { getToken, isLoaded, isSignedIn, isAdmin, provider } = useIdentity();
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in?redirect=/admin');
  }, [isLoaded, isSignedIn]);

  const load = useCallback(async (search = '') => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) throw new Error('Your secure session is not ready yet.');
      const response = await fetch(`https://${domain}/api/vigil/admin?search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const responseText = await response.text();
      const body = responseText ? JSON.parse(responseText) as Overview & { message?: string } : null;
      if (!body) throw new Error('The admin server returned an empty response.');
      if (!response.ok) throw new Error(body.message || 'Admin data unavailable');
      if (!body.totals || !Array.isArray(body.users)) throw new Error('The admin response was incomplete.');
      setOverview(body);
    } catch (error) {
      Alert.alert('Could not load admin data', error instanceof Error ? error.message : 'Check the admin role and server connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken, isAdmin]);

  useEffect(() => { if (isAdmin) void load(''); }, [isAdmin, load]);

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

  if (!isLoaded) {
    return <View style={[styles.centered, { backgroundColor: palette.background, paddingTop: insets.top }]}><ActivityIndicator color={palette.primary} /><Text style={[styles.deniedCopy, { color: palette.mutedForeground }]}>Checking admin access…</Text></View>;
  }

  if (!isAdmin || provider !== 'clerk') {
    return <View style={[styles.centered, { backgroundColor: palette.background, paddingTop: insets.top }]}><Ionicons name="shield-outline" size={42} color={palette.primary} /><Text style={[styles.deniedTitle, { color: palette.foreground }]}>Admin access only</Text><Text style={[styles.deniedCopy, { color: palette.mutedForeground }]}>This area requires the admin role in your secure user profile.</Text><Pressable onPress={() => router.back()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>Back to Vigil</Text></Pressable></View>;
  }

  return (
    <View style={[styles.page, { backgroundColor: palette.background, paddingTop: insets.top + 8 }]}>
       <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={22} color={palette.foreground} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: palette.primary }]}>VIGIL ADMIN</Text><Text style={[styles.title, { color: palette.foreground }]}>Subscribers</Text></View><Pressable onPress={() => void load(query)} style={styles.iconButton}><Ionicons name="refresh" size={21} color={palette.foreground} /></Pressable></View>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }} showsVerticalScrollIndicator={false}>
        <View style={styles.metrics}>
          <Metric label="Free trials" value={String(overview?.totals.trials ?? 0)} color={palette.warning} />
          <Metric label="Paid" value={String(overview?.totals.paid ?? 0)} color={palette.positive} />
          <Metric label="Gross profit" value={`$${(overview?.totals.revenueUsd ?? 0).toFixed(2)}`} color={palette.primary} />
        </View>
        <View style={[styles.dataNote, { backgroundColor: palette.secondary, borderColor: palette.border }]}>
          <Text style={[styles.dataNoteTitle, { color: palette.foreground }]}>Where Vigil data lives</Text>
           <Text style={[styles.dataNoteCopy, { color: palette.secondaryForeground }]}>Signups and verified account names come from Clerk. Subscription status and revenue summaries come from RevenueCat. Budget plans, transactions, and the inputs used by Analysis remain on each user’s device in local app storage; they are not visible here unless server-side sync is added. Pro overrides are support access only and take effect for the user after their next session refresh.</Text>
        </View>
        <View style={[styles.breakdown, { backgroundColor: palette.card, borderColor: palette.border }]}><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>MONTHLY</Text><Text style={[styles.breakdownValue, { color: palette.foreground }]}>${(overview?.totals.monthlyRevenueUsd ?? 0).toFixed(2)}</Text></View><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>YEARLY</Text><Text style={[styles.breakdownValue, { color: palette.foreground }]}>${(overview?.totals.yearlyRevenueUsd ?? 0).toFixed(2)}</Text></View><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>EST. FEES</Text><Text style={[styles.breakdownValue, { color: palette.warning }]}>${(overview?.totals.estimatedStoreFeesUsd ?? 0).toFixed(2)}</Text></View><View><Text style={[styles.breakdownLabel, { color: palette.mutedForeground }]}>EST. NET</Text><Text style={[styles.breakdownValue, { color: palette.positive }]}>${(overview?.totals.estimatedNetProceedsUsd ?? 0).toFixed(2)}</Text></View></View>
        <View style={styles.searchRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void load(query)} placeholder="Search user or email" placeholderTextColor={palette.mutedForeground} style={[styles.search, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]} /><Pressable onPress={() => void load(query)} style={[styles.searchButton, { backgroundColor: palette.primary }]}><Ionicons name="search" size={19} color={palette.primaryForeground} /></Pressable></View>
        {loading && <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} />}
        {overview?.users.map((item) => { const displayName = item.name?.trim() || item.email?.trim() || 'Vigil member'; const revenue = Number.isFinite(item.revenueUsd) ? item.revenueUsd : 0; const status = item.proOverride ? 'override' : item.subscription; const statusColor = status === 'paid' ? palette.positive : status === 'trial' ? palette.warning : status === 'override' ? palette.primary : palette.mutedForeground; const statusBackground = status === 'paid' ? palette.positiveSoft : status === 'trial' ? palette.warningSoft : status === 'override' ? palette.accent : palette.secondary; return <View key={item.id} style={[styles.userCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={styles.userTop}><View style={[styles.avatar, { backgroundColor: palette.secondary }]}><Text style={[styles.avatarText, { color: palette.foreground }]}>{displayName.charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={[styles.userName, { color: palette.foreground }]}>{displayName}</Text><Text style={[styles.userEmail, { color: palette.mutedForeground }]}>{item.email || 'No email available'}</Text></View><View style={[styles.status, { backgroundColor: statusBackground }]}><Text style={[styles.statusText, { color: statusColor }]}>{status.toUpperCase()}</Text></View></View><View style={styles.userBottom}><Text style={[styles.revenue, { color: palette.mutedForeground }]}>{item.proOverride ? 'Support access enabled' : `Revenue $${revenue.toFixed(2)}`}</Text><View style={styles.actions}><View style={styles.overrideControl}><Text style={[styles.overrideLabel, { color: palette.mutedForeground }]}>Pro override</Text><Switch testID={`pro-override-${item.id}`} value={item.proOverride} onValueChange={(enabled) => void mutate(`users/${item.id}/pro-override`, 'POST', { enabled })} trackColor={{ false: palette.track, true: palette.primary }} thumbColor={palette.card} /></View>{item.subscription !== 'free' && <Pressable onPress={() => void mutate(`users/${item.id}/cancel`, 'POST')} style={[styles.actionButton, { borderColor: palette.border }]}><Text style={[styles.actionText, { color: palette.foreground }]}>Cancel help</Text></Pressable>}<Pressable onPress={() => Alert.alert('Delete user?', 'This permanently deletes the user account and cannot be undone.', [{ text: 'Keep user', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void mutate(`users/${item.id}`, 'DELETE') }])} style={[styles.actionButton, { borderColor: palette.primary }]}><Text style={[styles.actionText, { color: palette.primary }]}>Delete</Text></Pressable></View></View></View>; })}
        {overview?.note && <Text style={[styles.note, { color: palette.mutedForeground }]}>{overview.note}</Text>}
      </ScrollView>
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
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  userName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  userEmail: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  status: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.5 },
  userBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  revenue: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 7 },
  overrideControl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  overrideLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  actionButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 15, textAlign: 'center' },
  deniedTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 18 },
  deniedCopy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  primaryButton: { minHeight: 51, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, marginTop: 22 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});