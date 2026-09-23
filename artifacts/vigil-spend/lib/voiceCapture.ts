export const SPEECH_VOLUME_THRESHOLD = -0.5;
export const SILENCE_STOP_AFTER_MS = 2_200;

export type VoiceCapturePhase = 'idle' | 'listening' | 'processing' | 'error';

export type VoiceCaptureState = {
  phase: VoiceCapturePhase;
  transcript: string;
  heardSpeech: boolean;
  silenceStartedAt: number | null;
  error: string | null;
};

export function createVoiceCaptureState(): VoiceCaptureState {
  return {
    phase: 'idle',
    transcript: '',
    heardSpeech: false,
    silenceStartedAt: null,
    error: null,
  };
}

export function startVoiceCapture(): VoiceCaptureState {
  return {
    phase: 'listening',
    transcript: '',
    heardSpeech: false,
    silenceStartedAt: null,
    error: null,
  };
}

export function updateVoiceTranscript(state: VoiceCaptureState, transcript: string): VoiceCaptureState {
  if (state.phase !== 'listening') return state;
  return { ...state, transcript, heardSpeech: transcript.trim().length > 0 || state.heardSpeech };
}

export function updateVoiceVolume(
  state: VoiceCaptureState,
  value: number,
  nowMs: number,
): { state: VoiceCaptureState; shouldStop: boolean } {
  if (state.phase !== 'listening') return { state, shouldStop: false };
  if (value >= SPEECH_VOLUME_THRESHOLD) {
    return { state: { ...state, heardSpeech: true, silenceStartedAt: null }, shouldStop: false };
  }
  if (!state.heardSpeech) return { state, shouldStop: false };
  const silenceStartedAt = state.silenceStartedAt ?? nowMs;
  return {
    state: { ...state, silenceStartedAt },
    shouldStop: nowMs - silenceStartedAt >= SILENCE_STOP_AFTER_MS,
  };
}

export function beginVoiceProcessing(state: VoiceCaptureState): VoiceCaptureState {
  return state.phase === 'listening' || state.phase === 'idle'
    ? { ...state, phase: 'processing', silenceStartedAt: null }
    : state;
}

export function failVoiceCapture(state: VoiceCaptureState, error: string): VoiceCaptureState {
  return { ...state, phase: 'error', error, silenceStartedAt: null };
}

export function recoverVoiceCapture(): VoiceCaptureState {
  return createVoiceCaptureState();
}