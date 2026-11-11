package com.qba.todolist

import org.json.JSONArray
import org.json.JSONObject

/**
 * Web 传入的一条本地提醒。原生只做校验/排程，提醒策略（15 分钟/1 小时/7 天）
 * 在 packages/shared 之外的 Web 层计算，便于用 Vitest 覆盖。
 */
data class ScheduledNotification(
    val id: String,
    val title: String,
    val body: String,
    val at: Long,
    val path: String,
    val teamId: Int,
    val kind: String,
) {
    companion object {
        fun parseArray(raw: String): List<ScheduledNotification> = try {
            val array = JSONArray(raw)
            val items = mutableListOf<ScheduledNotification>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                fromJson(item)?.let(items::add)
            }
            items
        } catch (_: Exception) {
            emptyList()
        }

        private fun fromJson(item: JSONObject): ScheduledNotification? {
            val id = item.optString("id", "").take(160).takeIf { it.isNotBlank() } ?: return null
            val title = item.optString("title", "").take(120).takeIf { it.isNotBlank() } ?: return null
            val body = item.optString("body", "").take(300)
            val at = item.optLong("at", -1)
            val path = item.optString("path", "").take(300)
            val teamId = item.optInt("teamId", -1)
            val kind = item.optString("kind", "")
            if (at <= 0 || teamId <= 0 || kind !in setOf("event", "task")) return null
            if (!path.startsWith("/") || path.contains("..")) return null
            return ScheduledNotification(id, title, body, at, path, teamId, kind)
        }
    }
}
