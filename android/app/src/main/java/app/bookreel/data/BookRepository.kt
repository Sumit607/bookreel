package app.bookreel.data

import android.content.Context
import kotlinx.serialization.json.Json

/** Reads the library index and book packs bundled in the APK. Each pack is parsed once. */
class BookRepository(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val cache = HashMap<String, LoadedBook>()

    val index: BookIndex by lazy {
        val text = context.assets.open("books/index.json").use { it.readBytes().decodeToString() }
        json.decodeFromString(BookIndex.serializer(), text)
    }

    fun book(id: String): LoadedBook? {
        synchronized(cache) { cache[id]?.let { return it } }
        val meta = index.books.firstOrNull { it.id == id } ?: return null
        val file = meta.file ?: return null
        val text = context.assets.open("books/$file").use { it.readBytes().decodeToString() }
        val loaded = parse(json, text)
        synchronized(cache) { cache[id] = loaded }
        return loaded
    }

    companion object {
        fun parse(json: Json, text: String): LoadedBook {
            val book = json.decodeFromString(Book.serializer(), text)
            val posts = book.chapters.map { ch -> ch.posts.map { PostDecoder.decode(json, it) } }
            return LoadedBook(book, posts)
        }
    }
}
