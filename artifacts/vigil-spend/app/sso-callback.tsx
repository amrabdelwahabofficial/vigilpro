import * as WebBrowser from 'expo-web-browser';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

// Clerk's Expo SSO helper returns to this route on web. This hands the
// callback URL back to the window that started the OAuth flow and lets Clerk
// finish activating the session there.
WebBrowser.maybeCompleteAuthSession();

export default function SsoCallbackScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ef3340" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f7f8',
  },
});