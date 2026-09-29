import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBackgroundAdapter } from './background/adapter';
import type { HealthInfo, JobStatus } from './background/types';
import type { LogEntry } from './utils/verdict';
import { formatElapsed } from './utils/elapsedFormat';
import { computeVerdict } from './utils/verdict';

const INTERVAL_MS = 5000;

export default function App() {
  const adapter = useMemo(() => getBackgroundAdapter(), []);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pocCmd, setPocCmd] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, entries, h] = await Promise.all([
        adapter.getStatus(),
        adapter.getLog({ sinceSeq: 0 }),
        adapter.getHealth(),
      ]);
      setStatus(s);
      setLog(entries);
      setHealth(h);
    } catch (e) {
      console.error(e);
    }
  }, [adapter]);

  useEffect(() => {
    refresh();
    const unsubs: Array<{ remove: () => void }> = [];
    (async () => {
      unsubs.push(
        await adapter.addListener('jobUpdate', (data) => {
          setStatus(data as JobStatus);
        })
      );
      unsubs.push(
        await adapter.addListener('logAppend', () => {
          adapter.getLog({ sinceSeq: 0 }).then(setLog);
        })
      );
    })();
    return () => unsubs.forEach((u) => u.remove());
  }, [adapter, refresh]);

  // Display-only tick while visible
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedMs =
    status?.startedAtMs != null ? Math.max(0, now - status.startedAtMs) : 0;
  const interval = status?.intervalMs ?? INTERVAL_MS;
  const verdict = computeVerdict(log, interval, now, status?.serviceAlive ?? false);

  const startCounter = async () => {
    setBusy(true);
    try {
      await adapter.startJob({ type: 'counter', intervalMs: INTERVAL_MS });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const startSteps = async () => {
    setBusy(true);
    try {
      await adapter.startJob({ type: 'steps', intervalMs: INTERVAL_MS });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await adapter.stopJob();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const exportDiag = async () => {
    try {
      const json = await adapter.exportDiagnostics();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setExportMsg('Diagnostics copied to clipboard.');
      } else {
        setExportMsg('Export ready (clipboard unavailable). See console.');
        console.log(json);
      }
      // Also trigger download
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `axon-phase0-diagnostics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportMsg(String(e));
    }
  };

  const runPocCommand = async () => {
    const cmd = pocCmd.trim().toLowerCase();
    setBusy(true);
    try {
      if (cmd === 'start a timer' || cmd === 'show me a timer') {
        await adapter.startJob({ type: 'counter', intervalMs: INTERVAL_MS });
      } else if (cmd === 'stop the timer') {
        await adapter.stopJob();
      } else {
        setExportMsg('PoC-only accepts: "start a timer" | "show me a timer" | "stop the timer"');
        return;
      }
      await refresh();
      setExportMsg(`PoC command executed: ${cmd}`);
    } finally {
      setBusy(false);
    }
  };

  const openBatterySettings = () => {
    // Deep-link attempt; native side may handle via intent if wired
    setExportMsg(
      'Open system Settings → Apps → Axon Phase0 PoC → Battery → Unrestricted / Not optimized. Some OEMs (Xiaomi, Huawei, Oppo, Samsung) still kill background work aggressively.'
    );
  };

  const batteryStart = log.find((e) => e.batteryPercent != null)?.batteryPercent ?? null;
  const batteryNow =
    [...log].reverse().find((e) => e.batteryPercent != null)?.batteryPercent ?? null;

  return (
    <div className="min-h-full p-4 max-w-lg mx-auto space-y-4 text-sm">
      <header className="border-b border-neutral-700 pb-3">
        <h1 className="text-lg font-semibold tracking-tight">Axon Phase0 PoC</h1>
        <p className="text-neutral-400 text-xs mt-1">
          Native foreground service owns the work. Web = foreground only.
        </p>
      </header>

      {/* Controls */}
      <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        <div className="flex flex-wrap gap-2">
          <button
            className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 font-medium"
            onClick={startCounter}
            disabled={busy || status?.active}
          >
            Start counter
          </button>
          <button
            className="px-3 py-2 rounded bg-sky-700 hover:bg-sky-600 font-medium"
            onClick={startSteps}
            disabled={busy || status?.active}
          >
            Start steps demo
          </button>
          <button
            className="px-3 py-2 rounded bg-rose-800 hover:bg-rose-700 font-medium"
            onClick={stop}
            disabled={busy || !status?.active}
          >
            Stop
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-neutral-500">Live count</span>
            <div className="text-2xl font-mono tabular-nums">{status?.counter ?? 0}</div>
          </div>
          <div>
            <span className="text-neutral-500">Elapsed</span>
            <div className="text-2xl font-mono tabular-nums">
              {status?.startedAtMs != null ? formatElapsed(elapsedMs) : '—'}
            </div>
          </div>
        </div>
        <div>
          <span className="text-neutral-500 text-xs">Activity label</span>
          <div className="font-medium text-amber-200 min-h-[1.25rem]">
            {status?.stepLabel ?? (status?.active ? '…' : 'Idle')}
          </div>
        </div>
        <div className="text-xs text-neutral-400">
          Background service active:{' '}
          <span className={status?.serviceAlive ? 'text-emerald-400' : 'text-neutral-500'}>
            {status?.serviceAlive ? 'yes' : 'no'}
          </span>
        </div>
      </section>

      {/* Evidence */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 space-y-1">
        <h2 className="font-semibold text-neutral-200">Evidence panel</h2>
        <Row label="startedAt" value={status?.startedAtMs != null ? new Date(status.startedAtMs).toISOString() : '—'} />
        <Row label="now" value={new Date(now).toISOString()} />
        <Row label="elapsed" value={status?.startedAtMs != null ? formatElapsed(elapsedMs) : '—'} />
        <Row label="beats received" value={String(verdict.beatsReceived)} />
        <Row label="beats expected" value={String(verdict.beatsExpected)} />
        <Row label="missed beats" value={String(verdict.missedBeats)} />
        <Row label="longest gap" value={verdict.longestGapMs > 0 ? `${verdict.longestGapMs} ms` : '0'} />
        <Row
          label="last-heartbeat age"
          value={
            verdict.lastHeartbeatAgeMs != null ? `${Math.round(verdict.lastHeartbeatAgeMs / 1000)}s` : '—'
          }
        />
        <Row label="RESTARTED events" value={String(verdict.restartedEvents)} />
        <Row label="TIMEOUT events" value={String(verdict.timeoutEvents)} />
        <Row
          label="battery start / now"
          value={`${batteryStart ?? '—'}% / ${batteryNow ?? '—'}%`}
        />
        <div className="pt-2">
          <span className="text-neutral-500">Verdict</span>
          <div
            className={`font-bold text-base ${
              verdict.kind === 'PROVEN_RUNNING'
                ? 'text-emerald-400'
                : verdict.kind === 'GAPS_DETECTED' || verdict.kind === 'TIMEOUT'
                  ? 'text-amber-400'
                  : 'text-neutral-400'
            }`}
          >
            {verdict.label}
            {verdict.gaps.length > 0 && (
              <span className="block text-xs font-normal text-amber-300/80 mt-1">
                Gaps: {verdict.gaps.map((g) => `seq ${g.fromSeq}→${g.toSeq} (${g.gapMs}ms)`).join('; ')}
              </span>
            )}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            Verdict requires live service state + log analysis. UI timer alone is not evidence.
          </p>
        </div>
      </section>

      {/* Health */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 space-y-1">
        <h2 className="font-semibold text-neutral-200">Health panel</h2>
        <Row label="notification permission" value={health?.notificationPermission ?? '—'} />
        <Row
          label="battery optimization exempt"
          value={
            health?.batteryOptimizationExempt == null
              ? 'unknown / n/a'
              : health.batteryOptimizationExempt
                ? 'yes'
                : 'no'
          }
        />
        <button
          className="mt-1 w-full text-left px-2 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
          onClick={openBatterySettings}
        >
          How to exempt from battery optimization (opens guidance)
        </button>
        <p className="text-[11px] text-neutral-500 mt-1">
          {health?.manufacturerNote ??
            'Some phone makers (Xiaomi, Huawei, Oppo, Vivo, Samsung) aggressively kill background apps even with exemptions.'}
        </p>
        <Row label="can run in background" value={health?.canRunInBackground ? 'yes (native)' : 'no'} />
        <Row label="platform" value={health?.platform ?? '—'} />
      </section>

      {/* PoC command */}
      <section className="rounded-lg border border-dashed border-neutral-700 bg-neutral-950 p-3 space-y-2">
        <h2 className="font-semibold text-neutral-300 text-xs uppercase tracking-wide">
          PoC-only command box (not the Brain)
        </h2>
        <input
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-2 text-sm"
          placeholder='e.g. "start a timer"'
          value={pocCmd}
          onChange={(e) => setPocCmd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runPocCommand()}
        />
        <button
          className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
          onClick={runPocCommand}
          disabled={busy}
        >
          Run PoC command
        </button>
      </section>

      <section className="flex gap-2">
        <button
          className="flex-1 px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
          onClick={refresh}
        >
          Refresh
        </button>
        <button
          className="flex-1 px-3 py-2 rounded bg-indigo-900 hover:bg-indigo-800 text-xs"
          onClick={exportDiag}
        >
          Export diagnostics
        </button>
      </section>
      {exportMsg && <p className="text-xs text-neutral-400">{exportMsg}</p>}

      <footer className="text-[10px] text-neutral-600 pt-4 pb-8">
        applicationId: com.axon.phase0poc · heartbeat owned by native service · Phase 0A
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="font-mono text-right break-all">{value}</span>
    </div>
  );
}
