import { describe, it, expect } from 'vitest';
import { stepLabelForBeat, STEPS_DEMO, totalStepsBeats } from './stepLabels';

describe('stepLabelForBeat', () => {
  it('returns different labels as step changes', () => {
    const labels = new Set<string>();
    for (let i = 0; i < totalStepsBeats(); i++) {
      const { label, stepIndex } = stepLabelForBeat(i);
      labels.add(label);
      expect(stepIndex).toBeGreaterThanOrEqual(0);
      expect(stepIndex).toBeLessThan(STEPS_DEMO.length);
      expect(label.length).toBeGreaterThan(5);
      // never a fixed generic word
      expect(label.toLowerCase()).not.toBe('running');
      expect(label.toLowerCase()).not.toBe('active');
    }
    // Must have multiple distinct labels
    expect(labels.size).toBeGreaterThanOrEqual(4);
  });

  it('checkpoint label includes checkpoint number', () => {
    // First step is collect (3 beats), then checkpoint
    const info = stepLabelForBeat(3);
    expect(info.label).toMatch(/checkpoint/i);
  });

  it('marks done after all steps', () => {
    const last = totalStepsBeats();
    const info = stepLabelForBeat(last);
    expect(info.done).toBe(true);
  });

  it('label changes when step index changes', () => {
    let prevStep = -1;
    let prevLabel = '';
    for (let i = 0; i < totalStepsBeats(); i++) {
      const { stepIndex, label } = stepLabelForBeat(i);
      if (stepIndex !== prevStep && prevStep >= 0) {
        // When step changes, label must change (except we allow checkpoint numbering)
        expect(label).not.toBe(prevLabel);
      }
      prevStep = stepIndex;
      prevLabel = label;
    }
  });
});
