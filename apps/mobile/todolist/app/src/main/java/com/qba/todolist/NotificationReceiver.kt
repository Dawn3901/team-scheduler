package com.qba.todolist

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** 闹钟到点后展示本地通知；点击通过 path 打开对应活动/任务。 */
class NotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!NotificationScheduler.canNotify(context)) return
        val id = intent.getStringExtra("id") ?: return
        val title = intent.getStringExtra("title") ?: return
        val body = intent.getStringExtra("body").orEmpty()
        val path = intent.getStringExtra("path").orEmpty()

        NotificationScheduler.ensureChannel(context)
        val open = Intent(context, MainActivity::class.java).apply {
            putExtra("path", path)
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            id.hashCode(),
            open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, NotificationScheduler.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
        } catch (_: SecurityException) {
            // Android 13+ 未授权 POST_NOTIFICATIONS：静默跳过，Web 仍可用。
        }
    }
}
