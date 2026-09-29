import type { LogEntry } from '../utils/verdict';

export type JobType = 'counter' | 'steps';

export interface StartJobOptions {
  type: JobType;
  intervalMs?: number;
}

export interface JobStatus {
  active: boolean;
  jobId: string | null;
  type: JobType | null;
  startedAtMs: number | null;
  seq: number;
  counter: number;
  stepLabel: string | null;
  intervalMs: number;
  serviceAlive: boolean;
}

export interface HealthInfo {
  notificationPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  batteryOptimizationExempt: boolean | null;
  manufacturerNote: string;
  platform: string;
  canRunInBackground: boolean;
}

export interface BackgroundExecutionAdapter {
  startJob(options: StartJobOptions): Promise<JobStatus>;
  stopJob(): Promise<JobStatus>;
  getStatus(): Promise<JobStatus>;
  getLog(options?: { sinceSeq?: number }): Promise<LogEntry[]>;
  getHealth(): Promise<HealthInfo>;
  exportDiagnostics(): Promise<string>;
  addListener(
    eventName: 'jobUpdate' | 'logAppend',
    listener: (data: unknown) => void
  ): Promise<{ remove: () => void }>;
}
