/**
 * BackgroundExecutionAdapter — interface AXON's future Task Engine can plug into.
 * Selects native plugin on Android, honest web fallback elsewhere.
 */
import { Capacitor } from '@capacitor/core';
import type { BackgroundExecutionAdapter, HealthInfo, JobStatus, StartJobOptions } from './types';
import type { LogEntry } from '../utils/verdict';
import { BackgroundJobs } from './nativePlugin';
import { WebBackgroundAdapter } from './webAdapter';

class NativeAdapter implements BackgroundExecutionAdapter {
  async startJob(options: StartJobOptions): Promise<JobStatus> {
    return BackgroundJobs.startJob(options);
  }
  async stopJob(): Promise<JobStatus> {
    return BackgroundJobs.stopJob();
  }
  async getStatus(): Promise<JobStatus> {
    return BackgroundJobs.getStatus();
  }
  async getLog(options?: { sinceSeq?: number }): Promise<LogEntry[]> {
    const res = await BackgroundJobs.getLog(options);
    return res.entries ?? [];
  }
  async getHealth(): Promise<HealthInfo> {
    return BackgroundJobs.getHealth();
  }
  async exportDiagnostics(): Promise<string> {
    const res = await BackgroundJobs.exportDiagnostics();
    return res.json;
  }
  async addListener(
    eventName: 'jobUpdate' | 'logAppend',
    listener: (data: unknown) => void
  ): Promise<{ remove: () => void }> {
    const handle = await BackgroundJobs.addListener(eventName, listener);
    return { remove: () => handle.remove() };
  }
}

let instance: BackgroundExecutionAdapter | null = null;

export function getBackgroundAdapter(): BackgroundExecutionAdapter {
  if (instance) return instance;
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    instance = new NativeAdapter();
  } else {
    instance = new WebBackgroundAdapter();
  }
  return instance;
}

export type { BackgroundExecutionAdapter, JobStatus, HealthInfo, StartJobOptions };
