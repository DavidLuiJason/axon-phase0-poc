/**
 * Verdict computation from persisted heartbeat log.
 * Native service is source of truth; this only analyses log entries.
 */

export type LogEventType =
  | 'BEAT'
  | 'RESTARTED'
  | 'TIMEOUT'
  | 'STARTED'
  | 'STOPPED'
  | 'STEP';

export interface LogEntry {
  jobId: string;
  seq: number;
  wallClockMs: number;
  elapsedRealtimeMs: number;
  batteryPercent: number | null;
  stepLabel: string;
  eventType: LogEventType;
  counter?: number;
  gapMs?: number;
}

export type VerdictKind =
  | 'PROVEN_RUNNING'
  | 'GAPS_DETECTED'
  | 'STOPPED'
  | 'NEVER_STARTED'
  | 'TIMEOUT';

export interface VerdictResult {
  kind: VerdictKind;
  label: string;
  gaps: Array<{ fromSeq: number; toSeq: number; gapMs: number }>;
  beatsReceived: number;
  beatsExpected: number;
  missedBeats: number;
  longestGapMs: number;
  lastHeartbeatAgeMs: number | null;
  restartedEvents: number;
  timeoutEvents: number;
  serviceAlive: boolean;
}

const GAP_THRESHOLD_MULTIPLIER = 3;

export function computeVerdict(
  entries: LogEntry[],
  intervalMs: number,
  nowWallMs: number,
  serviceAlive: boolean
): VerdictResult {
  if (!entries || entries.length === 0) {
    return {
      kind: 'NEVER_STARTED',
      label: 'NEVER STARTED',
      gaps: [],
      beatsReceived: 0,
      beatsExpected: 0,
      missedBeats: 0,
      longestGapMs: 0,
      lastHeartbeatAgeMs: null,
      restartedEvents: 0,
      timeoutEvents: 0,
      serviceAlive: false,
    };
  }

  const beats = entries.filter((e) => e.eventType === 'BEAT');
  const restartedEvents = entries.filter((e) => e.eventType === 'RESTARTED').length;
  const timeoutEvents = entries.filter((e) => e.eventType === 'TIMEOUT').length;
  const stopped = entries.some((e) => e.eventType === 'STOPPED');

  const sorted = [...beats].sort((a, b) => a.seq - b.seq);
  const gaps: Array<{ fromSeq: number; toSeq: number; gapMs: number }> = [];
  let longestGapMs = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = cur.wallClockMs - prev.wallClockMs;
    if (gap > intervalMs * GAP_THRESHOLD_MULTIPLIER) {
      gaps.push({ fromSeq: prev.seq, toSeq: cur.seq, gapMs: gap });
    }
    if (gap > longestGapMs) longestGapMs = gap;
  }

  // Also consider RESTARTED entries that record explicit gaps
  for (const e of entries) {
    if (e.eventType === 'RESTARTED' && typeof e.gapMs === 'number' && e.gapMs > longestGapMs) {
      longestGapMs = e.gapMs;
      if (e.gapMs > intervalMs * GAP_THRESHOLD_MULTIPLIER) {
        gaps.push({ fromSeq: e.seq - 1, toSeq: e.seq, gapMs: e.gapMs });
      }
    }
  }

  const lastBeat = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const lastHeartbeatAgeMs = lastBeat ? Math.max(0, nowWallMs - lastBeat.wallClockMs) : null;

  let startedAt = entries.find((e) => e.eventType === 'STARTED')?.wallClockMs;
  if (startedAt == null && sorted.length > 0) {
    startedAt = sorted[0].wallClockMs;
  }
  const elapsedMs = startedAt != null ? Math.max(0, nowWallMs - startedAt) : 0;
  const beatsExpected = intervalMs > 0 ? Math.floor(elapsedMs / intervalMs) + 1 : 0;
  const beatsReceived = sorted.length;
  const missedBeats = Math.max(0, beatsExpected - beatsReceived);

  if (timeoutEvents > 0 && !serviceAlive) {
    return {
      kind: 'TIMEOUT',
      label: 'TIMEOUT',
      gaps,
      beatsReceived,
      beatsExpected,
      missedBeats,
      longestGapMs,
      lastHeartbeatAgeMs,
      restartedEvents,
      timeoutEvents,
      serviceAlive,
    };
  }

  if (stopped || (!serviceAlive && lastHeartbeatAgeMs != null && lastHeartbeatAgeMs > intervalMs * GAP_THRESHOLD_MULTIPLIER)) {
    return {
      kind: 'STOPPED',
      label: 'STOPPED',
      gaps,
      beatsReceived,
      beatsExpected,
      missedBeats,
      longestGapMs,
      lastHeartbeatAgeMs,
      restartedEvents,
      timeoutEvents,
      serviceAlive,
    };
  }

  if (gaps.length > 0) {
    return {
      kind: 'GAPS_DETECTED',
      label: 'GAPS DETECTED',
      gaps,
      beatsReceived,
      beatsExpected,
      missedBeats,
      longestGapMs,
      lastHeartbeatAgeMs,
      restartedEvents,
      timeoutEvents,
      serviceAlive,
    };
  }

  // Proven only if service is alive AND no large gaps
  if (serviceAlive && (lastHeartbeatAgeMs == null || lastHeartbeatAgeMs <= intervalMs * GAP_THRESHOLD_MULTIPLIER)) {
    return {
      kind: 'PROVEN_RUNNING',
      label: 'PROVEN RUNNING',
      gaps,
      beatsReceived,
      beatsExpected,
      missedBeats,
      longestGapMs,
      lastHeartbeatAgeMs,
      restartedEvents,
      timeoutEvents,
      serviceAlive,
    };
  }

  return {
    kind: 'GAPS_DETECTED',
    label: 'GAPS DETECTED',
    gaps,
    beatsReceived,
    beatsExpected,
    missedBeats,
    longestGapMs,
    lastHeartbeatAgeMs,
    restartedEvents,
    timeoutEvents,
    serviceAlive,
  };
}
