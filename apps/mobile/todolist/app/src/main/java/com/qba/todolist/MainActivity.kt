package com.qba.todolist

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private lateinit var error: TextView
    // 修改此地址即可切换服务器；模拟器使用 localhost 时需要 adb reverse。
    private val serverUrl = "http://127.0.0.1:5173/"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NotificationScheduler.ensureChannel(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        root.addView(progress)
        error = TextView(this).apply {
            text = "页面连接失败，请检查网络、服务器地址和服务是否启动，点击此处重试。"
            setPadding(24, 24, 24, 24)
            visibility = View.GONE
            setTextColor(0xffb3261e.toInt())
            setOnClickListener { this@MainActivity.error.visibility = View.GONE; web.loadUrl(serverUrl) }
        }
        root.addView(error)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            addJavascriptInterface(this@MainActivity.NotificationBridge(), "TeamSyncAndroid")
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, value: Int) {
                    this@MainActivity.progress.progress = value
                    this@MainActivity.progress.visibility = if (value == 100) View.GONE else View.VISIBLE
                }
            }
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                    error.visibility = View.GONE
                }
                override fun onReceivedError(view: WebView, request: WebResourceRequest, failure: WebResourceError) {
                    if (request.isForMainFrame) showError()
                }
                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (request.isForMainFrame && response.statusCode >= 400) showError()
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (ServerAddress.sameOrigin(serverUrl, uri.toString())) return false
                    if (uri.scheme in listOf("https", "http", "mailto", "tel")) {
                        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                        catch (_: android.content.ActivityNotFoundException) {
                            Toast.makeText(this@MainActivity, "没有可打开此链接的应用", Toast.LENGTH_SHORT).show()
                        }
                    }
                    return true
                }
            }
        }
        root.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = back()
        })
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(initialUrl(intent))
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openPath(intent)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST &&
            grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED
        ) {
            Toast.makeText(this, "通知权限未开启；可在系统设置中允许通知，仍可正常使用网页", Toast.LENGTH_LONG).show()
        }
    }

    private fun initialUrl(intent: Intent?): String {
        val path = safePath(intent?.getStringExtra("path")) ?: return serverUrl
        return serverUrl.trimEnd('/') + path
    }

    private fun openPath(intent: Intent) {
        val path = safePath(intent.getStringExtra("path")) ?: return
        if (::web.isInitialized) {
            web.loadUrl(serverUrl.trimEnd('/') + path)
        }
    }

    private fun safePath(raw: String?): String? {
        val path = raw?.take(300) ?: return null
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("..")) return null
        return path
    }

    private fun showError() { error.visibility = View.VISIBLE; progress.visibility = View.GONE }
    private fun back() { if (web.canGoBack()) web.goBack() else finish() }

    private fun permissionState(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return "prompt"
        }
        return if (NotificationScheduler.canNotify(this)) "granted" else "denied"
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            if (!NotificationScheduler.canNotify(this)) {
                runOnUiThread {
                    Toast.makeText(this, "系统通知已关闭，请在系统设置中开启", Toast.LENGTH_LONG).show()
                }
            }
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        runOnUiThread {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST,
            )
        }
    }

    /** Web 只通过这个白名单接口提交未来 7 天提醒，不暴露文件/网络/权限等原生能力。 */
    inner class NotificationBridge {
        @JavascriptInterface
        fun schedule(teamId: Int, kind: String, payload: String): String {
            val singular = when (kind) {
                "events" -> "event"
                "tasks" -> "task"
                else -> return "invalid"
            }
            return try {
                "scheduled:${NotificationScheduler.schedule(this@MainActivity, teamId, singular, payload)}"
            } catch (_: Exception) {
                "error"
            }
        }

        @JavascriptInterface
        fun cancel(teamId: Int): String = try {
            NotificationScheduler.cancelTeam(this@MainActivity, teamId)
            "cancelled"
        } catch (_: Exception) {
            "error"
        }

        @JavascriptInterface
        fun permission(): String = permissionState()

        @JavascriptInterface
        fun requestPermission(): String {
            requestNotificationPermission()
            return permissionState()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) { web.saveState(outState); super.onSaveInstanceState(outState) }
    override fun onResume() { super.onResume(); if (::web.isInitialized) web.onResume() }
    override fun onPause() { if (::web.isInitialized) web.onPause(); super.onPause() }
    override fun onDestroy() {
        web.removeJavascriptInterface("TeamSyncAndroid")
        web.stopLoading()
        (web.parent as? android.view.ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    private companion object {
        const val NOTIFICATION_PERMISSION_REQUEST = 1001
    }
}
