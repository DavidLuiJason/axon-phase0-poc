/**
 * Steps job: genuinely different activity labels tied to real steps.
 * Labels must change when the step index changes (unit-tested).
 */

export const STEPS_DEMO: ReadonlyArray<{ id: string; label: string; durationBeats: number }> = [
  { id: 'collect', label: 'Collecting heartbeat samples', durationBeats: 3 },
  { id: 'checkpoint', label: 'Writing checkpoint', durationBeats: 2 },
  { id: 'verify', label: 'Verifying log integrity', durationBeats: 3 },
  { id: 'wait', label: 'Waiting for next cycle', durationBeats: 2 },
  { id: 'finalize', label: 'Finalizing job and releasing wake lock', durationBeats: 1 },
];

export function stepLabelForBeat(beatIndex: number): { stepIndex: number; label: string; done: boolean } {
  let remaining = beatIndex;
  for (let i = 0; i < STEPS_DEMO.length; i++) {
    const step = STEPS_DEMO[i];
    if (remaining < step.durationBeats) {
      const label =
        step.id === 'checkpoint'
          ? `Writing checkpoint ${beatIndex + 1}`
          : step.label;
      return { stepIndex: i, label, done: false };
    }
    remaining -= step.durationBeats;
  }
  return {
    stepIndex: STEPS_DEMO.length - 1,
    label: STEPS_DEMO[STEPS_DEMO.length - 1].label,
    done: true,
  };
}

export function totalStepsBeats(): number {
  return STEPS_DEMO.reduce((sum, s) => sum + s.durationBeats, 0);
}
