package com.qba.todolist

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
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
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(serverUrl)
    }

    private fun showError() { error.visibility = View.VISIBLE; progress.visibility = View.GONE }
    private fun back() { if (web.canGoBack()) web.goBack() else finish() }

    override fun onSaveInstanceState(outState: Bundle) { web.saveState(outState); super.onSaveInstanceState(outState) }
    override fun onResume() { super.onResume(); if (::web.isInitialized) web.onResume() }
    override fun onPause() { if (::web.isInitialized) web.onPause(); super.onPause() }
    override fun onDestroy() {
        web.stopLoading()
        (web.parent as? android.view.ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }
}
