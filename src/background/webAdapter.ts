/**
 * Web fallback: NEVER pretends to run in background.
 * Foreground-only timer for UI development; clearly reports limitation.
 */
import type {
  BackgroundExecutionAdapter,
  HealthInfo,
  JobStatus,
  StartJobOptions,
} from './types';
import type { LogEntry } from '../utils/verdict';
import { stepLabelForBeat, totalStepsBeats } from '../utils/stepLabels';

type Listener = (data: unknown) => void;

export class WebBackgroundAdapter implements BackgroundExecutionAdapter {
  private active = false;
  private jobId: string | null = null;
  private type: StartJobOptions['type'] | null = null;
  private startedAtMs: number | null = null;
  private seq = 0;
  private counter = 0;
  private intervalMs = 5000;
  private stepLabel: string | null = null;
  private log: LogEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private batteryStart: number | null = null;

  async startJob(options: StartJobOptions): Promise<JobStatus> {
    await this.stopJob();
    this.active = true;
    this.jobId = `web-${Date.now()}`;
    this.type = options.type;
    this.intervalMs = options.intervalMs ?? 5000;
    this.startedAtMs = Date.now();
    this.seq = 0;
    this.counter = 0;
    this.stepLabel =
      options.type === 'steps'
        ? stepLabelForBeat(0).label
        : 'Foreground counter (web only — not background)';
    this.log = [];
    this.append('STARTED', this.stepLabel);

    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.emit('jobUpdate', await this.getStatus());
    return this.getStatus();
  }

  async stopJob(): Promise<JobStatus> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.active) {
      this.append('STOPPED', 'Stopped by user (web foreground only)');
      this.active = false;
    }
    this.emit('jobUpdate', await this.getStatus());
    return this.getStatus();
  }

  async getStatus(): Promise<JobStatus> {
    return {
      active: this.active,
      jobId: this.jobId,
      type: this.type,
      startedAtMs: this.startedAtMs,
      seq: this.seq,
      counter: this.counter,
      stepLabel: this.stepLabel,
      intervalMs: this.intervalMs,
      serviceAlive: this.active,
    };
  }

  async getLog(options?: { sinceSeq?: number }): Promise<LogEntry[]> {
    const since = options?.sinceSeq ?? 0;
    return this.log.filter((e) => e.seq >= since);
  }

  async getHealth(): Promise<HealthInfo> {
    return {
      notificationPermission: 'unknown',
      batteryOptimizationExempt: null,
      manufacturerNote:
        'Web platform: cannot run in background; foreground only. Native Android service required for real background evidence.',
      platform: 'web',
      canRunInBackground: false,
    };
  }

  async exportDiagnostics(): Promise<string> {
    const status = await this.getStatus();
    return JSON.stringify(
      {
        platform: 'web',
        warning: 'cannot run in background; foreground only',
        status,
        log: this.log,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  async addListener(
    eventName: 'jobUpdate' | 'logAppend',
    listener: Listener
  ): Promise<{ remove: () => void }> {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName)!.add(listener);
    return {
      remove: () => this.listeners.get(eventName)?.delete(listener),
    };
  }

  private tick() {
    if (!this.active) return;
    this.seq += 1;
    this.counter += 1;
    if (this.type === 'steps') {
      const info = stepLabelForBeat(this.seq - 1);
      this.stepLabel = info.label;
      this.append('BEAT', info.label);
      if (info.done || this.seq >= totalStepsBeats()) {
        this.append('STOPPED', 'Steps job finished');
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        this.active = false;
      }
    } else {
      this.stepLabel = `Foreground counter beat #${this.counter} (web — not background)`;
      this.append('BEAT', this.stepLabel);
    }
    this.emit('jobUpdate', {
      active: this.active,
      jobId: this.jobId,
      type: this.type,
      startedAtMs: this.startedAtMs,
      seq: this.seq,
      counter: this.counter,
      stepLabel: this.stepLabel,
      intervalMs: this.intervalMs,
      serviceAlive: this.active,
    });
  }

  private append(eventType: LogEntry['eventType'], stepLabel: string) {
    const entry: LogEntry = {
      jobId: this.jobId ?? 'none',
      seq: this.seq,
      wallClockMs: Date.now(),
      elapsedRealtimeMs: Date.now() - (this.startedAtMs ?? Date.now()),
      batteryPercent: this.batteryStart,
      stepLabel,
      eventType,
      counter: this.counter,
    };
    this.log.push(entry);
    this.emit('logAppend', entry);
  }

  private emit(eventName: string, data: unknown) {
    this.listeners.get(eventName)?.forEach((l) => {
      try {
        l(data);
      } catch {
        /* ignore */
      }
    });
  }
}
