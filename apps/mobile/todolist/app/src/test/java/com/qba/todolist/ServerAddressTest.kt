package com.qba.todolist

import org.junit.Assert.*
import org.junit.Test

class ServerAddressTest {
    @Test fun validatesServerAddresses() {
        assertEquals("http://192.168.1.10:5173", ServerAddress.normalize(" http://192.168.1.10:5173 "))
        for (url in listOf("javascript:alert(1)", "file:///tmp/a", "https://", "https://u:p@example.com", "https://example.com/#token", "http://example.com:99999")) {
            assertNull(url, ServerAddress.normalize(url))
        }
    }
    @Test fun limitsNavigationToConfiguredOrigin() {
        assertTrue(ServerAddress.sameOrigin("https://example.com", "https://example.com:443/teams/1"))
        assertFalse(ServerAddress.sameOrigin("https://example.com", "http://example.com"))
        assertFalse(ServerAddress.sameOrigin("https://example.com", "https://example.com.evil.org"))
        assertFalse(ServerAddress.sameOrigin("http://example.com:5173", "http://example.com:8000"))
    }
}
