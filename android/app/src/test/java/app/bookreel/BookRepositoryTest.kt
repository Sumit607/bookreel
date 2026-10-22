package app.bookreel

import app.bookreel.data.BookIndex
import app.bookreel.data.BookRepository
import app.bookreel.data.BundledFiles
import app.bookreel.data.Fetched
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * An APK built before The Art of War existed, talking to a website that has it: the book must
 * become readable after one sync, stay readable offline, and repeat checks must download nothing.
 */
class BookRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val assets = File("src/main/assets/books")
    private val newBook = "the-art-of-war"

    /** The bundled files of an older APK: the same library, with the new book still "coming soon". */
    private val oldApk = object : BundledFiles {
        private val index = json.decodeFromString(BookIndex.serializer(), File(assets, "index.json").readText()).let { idx ->
            BookIndex(idx.books.map { if (it.id == newBook) it.copy(status = "soon", file = null) else it })
        }
        override fun read(name: String): String? = when {
            name == "index.json" -> json.encodeToString(BookIndex.serializer(), index)
            name == "$newBook.json" -> null
            else -> File(assets, name).takeIf { it.exists() }?.readText()
        }
        override fun has(name: String) = name != "$newBook.json" && File(assets, name).exists()
    }

    /** The website: serves today's files with ETags and answers 304 when the ETag still matches. */
    private class Website(private val dir: File, private val broken: Set<String> = emptySet()) {
        var downloads = 0
        var online = true
        fun get(name: String, etag: String?): Fetched? {
            if (!online) return null
            val f = File(dir, name).takeIf { it.exists() } ?: return null
            val text = if (name in broken) "{ not a book" else f.readText()
            val tag = "\"" + text.hashCode().toString(16) + "\""
            if (etag == tag) return Fetched(null, tag)
            downloads++
            return Fetched(text, tag)
        }
    }

    private fun tempDir(): File = Files.createTempDirectory("books").toFile()
    private fun repo(dir: File, site: Website, version: Int = 11) = BookRepository(dir, oldApk, site::get, version)
    private fun status(r: BookRepository, id: String) = r.index.books.first { it.id == id }.status

    @Test fun newBookFromTheWebsiteBecomesReadable() {
        val dir = tempDir()
        val site = Website(assets)
        val r = repo(dir, site)
        assertEquals("soon", status(r, newBook))
        assertNull(r.book(newBook))

        val result = r.sync()
        assertNotNull(result)
        assertEquals("ready", result!!.index.books.first { it.id == newBook }.status)
        assertEquals(setOf(newBook), result.changed) // the bundled books were already current
        assertEquals("ready", status(r, newBook))
        assertEquals(20, r.book(newBook)!!.chapterCount)
        assertEquals(20, r.book("the-goal")!!.chapterCount)

        // A second check finds nothing new and downloads nothing.
        val before = site.downloads
        assertNull(r.sync())
        assertEquals(before, site.downloads)

        // Next launch, offline: the downloaded book is still there.
        site.online = false
        val later = repo(dir, site)
        assertEquals("ready", status(later, newBook))
        assertEquals(20, later.book(newBook)!!.chapterCount)
        assertNull(later.sync())
    }

    @Test fun updatingTheAppDropsOldDownloads() {
        val dir = tempDir()
        val site = Website(assets)
        repo(dir, site, version = 11).sync()
        assertTrue(File(dir, "$newBook.json").exists())
        val updated = repo(dir, site, version = 12)
        assertEquals("soon", status(updated, newBook)) // this fake "new APK" does not bundle it
        assertFalse(File(dir, "$newBook.json").exists())
        assertNotNull(updated.sync())
        assertEquals("ready", status(updated, newBook))
    }

    @Test fun offlineKeepsTheBundledLibrary() {
        val site = Website(assets).apply { online = false }
        val r = repo(tempDir(), site)
        val before = r.index
        assertNull(r.sync())
        assertEquals(before, r.index)
    }

    @Test fun brokenDownloadIsNotSaved() {
        val dir = tempDir()
        val r = repo(dir, Website(assets, broken = setOf("$newBook.json")))
        r.sync()
        assertEquals("soon", status(r, newBook))
        assertFalse(File(dir, "$newBook.json").exists())
        assertEquals("ready", status(r, "the-goal"))
    }
}
