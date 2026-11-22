package expo.modules.vindiciservice

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS side: modules/vindici-service/index.ts.
class VindiciServiceModule : Module() {
  private val ctx: Context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private var taskId = -1

  override fun definition() = ModuleDefinition {
    Name("VindiciService")
    Events("onLocation", "onAction")

    OnCreate { RecordingService.listener = { name, body -> sendEvent(name, body) } }
    OnDestroy { RecordingService.listener = null }

    // Starts the foreground service, and a headless JS task that lasts until JS ends it (releaseKeepAlive in
    // index.ts). React Native stops JS timers when the app leaves the screen unless such a task is running, and the
    // adapter polling loop runs on timers.
    Function("start") { title: String, body: String, stopLabel: String, channel: String, gps: Boolean ->
      val c = ctx
      val i = Intent(c, RecordingService::class.java)
        .putExtra("title", title).putExtra("body", body).putExtra("stopLabel", stopLabel)
        .putExtra("channel", channel).putExtra("gps", gps)
      ContextCompat.startForegroundService(c, i)
      val rc = c as? ReactContext ?: return@Function false
      UiThreadUtil.runOnUiThread {
        val tasks = HeadlessJsTaskContext.getInstance(rc)
        if (taskId < 0 || !tasks.isTaskRunning(taskId)) {
          taskId = try { tasks.startTask(HeadlessJsTaskConfig("VindiciKeepAlive", Arguments.createMap(), 0, true)) } catch (_: Exception) { -1 }
        }
      }
      true
    }
    Function("update") { title: String, body: String -> RecordingService.update(ctx, title, body) }
    Function("stop") {
      ctx.stopService(Intent(ctx, RecordingService::class.java))
      taskId = -1 // JS finishes the task itself (its promise resolves)
    }
    Function("isRunning") { RecordingService.running }

    // ---- Settings > Background check ----
    Function("brand") { Build.MANUFACTURER.lowercase() }
    Function("notificationsEnabled") { NotificationManagerCompat.from(ctx).areNotificationsEnabled() }
    Function("batteryUnrestricted") {
      ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) == true
    }
    // The system dialog "Let the app always run in the background?".
    Function("requestBatteryUnrestricted") {
      open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.packageName)))
        || open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }
    Function("openAppSettings") { openAppSettings() }
    // Xiaomi / Redmi / POCO: the Autostart list in the Security app. Elsewhere, the app's own settings page.
    Function("openAutostart") {
      open(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")))
        || openAppSettings()
    }
  }

  private fun openAppSettings() = open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName)))

  private fun open(i: Intent): Boolean = try {
    ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (_: Exception) { false }
}
