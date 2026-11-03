import type { Action, AppState } from '../store';

/** The action that puts things back the way they were before `a` ran. Null when there is nothing safe to undo. */
export function inverse(a: Action, s: AppState): Action | null {
  switch (a.type) {
    case 'upsertNote': {
      const prev = (s.notes ?? []).find((n) => n.id === a.note.id);
      return prev ? { type: 'upsertNote', note: prev } : { type: 'deleteNote', id: a.note.id };
    }
    case 'deleteNote': {
      const prev = (s.notes ?? []).find((n) => n.id === a.id);
      return prev ? { type: 'upsertNote', note: prev } : null;
    }
    case 'profile': {
      const was = Object.fromEntries(Object.keys(a.patch).map((k) => [k, (s.profile as unknown as Record<string, unknown>)[k]]));
      return { type: 'profile', patch: was };
    }
    case 'override':
      return { type: 'override', key: a.key, value: a.key in s.overrides ? s.overrides[a.key] : null };
    case 'upsertGoal': {
      const prev = s.goals.find((g) => g.id === a.goal.id);
      return prev ? { type: 'upsertGoal', goal: prev } : { type: 'deleteGoal', id: a.goal.id };
    }
    case 'deleteGoal': {
      const prev = s.goals.find((g) => g.id === a.id);
      return prev ? { type: 'upsertGoal', goal: prev } : null;
    }
    default:
      return null;
  }
}
