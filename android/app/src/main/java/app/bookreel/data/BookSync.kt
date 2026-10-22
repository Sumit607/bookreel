package app.bookreel.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Rules for books that arrive from the website instead of inside the APK. Kept free of Android
 * classes so the unit tests can run them.
 */
object BookSync {
    /** Pack file names the website may name: plain "some-book.json", never a path. */
    private val SAFE_FILE = Regex("^[a-z0-9][a-z0-9-]{0,80}\\.json$")

    fun safeFile(name: String?): Boolean = name != null && SAFE_FILE.matches(name)

    /**
     * Returns null when a downloaded pack is fit to show, otherwise what is wrong with it. A pack this
     * version of the app cannot fully read (a post type it does not know) is refused, so an old app
     * keeps the copy it has instead of showing broken posts.
     */
    fun problem(json: Json, id: String, text: String): String? {
        if (text.length > MAX_PACK_CHARS) return "pack too large"
        val book = try {
            BookRepository.parse(json, text)
        } catch (e: Exception) {
            return "pack does not parse"
        }
        if (book.id != id) return "pack is for ${book.id}, not $id"
        if (book.chapterCount == 0) return "pack has no chapters"
        book.posts.forEachIndexed { i, posts ->
            if (posts.isEmpty()) return "chapter ${i + 1} has no posts"
            posts.firstOrNull { it is UnknownPost }?.let { return "post ${it.id} needs a newer app" }
        }
        return null
    }

    /**
     * The library to show. The website's list wins, but a book is only "ready" when its pack is on
     * the phone (bundled or downloaded); otherwise it shows as coming soon. Ready books bundled in
     * the APK that the website no longer lists stay, so nothing a reader started disappears.
     */
    fun merge(bundled: BookIndex, remote: BookIndex?, hasPack: (String) -> Boolean): BookIndex {
        if (remote == null) return bundled
        val books = remote.books.map { m ->
            val playable = m.file != null && safeFile(m.file) && hasPack(m.file)
            if (m.status == "ready" && !playable) m.copy(status = "soon") else m
        }
        val listed = books.map { it.id }.toSet()
        val kept = bundled.books.filter { it.status == "ready" && it.id !in listed }
        return BookIndex(books + kept)
    }

    const val MAX_PACK_CHARS = 5_000_000
}

/** What the last download left on the phone: the app build it ran under and each file's ETag. */
@Serializable
data class SyncMeta(val app: Int = 0, val etags: Map<String, String> = emptyMap())

/** One download: the text (null for "not modified") and the ETag to send next time. */
class Fetched(val text: String?, val etag: String?)

/** The outcome of one sync: the library to show now and the books whose packs changed. */
class SyncResult(val index: BookIndex, val changed: Set<String>)
