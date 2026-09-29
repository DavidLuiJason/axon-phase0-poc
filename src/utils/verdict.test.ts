import { describe, it, expect } from 'vitest';
import { computeVerdict, type LogEntry } from './verdict';

const INTERVAL = 5000;

function beat(seq: number, wall: number, extra?: Partial<LogEntry>): LogEntry {
  return {
    jobId: 'j1',
    seq,
    wallClockMs: wall,
    elapsedRealtimeMs: wall,
    batteryPercent: 80,
    stepLabel: 'tick',
    eventType: 'BEAT',
    counter: seq,
    ...extra,
  };
}

describe('computeVerdict', () => {
  it('NEVER_STARTED on empty log', () => {
    const v = computeVerdict([], INTERVAL, Date.now(), false);
    expect(v.kind).toBe('NEVER_STARTED');
    expect(v.serviceAlive).toBe(false);
  });

  it('PROVEN_RUNNING with regular beats and live service', () => {
    const t0 = 1_000_000;
    const entries: LogEntry[] = [
      { ...beat(0, t0), eventType: 'STARTED', stepLabel: 'start' },
      beat(1, t0 + 5000),
      beat(2, t0 + 10000),
      beat(3, t0 + 15000),
    ];
    const v = computeVerdict(entries, INTERVAL, t0 + 16000, true);
    expect(v.kind).toBe('PROVEN_RUNNING');
    expect(v.gaps).toHaveLength(0);
    expect(v.serviceAlive).toBe(true);
  });

  it('GAPS_DETECTED when gap exceeds 3x interval', () => {
    const t0 = 1_000_000;
    const entries: LogEntry[] = [
      beat(1, t0),
      beat(2, t0 + 5000),
      beat(3, t0 + 5000 + 20_000), // 20s gap > 15s threshold
    ];
    const v = computeVerdict(entries, INTERVAL, t0 + 30_000, true);
    expect(v.kind).toBe('GAPS_DETECTED');
    expect(v.gaps.length).toBeGreaterThan(0);
    expect(v.longestGapMs).toBeGreaterThanOrEqual(20_000);
  });

  it('killed-service case: old beats, service not alive → STOPPED or GAPS', () => {
    const t0 = 1_000_000;
    const entries: LogEntry[] = [beat(1, t0), beat(2, t0 + 5000)];
    const v = computeVerdict(entries, INTERVAL, t0 + 60_000, false);
    expect(['STOPPED', 'GAPS_DETECTED']).toContain(v.kind);
    expect(v.serviceAlive).toBe(false);
  });

  it('restart case: RESTARTED event with gap is visible', () => {
    const t0 = 1_000_000;
    const entries: LogEntry[] = [
      beat(1, t0),
      beat(2, t0 + 5000),
      {
        jobId: 'j1',
        seq: 3,
        wallClockMs: t0 + 35_000,
        elapsedRealtimeMs: 35_000,
        batteryPercent: 70,
        stepLabel: 'resumed',
        eventType: 'RESTARTED',
        gapMs: 30_000,
      },
      beat(4, t0 + 40_000),
    ];
    const v = computeVerdict(entries, INTERVAL, t0 + 42_000, true);
    expect(v.restartedEvents).toBe(1);
    expect(v.longestGapMs).toBeGreaterThanOrEqual(30_000);
    expect(v.kind).toBe('GAPS_DETECTED');
  });

  it('timeout case', () => {
    const t0 = 1_000_000;
    const entries: LogEntry[] = [
      beat(1, t0),
      {
        jobId: 'j1',
        seq: 2,
        wallClockMs: t0 + 10_000,
        elapsedRealtimeMs: 10_000,
        batteryPercent: 60,
        stepLabel: 'timeout',
        eventType: 'TIMEOUT',
      },
    ];
    const v = computeVerdict(entries, INTERVAL, t0 + 20_000, false);
    expect(v.kind).toBe('TIMEOUT');
    expect(v.timeoutEvents).toBe(1);
  });

  it('STOPPED when explicit STOPPED event', () => {
    const t0 = 1_000_000;
    const entries: LogEntry[] = [
      beat(1, t0),
      {
        jobId: 'j1',
        seq: 2,
        wallClockMs: t0 + 5000,
        elapsedRealtimeMs: 5000,
        batteryPercent: 80,
        stepLabel: 'done',
        eventType: 'STOPPED',
      },
    ];
    const v = computeVerdict(entries, INTERVAL, t0 + 6000, false);
    expect(v.kind).toBe('STOPPED');
  });
});
