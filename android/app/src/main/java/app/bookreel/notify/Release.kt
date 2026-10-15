package app.bookreel.notify

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import app.bookreel.MainActivity
import app.bookreel.R

/**
 * Daily-release reminders. Uses an inexact alarm (no special permission) because a few minutes of
 * delay is fine for "your next chapter is ready". The server push backup arrives with the backend (v1).
 */
object ReleaseScheduler {
    private const val CHANNEL = "chapters"
    private const val REQUEST = 1001

    fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(CHANNEL, "New chapters", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "Tells you when your next chapter is released"
        nm.createNotificationChannel(channel)
    }

    fun schedule(context: Context, at: Long, title: String, text: String) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = Intent(context, ReleaseReceiver::class.java)
            .putExtra("title", title)
            .putExtra("text", text)
        val pi = PendingIntent.getBroadcast(
            context, REQUEST, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun show(context: Context, title: String, text: String) {
        ensureChannel(context)
        if (!canNotify(context)) return
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val n = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_book)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)?.notify(42, n)
    }
}

class ReleaseReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "Your next chapter is ready"
        val text = intent.getStringExtra("text") ?: "Open Bookreel to keep reading."
        ReleaseScheduler.show(context, title, text)
    }
}
