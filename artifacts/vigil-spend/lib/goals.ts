import type { Goal } from '@/context/AppContext';

export function canAddActiveGoal(goals: Goal[], isPro: boolean) {
  return isPro || goals.length < 1;
}