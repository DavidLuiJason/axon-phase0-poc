package com.axon.phase0poc

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Native foreground service that OWNS the work.
 * Heartbeat is NOT in JavaScript. Partial wake lock only while a job runs.
 * START_STICKY recovery with explicit RESTARTED events.
 *
 * Foreground service type: specialUse
 * (Android 15 caps dataSync/mediaProcessing at 6h/24h; specialUse fits open-ended PoC jobs.
 * Source: https://developer.android.com/develop/background-work/services/fgs/service-types )
 */
class BackgroundJobService : Service() {

    companion object {
        const val TAG = "AxonBgJob"
        const val CHANNEL_ID = "axon_phase0_jobs"
        const val NOTIFICATION_ID = 42001
        const val ACTION_START = "com.axon.phase0poc.START_JOB"
        const val ACTION_STOP = "com.axon.phase0poc.STOP_JOB"
        const val EXTRA_TYPE = "type"
        const val EXTRA_INTERVAL_MS = "intervalMs"
        const val DEFAULT_INTERVAL_MS = 5000L

        @Volatile
        var isRunning: Boolean = false
            private set

        @Volatile
        var currentStatusJson: String =
            """{"active":false,"jobId":null,"type":null,"startedAtMs":null,"seq":0,"counter":0,"stepLabel":null,"intervalMs":5000,"serviceAlive":false}"""
            private set

        private val statusLock = Any()

        fun readStatus(): JSONObject = synchronized(statusLock) {
            JSONObject(currentStatusJson)
        }

        fun updateStatus(block: (JSONObject) -> Unit) {
            synchronized(statusLock) {
                val o = JSONObject(currentStatusJson)
                block(o)
                o.put("serviceAlive", isRunning)
                currentStatusJson = o.toString()
            }
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var intervalMs = DEFAULT_INTERVAL_MS
    private var jobId: String? = null
    private var jobType: String = "counter"
    private var startedAtMs: Long = 0L
    private var seq: Int = 0
    private var counter: Int = 0
    private var stepLabel: String = "Idle"
    private var lastBatterySampleMs: Long = 0L
    private var lastBatteryPercent: Int = -1
    private var beatRunnable: Runnable? = null
    private lateinit var store: JobStore

    private val steps = listOf(
        Step("collect", "Collecting heartbeat samples", 3),
        Step("checkpoint", "Writing checkpoint", 2),
        Step("verify", "Verifying log integrity", 3),
        Step("wait", "Waiting for next cycle", 2),
        Step("finalize", "Finalizing job and releasing wake lock", 1)
    )

    data class Step(val id: String, val label: String, val durationBeats: Int)
    data class StepInfo(val index: Int, val label: String, val done: Boolean)

    override fun onCreate() {
        super.onCreate()
        store = JobStore(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopJob("Stopped by user")
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val type = intent.getStringExtra(EXTRA_TYPE) ?: "counter"
                val interval = intent.getLongExtra(EXTRA_INTERVAL_MS, DEFAULT_INTERVAL_MS)
                startJob(type, interval, resume = false)
            }
            else -> {
                val state = store.loadState()
                if (state != null && state.optBoolean("active", false)) {
                    val type = state.optString("type", "counter")
                    val interval = state.optLong("intervalMs", DEFAULT_INTERVAL_MS)
                    jobId = state.optString("jobId", null)
                    startedAtMs = state.optLong("startedAtMs", System.currentTimeMillis())
                    seq = state.optInt("seq", 0)
                    counter = state.optInt("counter", 0)
                    val lastBeatWall = state.optLong("lastBeatWallMs", 0L)
                    val gap = if (lastBeatWall > 0) System.currentTimeMillis() - lastBeatWall else 0L
                    startJob(type, interval, resume = true, gapMs = gap)
                } else {
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTimeout(startId: Int, fgsType: Int) {
        Log.w(TAG, "onTimeout type=$fgsType")
        appendEvent("TIMEOUT", "System timeout; checkpoint and stop")
        persistState(active = false)
        stopJob("TIMEOUT")
    }

    private fun startJob(type: String, interval: Long, resume: Boolean, gapMs: Long = 0L) {
        if (isRunning && !resume) {
            stopJobInternal(release = true)
        }
        jobType = type
        intervalMs = if (interval < 1000) DEFAULT_INTERVAL_MS else interval
        if (!resume || jobId == null) {
            jobId = UUID.randomUUID().toString()
            startedAtMs = System.currentTimeMillis()
            seq = 0
            counter = 0
        }
        isRunning = true
        acquireWakeLock()
        stepLabel = if (type == "steps") labelForBeat(0) else "Open-ended counter heartbeat"
        startAsForeground()
        if (resume) {
            appendEvent("RESTARTED", "Service restarted after kill; gapMs=$gapMs", gapMs)
        } else {
            appendEvent("STARTED", stepLabel)
        }
        persistState(active = true)
        publishStatus()
        scheduleNextBeat()
    }

    private fun scheduleNextBeat() {
        beatRunnable?.let { handler.removeCallbacks(it) }
        val r = Runnable {
            if (!isRunning) return@Runnable
            doBeat()
            if (isRunning) scheduleNextBeat()
        }
        beatRunnable = r
        handler.postDelayed(r, intervalMs)
    }

    private fun doBeat() {
        seq += 1
        counter += 1
        if (jobType == "steps") {
            val info = stepInfoForBeat(seq - 1)
            stepLabel = info.label
            appendEvent("BEAT", stepLabel)
            if (info.done) {
                appendEvent("STOPPED", "Steps job finished")
                stopJobInternal(release = true)
                stopForeground(STOP_FOREGROUND_REMOVE)
                isRunning = false
                publishStatus()
                BackgroundJobsPlugin.notifyJobUpdate(readStatus())
                stopSelf()
                return
            }
        } else {
            stepLabel = "Counter heartbeat #$counter"
            appendEvent("BEAT", stepLabel)
        }
        updateNotification()
        persistState(active = true)
        publishStatus()
        BackgroundJobsPlugin.notifyJobUpdate(readStatus())
    }

    private fun stepInfoForBeat(beatIndex: Int): StepInfo {
        var remaining = beatIndex
        for (i in steps.indices) {
            val s = steps[i]
            if (remaining < s.durationBeats) {
                val label = if (s.id == "checkpoint") "Writing checkpoint ${beatIndex + 1}" else s.label
                return StepInfo(i, label, false)
            }
            remaining -= s.durationBeats
        }
        return StepInfo(steps.lastIndex, steps.last().label, true)
    }

    private fun labelForBeat(beatIndex: Int) = stepInfoForBeat(beatIndex).label

    private fun stopJob(reason: String) {
        if (isRunning) {
            appendEvent("STOPPED", reason)
        }
        stopJobInternal(release = true)
        stopForeground(STOP_FOREGROUND_REMOVE)
        isRunning = false
        publishStatus()
        BackgroundJobsPlugin.notifyJobUpdate(readStatus())
        stopSelf()
    }

    private fun stopJobInternal(release: Boolean) {
        beatRunnable?.let { handler.removeCallbacks(it) }
        beatRunnable = null
        if (release) releaseWakeLock()
        persistState(active = false)
    }

    private fun appendEvent(eventType: String, label: String, gapMs: Long = -1) {
        val wall = System.currentTimeMillis()
        val batt = sampleBattery(wall)
        val entry = JSONObject().apply {
            put("jobId", jobId)
            put("seq", seq)
            put("wallClockMs", wall)
            put("elapsedRealtimeMs", wall - startedAtMs)
            put("batteryPercent", if (batt >= 0) batt else JSONObject.NULL)
            put("stepLabel", label)
            put("eventType", eventType)
            put("counter", counter)
            if (gapMs >= 0) put("gapMs", gapMs)
        }
        store.appendLog(entry)
        BackgroundJobsPlugin.notifyLogAppend(entry)
    }

    private fun sampleBattery(now: Long): Int {
        if (now - lastBatterySampleMs < 60_000 && lastBatteryPercent >= 0) {
            return lastBatteryPercent
        }
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        lastBatterySampleMs = now
        lastBatteryPercent = pct
        return pct
    }

    private fun persistState(active: Boolean) {
        val o = JSONObject().apply {
            put("active", active)
            put("jobId", jobId)
            put("type", jobType)
            put("startedAtMs", startedAtMs)
            put("seq", seq)
            put("counter", counter)
            put("intervalMs", intervalMs)
            put("stepLabel", stepLabel)
            put("lastBeatWallMs", System.currentTimeMillis())
        }
        store.saveState(o)
    }

    private fun publishStatus() {
        updateStatus { o ->
            o.put("active", isRunning)
            o.put("jobId", jobId)
            o.put("type", if (isRunning) jobType else null)
            if (startedAtMs > 0) o.put("startedAtMs", startedAtMs) else o.put("startedAtMs", JSONObject.NULL)
            o.put("seq", seq)
            o.put("counter", counter)
            if (isRunning) o.put("stepLabel", stepLabel) else o.put("stepLabel", JSONObject.NULL)
            o.put("intervalMs", intervalMs)
            o.put("serviceAlive", isRunning)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "axon:phase0job").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let { if (it.isHeld) it.release() }
        } catch (_: Exception) {
        }
        wakeLock = null
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Background jobs",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Axon Phase0 job progress"
                setShowBadge(false)
            }
            mgr.createNotificationChannel(ch)
        }
    }

    private fun startAsForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification() {
        val mgr = getSystemService(NotificationManager::class.java)
        mgr.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val elapsed = if (startedAtMs > 0) System.currentTimeMillis() - startedAtMs else 0L
        val elapsedStr = formatElapsed(elapsed)
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(
            this, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Axon Phase0 PoC")
            .setContentText("$stepLabel · $elapsedStr")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun formatElapsed(ms: Long): String {
        val totalSec = (ms / 1000).toInt().coerceAtLeast(0)
        val days = totalSec / 86400
        val hours = (totalSec % 86400) / 3600
        val minutes = (totalSec % 3600) / 60
        val seconds = totalSec % 60
        return when {
            days > 0 -> "${days}d ${hours}h ${minutes}m"
            hours > 0 -> "${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s"
            minutes > 0 -> "${minutes}m ${seconds.toString().padStart(2, '0')}s"
            else -> "${seconds}s"
        }
    }

    override fun onDestroy() {
        stopJobInternal(release = true)
        isRunning = false
        super.onDestroy()
    }
}

class JobStore(private val ctx: Context) {
    private val stateFile = File(ctx.filesDir, "job_state.json")
    private val logFile = File(ctx.filesDir, "job_log.jsonl")

    fun saveState(o: JSONObject) {
        stateFile.writeText(o.toString())
    }

    fun loadState(): JSONObject? {
        if (!stateFile.exists()) return null
        return try {
            JSONObject(stateFile.readText())
        } catch (_: Exception) {
            null
        }
    }

    fun appendLog(entry: JSONObject) {
        logFile.appendText(entry.toString() + "\n")
    }

    fun readLog(sinceSeq: Int = 0): JSONArray {
        val arr = JSONArray()
        if (!logFile.exists()) return arr
        logFile.forEachLine { line ->
            if (line.isBlank()) return@forEachLine
            try {
                val o = JSONObject(line)
                if (o.optInt("seq", 0) >= sinceSeq) arr.put(o)
            } catch (_: Exception) {
            }
        }
        return arr
    }

    fun exportAll(): String {
        val root = JSONObject()
        root.put("state", loadState() ?: JSONObject.NULL)
        root.put("log", readLog(0))
        root.put("exportedAt", System.currentTimeMillis())
        return root.toString(2)
    }
}
