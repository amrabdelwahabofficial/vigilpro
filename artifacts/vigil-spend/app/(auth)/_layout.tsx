import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerTransparent: true,
        headerTitle: '',
      }}
    >
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}