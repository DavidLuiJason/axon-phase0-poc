package com.axon.phase0poc

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import org.json.JSONObject

@CapacitorPlugin(
    name = "BackgroundJobs",
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")
    ]
)
class BackgroundJobsPlugin : Plugin() {

    companion object {
        @Volatile
        private var instance: BackgroundJobsPlugin? = null

        fun notifyJobUpdate(status: JSONObject) {
            instance?.notifyListeners("jobUpdate", JSObject.fromJSONObject(status))
        }

        fun notifyLogAppend(entry: JSONObject) {
            instance?.notifyListeners("logAppend", JSObject.fromJSONObject(entry))
        }
    }

    override fun load() {
        super.load()
        instance = this
    }

    @PluginMethod
    fun startJob(call: PluginCall) {
        val type = call.getString("type") ?: "counter"
        val intervalMs = call.getLong("intervalMs") ?: 5000L
        val intent = Intent(context, BackgroundJobService::class.java).apply {
            action = BackgroundJobService.ACTION_START
            putExtra(BackgroundJobService.EXTRA_TYPE, type)
            putExtra(BackgroundJobService.EXTRA_INTERVAL_MS, intervalMs)
        }
        ContextCompat.startForegroundService(context, intent)
        // Brief delay so service can publish status
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            call.resolve(statusObject())
        }, 200)
    }

    @PluginMethod
    fun stopJob(call: PluginCall) {
        val intent = Intent(context, BackgroundJobService::class.java).apply {
            action = BackgroundJobService.ACTION_STOP
        }
        context.startService(intent)
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            call.resolve(statusObject())
        }, 200)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(statusObject())
    }

    @PluginMethod
    fun getLog(call: PluginCall) {
        val since = call.getInt("sinceSeq") ?: 0
        val store = JobStore(context)
        val arr = store.readLog(since)
        val out = JSObject()
        out.put("entries", JSArray(arr.toString()))
        call.resolve(out)
    }

    @PluginMethod
    fun getHealth(call: PluginCall) {
        val out = JSObject()
        out.put("notificationPermission", notificationPermissionStatus())
        out.put("batteryOptimizationExempt", isIgnoringBatteryOptimizations())
        out.put(
            "manufacturerNote",
            "Some OEMs (Xiaomi, Huawei, Oppo, Vivo, Samsung) kill background apps even with exemptions. Test on real hardware."
        )
        out.put("platform", "android")
        out.put("canRunInBackground", true)
        call.resolve(out)
    }

    @PluginMethod
    fun exportDiagnostics(call: PluginCall) {
        val store = JobStore(context)
        val json = store.exportAll()
        val out = JSObject()
        out.put("json", json)
        call.resolve(out)
    }

    private fun statusObject(): JSObject {
        return try {
            JSObject.fromJSONObject(BackgroundJobService.readStatus())
        } catch (_: Exception) {
            JSObject().apply {
                put("active", false)
                put("serviceAlive", BackgroundJobService.isRunning)
                put("seq", 0)
                put("counter", 0)
                put("intervalMs", 5000)
            }
        }
    }

    private fun notificationPermissionStatus(): String {
        if (Build.VERSION.SDK_INT < 33) return "granted"
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        return if (granted) "granted" else "denied"
    }

    private fun isIgnoringBatteryOptimizations(): Boolean {
        val pm = context.getSystemService(PowerManager::class.java) ?: return false
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }
}
