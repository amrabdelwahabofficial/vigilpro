import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  beginVoiceProcessing,
  createVoiceCaptureState,
  failVoiceCapture,
  recoverVoiceCapture,
  SILENCE_STOP_AFTER_MS,
  startVoiceCapture,
  updateVoiceTranscript,
  updateVoiceVolume,
} from '../lib/voiceCapture.ts';

const appSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
const appConfig = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8'));

test('start listening creates a clean listening state', () => {
  const state = startVoiceCapture();
  assert.equal(state.phase, 'listening');
  assert.equal(state.transcript, '');
  assert.equal(state.heardSpeech, false);
  assert.equal(state.error, null);
});

test('live transcript updates stay visible while listening', () => {
  const state = updateVoiceTranscript(startVoiceCapture(), '30 on taxi');
  assert.equal(state.phase, 'listening');
  assert.equal(state.transcript, '30 on taxi');
  assert.equal(state.heardSpeech, true);
});

test('a short pause does not prematurely stop capture', () => {
  let state = startVoiceCapture();
  state = updateVoiceTranscript(state, '30 on taxi');
  const firstPause = updateVoiceVolume(state, -1.5, 1_000);
  const shortPause = updateVoiceVolume(firstPause.state, -1.5, 1_000 + SILENCE_STOP_AFTER_MS - 1);
  assert.equal(shortPause.shouldStop, false);
  assert.equal(shortPause.state.phase, 'listening');
});

test('sustained silence after speech requests automatic stop', () => {
  let state = startVoiceCapture();
  state = updateVoiceTranscript(state, '30 on taxi');
  const silence = updateVoiceVolume(state, -1.5, 2_000);
  const sustained = updateVoiceVolume(silence.state, -1.5, 2_000 + SILENCE_STOP_AFTER_MS);
  assert.equal(sustained.shouldStop, true);
  assert.equal(sustained.state.silenceStartedAt, 2_000);
});

test('manual Stop enters processing without saving anything', () => {
  const listening = startVoiceCapture();
  const processing = beginVoiceProcessing(listening);
  assert.equal(processing.phase, 'processing');
  assert.match(appSource, /ExpoSpeechRecognitionModule\.stop\(\)/);
  assert.match(appSource, /setReviewTransactions/);
  assert.match(appSource, /reviewBeforeSaving/);
});

test('processing failure is explicit and recovery permits another recording', () => {
  const failed = failVoiceCapture(beginVoiceProcessing(startVoiceCapture()), 'Speech service unavailable');
  assert.equal(failed.phase, 'error');
  assert.equal(failed.error, 'Speech service unavailable');
  assert.equal(recoverVoiceCapture().phase, 'idle');
  assert.equal(startVoiceCapture().phase, 'listening');
});

test('native speech configuration preserves multilingual capture and required permissions', () => {
  const plugins = appConfig.expo.plugins;
  const speechPlugin = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-speech-recognition');
  assert.ok(speechPlugin);
  assert.match(speechPlugin[1].speechRecognitionPermission, /speech recognition/);
  assert.match(appConfig.expo.ios.infoPlist.NSSpeechRecognitionUsageDescription, /speech recognition/);
  assert.match(appSource, /speechLocaleByLanguage/);
  assert.match(appSource, /interimResults: true/);
  assert.match(appSource, /continuous: true/);
  assert.match(appSource, /volumeChangeEventOptions/);
});

test('repeated recording resets the transcript and session state', () => {
  const first = updateVoiceTranscript(startVoiceCapture(), 'first note');
  assert.equal(first.transcript, 'first note');
  const second = startVoiceCapture();
  assert.equal(second.transcript, '');
  assert.equal(second.heardSpeech, false);
});