package com.qba.todolist

import java.net.URI

internal object ServerAddress {
    fun normalize(value: String): String? = try {
        val uri = URI(value.trim())
        if (uri.scheme !in listOf("http", "https") || uri.host.isNullOrBlank() ||
            uri.rawUserInfo != null || uri.rawFragment != null || uri.port !in -1..65535 || uri.port == 0) null
        else uri.toASCIIString()
    } catch (_: Exception) { null }

    fun sameOrigin(base: String, target: String): Boolean = try {
        val a = URI(base)
        val b = URI(target)
        fun port(uri: URI) = if (uri.port != -1) uri.port else if (uri.scheme == "https") 443 else 80
        b.scheme in listOf("http", "https") && a.scheme == b.scheme &&
            a.host.equals(b.host, ignoreCase = true) && port(a) == port(b) && b.rawUserInfo == null
    } catch (_: Exception) { false }
}
