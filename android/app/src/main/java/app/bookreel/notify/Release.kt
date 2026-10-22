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
import android.net.Uri
import android.os.Build
import app.bookreel.MainActivity
import app.bookreel.R
import org.json.JSONObject

/**
 * Daily-release notifications, one per book: "Chapter 5 of The Goal is ready". The web app asks for them
 * through the shell's bridge. Alarms are inexact (no special permission; a few minutes late is fine) and
 * are kept in preferences too, because Android forgets alarms on a reboot or an app update.
 */
object Release {
    private const val CHANNEL = "chapters"
    private const val PREFS = "releases"

    fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(CHANNEL, "New chapters", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "Tells you when your next chapter is released"
        nm.createNotificationChannel(channel)
    }

    fun canNotify(context: Context): Boolean {
        val granted = Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return granted && context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() == true
    }

    fun schedule(context: Context, bookId: String, at: Long, title: String, text: String, hash: String) {
        val saved = JSONObject().put("at", at).put("title", title).put("text", text).put("hash", hash)
        prefs(context).edit().putString(bookId, saved.toString()).apply()
        arm(context, bookId, at)
    }

    fun cancel(context: Context, bookId: String) {
        prefs(context).edit().remove(bookId).apply()
        context.getSystemService(AlarmManager::class.java)?.cancel(pending(context, bookId))
    }

    /** After a reboot or an update: set every saved alarm again; one whose time has passed shows now. */
    fun rearmAll(context: Context) {
        val now = System.currentTimeMillis()
        for ((bookId, value) in prefs(context).all) {
            val at = (value as? String)?.let { runCatching { JSONObject(it).getLong("at") }.getOrNull() } ?: continue
            if (at <= now) show(context, bookId, null, null) else arm(context, bookId, at)
        }
    }

    /** Shows the notification for a book (its saved title, text and chapter link) and forgets the alarm. */
    fun show(context: Context, bookId: String?, fallbackTitle: String?, fallbackText: String?) {
        val saved = bookId?.let { prefs(context).getString(it, null) }?.let { runCatching { JSONObject(it) }.getOrNull() }
        if (bookId != null) prefs(context).edit().remove(bookId).apply()
        ensureChannel(context)
        if (!canNotify(context)) return
        val title = saved?.optString("title")?.takeIf { it.isNotBlank() } ?: fallbackTitle ?: "Your next chapter is ready"
        val text = saved?.optString("text")?.takeIf { it.isNotBlank() } ?: fallbackText ?: "Open Bookreel to keep reading."
        val hash = saved?.optString("hash")?.takeIf { it.isNotBlank() } ?: "#/"
        val id = (bookId ?: "bookreel").hashCode()
        val open = PendingIntent.getActivity(
            context, id,
            Intent(context, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_HASH, hash)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_book)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)?.notify(id, n)
    }

    private fun arm(context: Context, bookId: String, at: Long) {
        context.getSystemService(AlarmManager::class.java)
            ?.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, bookId))
    }

    /** One alarm per book: the book id is in the intent's data, so books never replace each other's alarm. */
    private fun pending(context: Context, bookId: String): PendingIntent = PendingIntent.getBroadcast(
        context, 0,
        Intent(context, ReleaseReceiver::class.java).setData(Uri.parse("bookreel://release/" + Uri.encode(bookId))),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}

class ReleaseReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // An alarm set by the earlier native app (before the update) has no book in its data, only a title and text.
        Release.show(context, intent.data?.lastPathSegment, intent.getStringExtra("title"), intent.getStringExtra("text"))
    }
}

/** Android clears alarms on a reboot and when the app is updated; set them again. */
class RearmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Release.rearmAll(context)
        }
    }
}
