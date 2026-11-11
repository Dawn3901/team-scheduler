package com.qba.todolist

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 重启后 AlarmManager 排程会丢失；从 SharedPreferences 恢复未来 7 天提醒。 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        NotificationScheduler.ensureChannel(context)
        NotificationScheduler.rescheduleAll(context)
    }
}
