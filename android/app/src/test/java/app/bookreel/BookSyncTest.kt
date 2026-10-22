package app.bookreel

import app.bookreel.data.BookIndex
import app.bookreel.data.BookMeta
import app.bookreel.data.BookSync
import app.bookreel.data.CoverStyle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Books that arrive from the website: which ones show as ready, and which packs are refused. */
class BookSyncTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val dir = File("src/main/assets/books")

    private fun meta(id: String, status: String, file: String? = "$id.json") =
        BookMeta(id, id, listOf("A"), "Test", "b", "h", status, file, 60, CoverStyle("#000", "#fff", "sun", "Test"))

    @Test fun websiteBookWithAPackOnThePhoneIsReady() {
        val bundled = BookIndex(listOf(meta("a", "ready")))
        val remote = BookIndex(listOf(meta("a", "ready"), meta("b", "ready")))
        val merged = BookSync.merge(bundled, remote) { true }
        assertEquals(listOf("a" to "ready", "b" to "ready"), merged.books.map { it.id to it.status })
    }

    @Test fun websiteBookWithoutAPackShowsAsComingSoon() {
        val bundled = BookIndex(listOf(meta("a", "ready")))
        val remote = BookIndex(listOf(meta("a", "ready"), meta("b", "ready")))
        val merged = BookSync.merge(bundled, remote) { it == "a.json" }
        assertEquals("soon", merged.books.first { it.id == "b" }.status)
    }

    @Test fun bundledReadyBookTheWebsiteDropsIsKept() {
        val bundled = BookIndex(listOf(meta("a", "ready"), meta("old", "ready")))
        val remote = BookIndex(listOf(meta("a", "ready")))
        val merged = BookSync.merge(bundled, remote) { true }
        assertEquals(listOf("a", "old"), merged.books.map { it.id })
    }

    @Test fun noWebsiteListMeansTheBundledOne() {
        val bundled = BookIndex(listOf(meta("a", "ready"), meta("s", "soon", null)))
        assertEquals(bundled, BookSync.merge(bundled, null) { false })
    }

    @Test fun packNamesCannotEscapeTheBooksFolder() {
        assertTrue(BookSync.safeFile("the-art-of-war.json"))
        assertFalse(BookSync.safeFile("../state.json"))
        assertFalse(BookSync.safeFile("books/x.json"))
        assertFalse(BookSync.safeFile(null))
        val remote = BookIndex(listOf(meta("x", "ready", "../state.json")))
        assertEquals("soon", BookSync.merge(BookIndex(emptyList()), remote) { true }.books[0].status)
    }

    @Test fun everyBundledPackPassesTheDownloadCheck() {
        val index = json.decodeFromString(BookIndex.serializer(), File(dir, "index.json").readText())
        index.books.filter { it.status == "ready" }.forEach { m ->
            assertNull(m.id, BookSync.problem(json, m.id, File(dir, m.file!!).readText()))
        }
    }

    @Test fun brokenOrMismatchedPacksAreRefused() {
        val text = File(dir, "the-art-of-war.json").readText()
        assertNotNull(BookSync.problem(json, "the-goal", text))
        assertNotNull(BookSync.problem(json, "the-art-of-war", text.take(5000)))
        assertNotNull(BookSync.problem(json, "the-art-of-war", "not json"))
    }

    @Test fun packWithAPostTypeThisAppCannotShowIsRefused() {
        val book = json.parseToJsonElement(File(dir, "the-art-of-war.json").readText()).jsonObject
        val chapters = book["chapters"]!!.jsonArray
        val ch1 = chapters[0].jsonObject
        val posts = ch1["posts"]!!.jsonArray.toMutableList()
        posts[1] = JsonObject(mapOf("id" to JsonPrimitive("1-2"), "type" to JsonPrimitive("hologram"), "t" to JsonPrimitive("New")))
        val newCh1 = JsonObject(ch1 + ("posts" to kotlinx.serialization.json.JsonArray(posts)))
        val newBook = JsonObject(book + ("chapters" to kotlinx.serialization.json.JsonArray(listOf(newCh1) + chapters.drop(1))))
        assertNotNull(BookSync.problem(json, "the-art-of-war", newBook.toString()))
    }
}
