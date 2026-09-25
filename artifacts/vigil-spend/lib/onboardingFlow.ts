export const ONBOARDING_QUESTION_COUNT = 6;

type OnboardingQuestion = {
  titleKey: string;
  supportKey?: string;
  choicesKey: string;
  answerIds: string[];
};

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    titleKey: 'onboardingFlowQ1Title',
    supportKey: 'onboardingFlowQ1Support',
    choicesKey: 'onboardingFlowQ1Choices',
    answerIds: ['stop-guessing', 'spend-less', 'save-consistently', 'control', 'habits'],
  },
  {
    titleKey: 'onboardingFlowQ2Title',
    choicesKey: 'onboardingFlowQ2Choices',
    answerIds: ['money-fast', 'overspend', 'tracking-effort', 'budget', 'save-more'],
  },
  {
    titleKey: 'onboardingFlowQ3Title',
    supportKey: 'onboardingFlowQ3Support',
    choicesKey: 'onboardingFlowQ3Choices',
    answerIds: ['stressed', 'frustrated', 'guilty', 'out-of-control', 'avoid'],
  },
  {
    titleKey: 'onboardingFlowQ4Title',
    choicesKey: 'onboardingFlowQ4Choices',
    answerIds: ['daily', 'few-times-week', 'occasionally', 'tight-month', 'almost-never'],
  },
  {
    titleKey: 'onboardingFlowQ5Title',
    choicesKey: 'onboardingFlowQ5Choices',
    answerIds: ['time', 'forget', 'manual-entry', 'complexity', 'consistency'],
  },
  {
    titleKey: 'onboardingFlowQ6Title',
    choicesKey: 'onboardingFlowQ6Choices',
    answerIds: ['peace', 'savings', 'control', 'confidence', 'goals'],
  },
] as const;

export type OnboardingFeatureId =
  | 'voice'
  | 'receipt'
  | 'bank-screenshot'
  | 'insights'
  | 'planning'
  | 'reminders'
  | 'currency';

export const ONBOARDING_RESULT_FEATURES: {
  id: OnboardingFeatureId;
  labelKey: string;
  icon: string;
}[] = [
  { id: 'voice', labelKey: 'onboardingFlowFeatureVoice', icon: 'mic-outline' },
  { id: 'receipt', labelKey: 'onboardingFlowFeatureReceipt', icon: 'receipt-outline' },
  { id: 'bank-screenshot', labelKey: 'onboardingFlowFeatureBank', icon: 'image-outline' },
  { id: 'insights', labelKey: 'onboardingFlowFeatureInsights', icon: 'analytics-outline' },
  { id: 'planning', labelKey: 'onboardingFlowFeaturePlanning', icon: 'wallet-outline' },
  { id: 'reminders', labelKey: 'onboardingFlowFeatureReminders', icon: 'notifications-outline' },
  { id: 'currency', labelKey: 'onboardingFlowFeatureCurrency', icon: 'swap-horizontal-outline' },
];

const featurePriorityByFriction: Record<string, OnboardingFeatureId[]> = {
  time: ['voice', 'receipt', 'bank-screenshot'],
  'manual-entry': ['voice', 'receipt', 'bank-screenshot'],
  forget: ['reminders', 'voice', 'receipt'],
  complexity: ['planning', 'insights', 'voice'],
  consistency: ['reminders', 'voice', 'insights'],
};

export function getValidOnboardingAnswers(answers: readonly string[]): string[] {
  const valid: string[] = [];
  for (let index = 0; index < ONBOARDING_QUESTION_COUNT && index < answers.length; index += 1) {
    if (!(ONBOARDING_QUESTIONS[index].answerIds as readonly string[]).includes(answers[index])) break;
    valid.push(answers[index]);
  }
  return valid;
}

export function getOnboardingChoiceLabel(
  translate: (key: string) => string,
  questionIndex: number,
  answerId?: string,
): string {
  if (!answerId || !ONBOARDING_QUESTIONS[questionIndex]) return '';
  const choiceIndex = (ONBOARDING_QUESTIONS[questionIndex].answerIds as readonly string[]).indexOf(answerId);
  if (choiceIndex < 0) return '';
  return translate(ONBOARDING_QUESTIONS[questionIndex].choicesKey).split('|')[choiceIndex] ?? '';
}

export function getOrderedOnboardingFeatures(frictionId?: string): typeof ONBOARDING_RESULT_FEATURES {
  const priority = featurePriorityByFriction[frictionId ?? ''] ?? [];
  const orderedIds = [...priority, ...ONBOARDING_RESULT_FEATURES.map((feature) => feature.id)];
  const seen = new Set<OnboardingFeatureId>();
  return orderedIds
    .map((id) => ONBOARDING_RESULT_FEATURES.find((feature) => feature.id === id)!)
    .filter((feature) => {
      if (seen.has(feature.id)) return false;
      seen.add(feature.id);
      return true;
    });
}

export function formatOnboardingTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) => values[key] ?? '');
}