package com.qba.todolist

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * 本地提醒排程：
 * - 每个 team+kind（events/tasks）整批替换，活动改期/任务完成后旧闹钟被取消；
 * - 只排未来 7 天，避免 WebView 长期不在线时无限堆积；
 * - Android 12+ 无精确闹钟权限时降级为 setAndAllowWhileIdle，不崩溃；
 * - 排程内容落 SharedPreferences，开机后由 BootReceiver 重排未来项。
 */
object NotificationScheduler {
    const val CHANNEL_ID = "teamsync-reminders"
    private const val PREFS = "teamsync-notifications"
    private const val KEY_PREFIX = "schedule:"
    private const val HORIZON_MS = 7L * 24 * 60 * 60 * 1000
    private const val MIN_LEAD_MS = 1_000L

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "TeamSync 提醒",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "活动开始前与任务截止前的本地提醒"
        }
        manager.createNotificationChannel(channel)
    }

    fun canNotify(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled()

    fun schedule(context: Context, teamId: Int, kind: String, raw: String): Int {
        val items = ScheduledNotification.parseArray(raw)
            .filter { it.teamId == teamId && it.kind == kind }
        cancel(context, teamId, kind)
        val now = System.currentTimeMillis()
        val horizon = now + HORIZON_MS
        val future = items.filter { it.at in (now + MIN_LEAD_MS)..horizon }
        store(context, teamId, kind, future)
        future.forEach { scheduleOne(context, it) }
        return future.size
    }

    fun cancel(context: Context, teamId: Int, kind: String) {
        load(context, teamId, kind).forEach { cancelOne(context, it) }
        prefs(context).edit().remove(key(teamId, kind)).apply()
    }

    fun cancelTeam(context: Context, teamId: Int) {
        cancel(context, teamId, "event")
        cancel(context, teamId, "task")
    }

    fun rescheduleAll(context: Context) {
        val now = System.currentTimeMillis()
        val horizon = now + HORIZON_MS
        for ((storageKey, value) in prefs(context).all) {
            if (!storageKey.startsWith(KEY_PREFIX) || value !is String) continue
            val items = ScheduledNotification.parseArray(value)
                .filter { it.at in (now + MIN_LEAD_MS)..horizon }
            if (items.isEmpty()) {
                prefs(context).edit().remove(storageKey).apply()
                continue
            }
            items.forEach { scheduleOne(context, it) }
        }
    }

    private fun scheduleOne(context: Context, item: ScheduledNotification) {
        val manager = context.getSystemService(AlarmManager::class.java)
        val pending = pendingIntent(context, item, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pending)
            } else {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pending)
            }
        } catch (_: SecurityException) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pending)
        }
    }

    private fun cancelOne(context: Context, item: ScheduledNotification) {
        val manager = context.getSystemService(AlarmManager::class.java)
        pendingIntent(context, item, PendingIntent.FLAG_NO_CREATE)?.let(manager::cancel)
    }

    private fun pendingIntent(
        context: Context,
        item: ScheduledNotification,
        flags: Int,
    ): PendingIntent? {
        val intent = Intent(context, NotificationReceiver::class.java).apply {
            putExtra("id", item.id)
            putExtra("title", item.title)
            putExtra("body", item.body)
            putExtra("path", item.path)
        }
        return PendingIntent.getBroadcast(
            context,
            item.id.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or flags,
        )
    }

    private fun store(context: Context, teamId: Int, kind: String, items: List<ScheduledNotification>) {
        val editor = prefs(context).edit()
        val storageKey = key(teamId, kind)
        if (items.isEmpty()) {
            editor.remove(storageKey)
        } else {
            editor.putString(storageKey, toJson(items))
        }
        editor.apply()
    }

    private fun load(context: Context, teamId: Int, kind: String): List<ScheduledNotification> {
        val raw = prefs(context).getString(key(teamId, kind), null) ?: return emptyList()
        return ScheduledNotification.parseArray(raw)
    }

    private fun toJson(items: List<ScheduledNotification>): String {
        val array = JSONArray()
        items.forEach { item ->
            array.put(
                JSONObject().apply {
                    put("id", item.id)
                    put("title", item.title)
                    put("body", item.body)
                    put("at", item.at)
                    put("path", item.path)
                    put("teamId", item.teamId)
                    put("kind", item.kind)
                },
            )
        }
        return array.toString()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun key(teamId: Int, kind: String) = "$KEY_PREFIX$teamId:$kind"
}
