package app.bookreel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class LinksTest {
    @Test fun bookreelPagesOpenInTheApp() {
        assertTrue(Links.isOurs("https://bookreel-sand.vercel.app/"))
        assertTrue(Links.isOurs("https://bookreel-sand.vercel.app/#/read/the-goal/2?p=3"))
        assertTrue(Links.isOurs("https://bookreel-sand.vercel.app/books/index.json"))
        assertTrue(Links.isOurs("https://BOOKREEL-SAND.vercel.app/"))
    }

    @Test fun everythingElseOpensInTheBrowser() {
        assertFalse(Links.isOurs("https://bookreel-sand.vercel.app/apk")) // the APK download
        assertFalse(Links.isOurs("http://bookreel-sand.vercel.app/")) // not https
        assertFalse(Links.isOurs("https://www.gutenberg.org/ebooks/132"))
        assertFalse(Links.isOurs("https://bookreel-sand.vercel.app.evil.example/"))
        assertFalse(Links.isOurs("https://evil.example/?u=https://bookreel-sand.vercel.app/"))
        assertFalse(Links.isOurs("javascript:alert(1)"))
        assertFalse(Links.isOurs("data:text/html,hi"))
        assertFalse(Links.isOurs(null))
        assertFalse(Links.isOurs("not a url"))
    }

    @Test fun notificationLinksStayInsideTheApp() {
        assertEquals("#/read/the-goal/2", Links.safeHash("#/read/the-goal/2"))
        assertEquals("#/book/the-art-of-war", Links.safeHash("#/book/the-art-of-war"))
        assertEquals("#/", Links.safeHash("javascript:alert(1)"))
        assertEquals("#/", Links.safeHash("#/x'); alert(1); ('"))
        assertEquals("#/", Links.safeHash(null))
        assertEquals("https://bookreel-sand.vercel.app/", Links.startUrl(null))
        assertEquals("https://bookreel-sand.vercel.app/#/read/the-goal/2", Links.startUrl("#/read/the-goal/2"))
    }

    @Test fun oldProgressIsHandedOverOnce() {
        val dir = Files.createTempDirectory("files").toFile()
        assertNull(OldProgress.read(dir))
        File(dir, "state.json").writeText("""{"progress":{"the-goal:1":9}}""")
        File(dir, "books").mkdirs()
        File(dir, "books/the-art-of-war.json").writeText("{}")
        assertEquals("""{"progress":{"the-goal:1":9}}""", OldProgress.read(dir))
        OldProgress.done(dir)
        assertNull(OldProgress.read(dir))
        assertTrue(File(dir, "state.migrated.json").exists())
        assertFalse(File(dir, "books").exists())
    }

    @Test fun aDamagedOldFileIsIgnored() {
        val dir = Files.createTempDirectory("files").toFile()
        File(dir, "state.json").writeText("\u0000garbage")
        assertNull(OldProgress.read(dir))
    }
}
