import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function CaptureShortcutRoute() {
  const { amount, note, bucket } = useLocalSearchParams<{
    amount?: string;
    note?: string;
    bucket?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/',
        params: {
          capture: '1',
          ...(amount ? { amount } : {}),
          ...(note ? { note } : {}),
          ...(bucket ? { bucket } : {}),
        },
      }}
    />
  );
}