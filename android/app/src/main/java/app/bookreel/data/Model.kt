package app.bookreel.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** The library list shipped in assets/books/index.json. */
@Serializable
data class BookIndex(val books: List<BookMeta>)

@Serializable
data class BookMeta(
    val id: String,
    val title: String,
    val authors: List<String>,
    val category: String,
    val blurb: String,
    val hook: String,
    /** "ready" = playable pack in the APK, "soon" = shown with its hook only. */
    val status: String,
    val file: String? = null,
    val minutes: Int = 60,
    val cover: CoverStyle,
)

@Serializable
data class CoverStyle(val bg: String, val fg: String, val motif: String, val tag: String)

/** A book pack (schema v1, see content/schema/book.schema.json). */
@Serializable
data class Book(
    val schemaVersion: Int = 1,
    val id: String,
    val packVersion: Int = 1,
    val title: String,
    val authors: List<String>,
    val category: String = "",
    val blurb: String = "",
    val narrator: String = "",
    val rights: Rights = Rights(),
    val characters: List<CharacterInfo> = emptyList(),
    val chapters: List<Chapter>,
)

@Serializable
data class Rights(val status: String = "private-test", val source: String = "user-upload")

@Serializable
data class CharacterInfo(
    val id: String,
    val name: String,
    val short: String,
    val initials: String,
    val role: String,
    val color: String,
    val firstChapter: Int,
    val bio: String = "",
    val traits: List<String> = emptyList(),
)

@Serializable
data class Chapter(
    val n: Int,
    val title: String,
    val hook: String,
    val bg: String,
    val bg2: String? = null,
    val fg: String,
    val minutes: Int = 3,
    val recap: List<String> = emptyList(),
    val posts: List<JsonObject>,
)

/** A book with its posts decoded once, kept in memory while the app runs. */
class LoadedBook(val book: Book, val posts: List<List<Post>>) {
    val id: String get() = book.id
    val chapterCount: Int get() = book.chapters.size
    fun chapter(n: Int): Chapter = book.chapters[n - 1]
    fun postsOf(n: Int): List<Post> = posts[n - 1]
    fun character(id: String): CharacterInfo? = book.characters.firstOrNull { it.id == id }
}
