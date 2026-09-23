import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useVigil } from '@/context/AppContext';
import { useIdentity } from '@/context/IdentityContext';
import { clearDiagnostics, formatDiagnostic, readDiagnostics, type DiagnosticEvent } from '@/lib/authDiagnostics';

export default function DiagnosticsScreen() {
  const { palette } = useVigil();
  const { isLoaded, isAdmin } = useIdentity();
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setEvents(await readDiagnostics());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isLoaded && isAdmin) void load();
  }, [isAdmin, isLoaded, load]);

  if (isLoaded && !isAdmin) {
    router.replace('/(tabs)/settings');
    return null;
  }

  const copy = async () => {
    await Clipboard.setStringAsync(events.map(formatDiagnostic).join('\n'));
    Alert.alert('Diagnostics', 'Redacted diagnostics copied.');
  };

  const clear = () => Alert.alert('Clear diagnostics?', 'This removes the local diagnostic history from this device.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => { await clearDiagnostics(); setEvents([]); } },
  ]);

  return (
    <View style={[styles.page, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>Back</Text></Pressable>
        <Text style={[styles.title, { color: palette.foreground }]}>Diagnostics</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => void load()}><Text style={[styles.action, { color: palette.primary }]}>Refresh</Text></Pressable>
          <Pressable onPress={() => void copy()} disabled={!events.length}><Text style={[styles.action, { color: events.length ? palette.primary : palette.mutedForeground }]}>Copy</Text></Pressable>
        </View>
      </View>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Local, redacted sign-in and RevenueCat events. No passwords, tokens, API keys, or account emails are stored.</Text>
      {loading ? <ActivityIndicator color={palette.primary} style={styles.loader} /> : events.length === 0 ? <Text style={[styles.empty, { color: palette.mutedForeground }]}>No diagnostic events yet. Reproduce the sign-in or subscription issue, then return here.</Text> : (
        <ScrollView contentContainerStyle={styles.list}>
          {events.map((event) => <View key={event.id} style={[styles.event, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Text style={[styles.eventText, { color: palette.foreground }]}>{formatDiagnostic(event)}</Text>
          </View>)}
          <Pressable onPress={clear} style={[styles.clearButton, { borderColor: palette.destructive }]}><Text style={[styles.clearText, { color: palette.destructive }]}>Clear local diagnostics</Text></Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: { paddingVertical: 8 },
  backText: { fontSize: 14, fontWeight: '600' },
  title: { flex: 1, fontSize: 23, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { fontSize: 13, fontWeight: '600' },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  loader: { marginTop: 36 },
  empty: { fontSize: 13, lineHeight: 20, marginTop: 28 },
  list: { paddingTop: 16, paddingBottom: 30, gap: 9 },
  event: { borderWidth: 1, borderRadius: 13, padding: 12 },
  eventText: { fontSize: 11, lineHeight: 17 },
  clearButton: { borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 },
  clearText: { fontSize: 12, fontWeight: '600' },
});