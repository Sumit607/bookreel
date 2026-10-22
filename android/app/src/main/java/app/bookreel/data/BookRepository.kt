package app.bookreel.data

import android.content.Context
import app.bookreel.BuildConfig
import kotlinx.serialization.json.Json
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The library and its book packs. Packs bundled in the APK work offline from the first launch;
 * [sync] then fetches the website's library (bookreel-sand.vercel.app/books/) so books added
 * after this APK was built appear without reinstalling. Each pack is parsed once.
 */
class BookRepository(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val cache = HashMap<String, LoadedBook>()
    private val dir = File(context.filesDir, "books")
    private val metaFile = File(dir, "sync.json")

    private val bundled: BookIndex by lazy { json.decodeFromString(BookIndex.serializer(), asset("index.json")!!) }

    @Volatile private var current: BookIndex? = null

    /** Runs once, before anything is read: a newer APK carries newer bundled packs, so downloads
     *  saved under an older build are dropped (the next sync fetches anything newer again). */
    private val fresh: Boolean by lazy {
        if (readMeta().app != BuildConfig.VERSION_CODE) dir.listFiles()?.forEach { it.delete() }
        true
    }

    /** The library to show: the bundled list, or the website's once a sync has saved it. */
    val index: BookIndex
        get() = current ?: synchronized(this) { current ?: run { fresh; loadIndex() }.also { current = it } }

    fun book(id: String): LoadedBook? {
        synchronized(cache) { cache[id]?.let { return it } }
        val meta = index.books.firstOrNull { it.id == id } ?: return null
        val file = meta.file ?: return null
        val text = packText(file) ?: return null
        val loaded = try { parse(json, text) } catch (e: Exception) { return null }
        synchronized(cache) { cache[id] = loaded }
        return loaded
    }

    /**
     * Downloads the website's library and any new or changed packs (ETags keep repeat checks to a few
     * hundred bytes). Packs are checked before they are saved and written atomically, the list last.
     * Returns null when offline or when nothing changed. Call off the main thread; never throws.
     */
    fun sync(): SyncResult? {
        try {
            val before = index
            dir.mkdirs()
            val etags = readMeta().etags.toMutableMap()
            val savedList = File(dir, "index.json")
            val list = fetch("index.json", etags["index.json"]?.takeIf { savedList.exists() }) ?: return null
            val remoteText = list.text ?: savedList.readText()
            val remote = json.decodeFromString(BookIndex.serializer(), remoteText)
            val changed = mutableSetOf<String>()
            for (m in remote.books) {
                val file = m.file ?: continue
                if (m.status != "ready" || !BookSync.safeFile(file)) continue
                val saved = File(dir, file)
                val got = fetch(file, etags[file]?.takeIf { saved.exists() }) ?: continue
                val text = got.text ?: continue // 304: the saved copy is current
                if (BookSync.problem(json, m.id, text) != null) continue
                if (text != packText(file)) changed += m.id
                writeAtomic(saved, text)
                val tag = got.etag
                if (tag != null) etags[file] = tag else etags.remove(file)
            }
            if (list.text != null) {
                writeAtomic(savedList, remoteText)
                val tag = list.etag
                if (tag != null) etags["index.json"] = tag else etags.remove("index.json")
            }
            writeAtomic(metaFile, json.encodeToString(SyncMeta.serializer(), SyncMeta(BuildConfig.VERSION_CODE, etags)))

            val next = loadIndex()
            synchronized(cache) { changed.forEach { cache.remove(it) } }
            current = next
            return if (next != before || changed.isNotEmpty()) SyncResult(next, changed) else null
        } catch (e: Exception) {
            return null
        }
    }

    // ---------- files ----------

    private fun loadIndex(): BookIndex {
        val remote = File(dir, "index.json").takeIf { it.exists() }?.let {
            try { json.decodeFromString(BookIndex.serializer(), it.readText()) } catch (e: Exception) { null }
        }
        return BookSync.merge(bundled, remote) { file -> File(dir, file).exists() || assetExists(file) }
    }

    /** A downloaded copy wins over the bundled one; downloads are cleared whenever the app is updated. */
    private fun packText(file: String): String? {
        val saved = File(dir, file)
        if (saved.exists()) return try { saved.readText() } catch (e: Exception) { null }
        return asset(file)
    }

    private fun asset(name: String): String? =
        try { context.assets.open("books/$name").use { it.readBytes().decodeToString() } } catch (e: Exception) { null }

    private fun assetExists(name: String): Boolean =
        try { context.assets.open("books/$name").close(); true } catch (e: Exception) { false }

    private fun readMeta(): SyncMeta =
        try { json.decodeFromString(SyncMeta.serializer(), metaFile.readText()) } catch (e: Exception) { SyncMeta() }

    private fun writeAtomic(target: File, text: String) {
        val tmp = File(target.parentFile, target.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(target)) {
            target.delete()
            tmp.renameTo(target)
        }
    }

    // ---------- network ----------

    private class Fetched(val text: String?, val etag: String?)

    /** GET a file from the website. A 304 gives text = null. Null on any failure. */
    private fun fetch(name: String, etag: String?): Fetched? = try {
        val c = URL(BuildConfig.BOOKS_URL + name).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8_000
            c.readTimeout = 20_000
            c.setRequestProperty("Accept", "application/json")
            if (etag != null) c.setRequestProperty("If-None-Match", etag)
            when (c.responseCode) {
                HttpURLConnection.HTTP_NOT_MODIFIED -> Fetched(null, etag)
                HttpURLConnection.HTTP_OK -> {
                    val bytes = c.inputStream.use { it.readBytes() }
                    if (bytes.size > BookSync.MAX_PACK_CHARS * 2) null else Fetched(bytes.decodeToString(), c.getHeaderField("ETag"))
                }
                else -> null
            }
        } finally {
            c.disconnect()
        }
    } catch (e: Exception) {
        null
    }

    companion object {
        fun parse(json: Json, text: String): LoadedBook {
            val book = json.decodeFromString(Book.serializer(), text)
            val posts = book.chapters.map { ch -> ch.posts.map { PostDecoder.decode(json, it) } }
            return LoadedBook(book, posts)
        }
    }
}
