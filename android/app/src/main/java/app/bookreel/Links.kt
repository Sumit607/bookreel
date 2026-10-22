package app.bookreel

import java.io.File
import java.net.URI

/** Which addresses the app shows itself, and where a notification may take the reader. Pure, so unit-tested. */
object Links {
    const val HOST = "bookreel-sand.vercel.app"
    const val HOME = "https://$HOST/"

    private val HASH = Regex("^#/[A-Za-z0-9/?=._-]{0,200}$")

    /** Bookreel's own pages open in the app; book sources, the APK download and everything else open in the browser. */
    fun isOurs(url: String?): Boolean {
        val u = try { URI(url ?: return false) } catch (e: Exception) { return false }
        if (u.scheme != "https" || !u.host.equals(HOST, ignoreCase = true)) return false
        val path = u.rawPath ?: ""
        return path != "/apk" && !path.startsWith("/apk/")
    }

    /** A route inside the web app such as "#/read/the-goal/2"; anything unexpected becomes the library. */
    fun safeHash(hash: String?): String = if (hash != null && HASH.matches(hash)) hash else "#/"

    /** Where the app starts: the library, or the chapter a notification points to. */
    fun startUrl(hash: String?): String = safeHash(hash).let { if (it == "#/") HOME else HOME + it }
}

/**
 * Progress saved by the earlier, fully native app (files/state.json). The web app takes it over on its
 * first start inside the shell; afterwards the file is renamed so it is never taken over twice.
 */
object OldProgress {
    fun read(dir: File): String? {
        val f = File(dir, "state.json")
        if (!f.isFile) return null
        return try { f.readText().takeIf { it.trimStart().startsWith("{") } } catch (e: Exception) { null }
    }

    fun done(dir: File) {
        val f = File(dir, "state.json")
        if (f.exists() && !f.renameTo(File(dir, "state.migrated.json"))) f.delete()
        File(dir, "books").deleteRecursively() // book packs the native app downloaded; the website serves them now
    }
}
