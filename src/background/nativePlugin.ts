/**
 * Capacitor plugin definitions for BackgroundJobs.
 * Native Kotlin implementation is the source of truth on Android.
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { LogEntry } from '../utils/verdict';
import type { HealthInfo, JobStatus, StartJobOptions } from './types';

export interface BackgroundJobsPlugin {
  startJob(options: StartJobOptions): Promise<JobStatus>;
  stopJob(): Promise<JobStatus>;
  getStatus(): Promise<JobStatus>;
  getLog(options?: { sinceSeq?: number }): Promise<{ entries: LogEntry[] }>;
  getHealth(): Promise<HealthInfo>;
  exportDiagnostics(): Promise<{ json: string }>;
  addListener(
    eventName: 'jobUpdate' | 'logAppend',
    listenerFunc: (data: unknown) => void
  ): Promise<PluginListenerHandle>;
}

export const BackgroundJobs = registerPlugin<BackgroundJobsPlugin>('BackgroundJobs', {
  web: () => import('./webAdapter').then((m) => {
    // Bridge web adapter shape to plugin shape
    const adapter = new m.WebBackgroundAdapter();
    return {
      startJob: (o: StartJobOptions) => adapter.startJob(o),
      stopJob: () => adapter.stopJob(),
      getStatus: () => adapter.getStatus(),
      getLog: async (o?: { sinceSeq?: number }) => ({
        entries: await adapter.getLog(o),
      }),
      getHealth: () => adapter.getHealth(),
      exportDiagnostics: async () => ({
        json: await adapter.exportDiagnostics(),
      }),
      addListener: (eventName: 'jobUpdate' | 'logAppend', listener: (data: unknown) => void) =>
        adapter.addListener(eventName, listener),
    };
  }),
});
