package app.bookreel

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import app.bookreel.notify.Release
import org.json.JSONObject

/**
 * Bookreel for Android is a thin shell, like Khabri's: it opens bookreel-sand.vercel.app full screen, so
 * every change to the website (new books, features, fixes) reaches the phone without reinstalling.
 * The web app does the reading, progress and offline mode; this shell adds what a page can't do itself:
 * the back button, the share sheet, chapter notifications, status bar colours, picking a PDF, and
 * handing over the progress saved by the earlier native app. See window.BookreelAndroid in web/public/js/app.js.
 */
class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    @Volatile private var pageUrl: String? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        tellPage("bookreel-notify")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(state: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(state)
        preferHighestRefreshRate()
        Release.ensureChannel(this)

        val bg = if (isNight()) DARK_BG else LIGHT_BG
        root = FrameLayout(this).apply { setBackgroundColor(bg) }
        web = WebView(this).apply { setBackgroundColor(bg) }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        // Edge to edge: the page sits between the status bar and the navigation bar (and above the keyboard);
        // the strips behind the bars take the page's colour (see Bridge.setBars).
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }

        WebView.setWebContentsDebuggingEnabled(true) // a personal app; lets the CI test inspect the page
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true // progress lives in localStorage, downloaded books in IndexedDB
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
            textZoom = 100 // the app has its own text size setting
            userAgentString = "$userAgentString BookreelAndroid/${BuildConfig.VERSION_NAME}"
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isVerticalScrollBarEnabled = false
        web.addJavascriptInterface(Bridge(), "BookreelAndroid")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        web.setDownloadListener { url, _, _, _, _ -> if (url.startsWith("https://")) openOutside(Uri.parse(url)) }

        if (state == null || web.restoreState(state) == null) web.loadUrl(Links.startUrl(intent?.getStringExtra(EXTRA_HASH)))

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })
    }

    /** The web app closes a sheet or goes back a screen; on the library, back leaves the app. */
    private fun goBack() {
        web.evaluateJavascript("(window.bookreelBack ? window.bookreelBack() : false)") { handled ->
            if (handled != "true") moveTaskToBack(true)
        }
    }

    /** A notification tapped while the app is open: go to that chapter. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val hash = intent.getStringExtra(EXTRA_HASH) ?: return
        val safe = Links.safeHash(hash)
        if (Links.isOurs(pageUrl)) web.evaluateJavascript("window.bookreelOpen && window.bookreelOpen(${JSONObject.quote(safe)})", null)
        else web.loadUrl(Links.startUrl(safe))
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        tellPage("bookreel-resume") // the web app checks for a new version
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        root.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    private fun tellPage(event: String) {
        if (Links.isOurs(pageUrl)) web.evaluateJavascript("window.dispatchEvent(new Event('$event'))", null)
    }

    private fun openOutside(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            // nothing on the phone opens it
        }
    }

    private fun showOffline() {
        web.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null)
    }

    private fun isNight() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (Links.isOurs(url)) return false
            openOutside(request.url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            pageUrl = url
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            pageUrl = url
        }

        /** Only the very first start can fail like this: afterwards the web app's service worker serves it offline. */
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showOffline()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            recreate() // Android stopped the page to free memory: start again instead of crashing
            return true
        }
    }

    private inner class Chrome : WebChromeClient() {
        /** "Import a PDF" in Discover. */
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                pickFile.launch(params.createIntent())
                true
            } catch (e: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }
    }

    /** window.BookreelAndroid. Called on a background thread; anything touching views goes to the UI thread. */
    private inner class Bridge {
        private fun ours() = Links.isOurs(pageUrl)

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun share(title: String?, text: String?, url: String?) {
            val body = listOfNotNull(text?.takeIf { it.isNotBlank() }, url?.takeIf { it.isNotBlank() }).joinToString("\n")
            val send = Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_SUBJECT, title ?: "Bookreel")
                .putExtra(Intent.EXTRA_TEXT, body)
            runOnUiThread { startActivity(Intent.createChooser(send, "Share")) }
        }

        /** Colour behind the status and navigation bars, and light or dark icons on them. */
        @JavascriptInterface
        fun setBars(color: String?, dark: Boolean) {
            val c = try { Color.parseColor(color) } catch (e: Exception) { return }
            runOnUiThread {
                root.setBackgroundColor(c)
                web.setBackgroundColor(c)
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !dark
                    isAppearanceLightNavigationBars = !dark
                }
            }
        }

        /** "Release it to me tomorrow": a notification when the chapter unlocks. Returns "on", "asking" or "off". */
        @JavascriptInterface
        fun scheduleRelease(bookId: String?, at: String?, title: String?, text: String?, hash: String?): String {
            if (!ours() || bookId.isNullOrBlank()) return "off"
            val time = at?.toLongOrNull() ?: return "off"
            Release.schedule(this@MainActivity, bookId, time, title ?: "Your next chapter is ready", text ?: "", Links.safeHash(hash))
            if (Release.canNotify(this@MainActivity)) return "on"
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                runOnUiThread { askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS) }
                return "asking"
            }
            return "off"
        }

        @JavascriptInterface
        fun cancelRelease(bookId: String?) {
            if (ours() && !bookId.isNullOrBlank()) Release.cancel(this@MainActivity, bookId)
        }

        @JavascriptInterface
        fun notifications(): String = if (Release.canNotify(this@MainActivity)) "on" else "off"

        @JavascriptInterface
        fun openNotificationSettings() {
            val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            runOnUiThread {
                try { startActivity(i) } catch (e: ActivityNotFoundException) {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                }
            }
        }

        /** The earlier native app's progress, once; "" when there is none. */
        @JavascriptInterface
        fun oldProgress(): String = if (ours()) OldProgress.read(filesDir) ?: "" else ""

        @JavascriptInterface
        fun oldProgressDone() {
            if (ours()) OldProgress.done(filesDir)
        }
    }

    /** Ask for the screen's highest refresh rate (120 Hz on the Vivo V60) at the current resolution. */
    private fun preferHighestRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val d = display ?: return
        val current = d.mode
        val best = d.supportedModes
            .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
            .maxByOrNull { it.refreshRate } ?: return
        val attrs = window.attributes
        attrs.preferredDisplayModeId = best.modeId
        window.attributes = attrs
    }

    companion object {
        const val EXTRA_HASH = "hash"
        private val LIGHT_BG = Color.parseColor("#FBFBFC")
        private val DARK_BG = Color.parseColor("#111418")

        private val OFFLINE_PAGE = """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{font-family:sans-serif;margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
            justify-content:center;text-align:center;padding:24px;box-sizing:border-box;background:#FBFBFC;color:#16181D}
            h1{font-size:22px;margin:0 0 8px}p{color:#5a5f69;margin:0 0 24px;line-height:1.5}
            a{background:#F2753A;color:#16181D;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px}
            @media (prefers-color-scheme:dark){body{background:#111418;color:#F2EDE4}p{color:#a0a4ab}}</style></head>
            <body><h1>No internet connection</h1><p>Bookreel needs the internet the first time it opens.<br>
            After that, your books work offline.</p><a href="${Links.HOME}">Try again</a></body></html>
        """.trimIndent()
    }
}
