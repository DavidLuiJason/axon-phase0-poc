# Owner phone test protocol — Axon Phase0 PoC

**Honesty:** A UI timer and a notification chronometer are **not** evidence. Evidence is the **persistent log** written by the native service (jobId, seq, wallClockMs, elapsedRealtimeMs, battery, step label, RESTARTED/TIMEOUT events) plus the **serviceAlive** flag from the real service.

After each test, open the **Evidence panel**, note the **Verdict**, then **Export diagnostics** and send the JSON back.

---

## T1 — App backgrounded, other app in front (10 min)

1. Open app → **Start counter**.
2. Confirm Activity label updates and count increments.
3. Press Home, open another app (browser/maps), leave for **10 minutes**.
4. Return to PoC.

**Expected:** Count continued; beats received ≈ elapsed/5s; Verdict **PROVEN RUNNING** (or GAPS if OEM killed it). RESTARTED only if OS killed and restarted the service.

**Where to read:** Evidence panel → beats received / expected / longest gap / Verdict. Export log.

---

## T2 — Screen off 30 min

1. Start counter. Turn screen off for **30 minutes** (do not force-stop).
2. Wake, open app.

**Expected:** Log continues with ~5s spacing; battery samples every ≥60s; no fake continuous UI timer while off—elapsed is from `startedAt`.

**Where to read:** Evidence panel + exported log wallClock deltas.

---

## T3 — Swipe app from recents

1. Start counter. Open Recents → swipe PoC away.
2. Wait 2–5 minutes. Reopen from launcher.

**Expected (varies by OEM):**  
- Service may keep running (notification still present) → log continues.  
- Or OS kills service → on return may see STOPPED / GAPS / RESTARTED if START_STICKY revived it with gap event.

**Where to read:** Notification presence; idle line “Background service active”; log RESTARTED events.

---

## T4 — Run 1+ hour

1. Start counter; leave device idle or lightly used for **≥60 min**.
2. Return.

**Expected:** Continuous beats; longest gap ≤ 3× interval for **PROVEN RUNNING**. Note battery start/now.

**Where to read:** Evidence panel; export full log.

---

## T5 — Idle check (no job)

1. Ensure no job running (Stop if needed).
2. Force-stop app from system settings optional, then reopen.

**Expected:** “Background service active: **no**”. No wake lock. No notification for the job channel.

**Where to read:** Idle check line; Health panel.

---

## T6 — Stop check

1. Start counter; wait for several beats.
2. Press **Stop**.

**Expected:** Service stops; notification gone; STOPPED event in log; service active: no.

**Where to read:** Evidence panel STOPPED; idle line.

---

## T7 — Battery optimization on vs exempt

1. With optimization **not** exempted: start counter, background 15–30 min.
2. Exempt app (Settings → Apps → Axon Phase0 PoC → Battery → Unrestricted), repeat.

**Expected:** Exempt run shows fewer/no large gaps on aggressive OEMs. Non-exempt may show GAPS or kill.

**Where to read:** Health panel status; gap list in Verdict.

---

## T8 — Optional overnight

1. Start counter before sleep; leave charging or not.
2. Morning: check Verdict, longest gap, RESTARTED count, battery curve.

**Expected:** Continuous or documented gaps only; never silent gap hiding.

---

## How to send the log back

1. Tap **Export diagnostics** → JSON downloads / copies.
2. Share the file (email, Drive, adb):

   ```bash
   adb shell run-as com.axon.phase0poc cat files/job_log.jsonl
   ```

3. Include: device model, Android version, battery optimization state, which test (T1–T8).
