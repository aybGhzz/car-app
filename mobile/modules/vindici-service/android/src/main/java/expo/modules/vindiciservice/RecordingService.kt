package expo.modules.vindiciservice

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

// Runs for as long as the app is connected to an adapter. It keeps the process in the foreground (so Android does not
// freeze it when the phone is locked or another app is opened), holds a CPU wake lock, shows the ongoing notification,
// and, when the car's route is recorded, reads the GPS (a foreground service may do that with "While using the app").
class RecordingService : Service() {
  companion object {
    const val CHANNEL = "vindici-recording"
    const val NOTIFICATION_ID = 4127
    const val ACTION_STOP = "expo.modules.vindiciservice.DISCONNECT"
    // Set by the module: forwards GPS fixes and the notification's Disconnect button to JS.
    @Volatile var listener: ((String, Map<String, Any?>) -> Unit)? = null
    @Volatile var running = false
    private var stopLabel = "Disconnect"

    fun build(ctx: Context, title: String, body: String): Notification {
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()
      val open = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val stop = PendingIntent.getService(ctx, 1, Intent(ctx, RecordingService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
      return NotificationCompat.Builder(ctx, CHANNEL)
        .setContentTitle(title)
        .setContentText(body)
        .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
        .setColor(0xFF0F7D74.toInt())
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setContentIntent(open)
        .addAction(0, stopLabel, stop)
        .build()
    }

    fun update(ctx: Context, title: String, body: String) {
      if (!running) return
      ctx.getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, build(ctx, title, body))
    }
  }

  private var wake: PowerManager.WakeLock? = null
  private var gpsOn = false
  private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
  private val gpsCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      for (l in result.locations) listener?.invoke("onLocation", mapOf("lat" to l.latitude, "lng" to l.longitude))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      listener?.invoke("onAction", mapOf("action" to "disconnect"))
      return START_NOT_STICKY
    }
    stopLabel = intent?.getStringExtra("stopLabel") ?: stopLabel
    val gps = intent?.getBooleanExtra("gps", false) == true && granted(Manifest.permission.ACCESS_FINE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java)?.createNotificationChannel(
        NotificationChannel(CHANNEL, intent?.getStringExtra("channel") ?: "Trip recording", NotificationManager.IMPORTANCE_LOW))
    }
    // Android 14 checks each type against the permissions held: connectedDevice needs BLUETOOTH_CONNECT (asked
    // before connecting), location needs the location permission. Only ask for location when it is granted.
    var type = 0
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
      if (gps) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
    }
    val n = build(this, intent?.getStringExtra("title") ?: "Vindici", intent?.getStringExtra("body") ?: "")
    try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
    } catch (e: Exception) {
      // e.g. started while the app was not on screen (not allowed since Android 12): nothing to keep alive.
      stopSelf()
      return START_NOT_STICKY
    }
    running = true
    if (wake == null) {
      wake = getSystemService(PowerManager::class.java)?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vindici:recording")?.apply {
        setReferenceCounted(false)
        acquire(12 * 60 * 60 * 1000L) // released on disconnect; the timeout is only a safety net
      }
    }
    if (gps && !gpsOn) {
      try {
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3000).setMinUpdateDistanceMeters(15f).build()
        fused.requestLocationUpdates(req, gpsCallback, Looper.getMainLooper())
        gpsOn = true
      } catch (_: SecurityException) {}
    } else if (!gps && gpsOn) {
      fused.removeLocationUpdates(gpsCallback)
      gpsOn = false
    }
    return START_NOT_STICKY // if Android kills the app anyway, the JS side is gone too: don't restart an empty service
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf() // the user swiped the app away
  }

  override fun onDestroy() {
    running = false
    if (gpsOn) fused.removeLocationUpdates(gpsCallback)
    gpsOn = false
    wake?.let { if (it.isHeld) it.release() }
    wake = null
    super.onDestroy()
  }

  private fun granted(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED
}
