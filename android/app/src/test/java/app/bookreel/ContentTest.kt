package app.bookreel

import app.bookreel.data.BookIndex
import app.bookreel.data.BookRepository
import app.bookreel.data.CharacterPost
import app.bookreel.data.ChatPost
import app.bookreel.data.CliffPost
import app.bookreel.data.GuessPost
import app.bookreel.data.HookPost
import app.bookreel.data.IdeaPost
import app.bookreel.data.UnknownPost
import app.bookreel.data.isInteractive
import app.bookreel.data.readingText
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Validates every bundled book pack against the slot rules in the plan doc. */
class ContentTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val dir = File("src/main/assets/books")
    private val knownArt = setOf("parking", "board", "hill", "clock", "skyline", "trail", "dice", "house", "machine", "stamp", "drum", "bars", "chain")

    @Test fun indexParsesAndReadyBooksHaveFiles() {
        val index = json.decodeFromString(BookIndex.serializer(), File(dir, "index.json").readText())
        assertTrue(index.books.isNotEmpty())
        index.books.filter { it.status == "ready" }.forEach { b ->
            assertTrue("missing pack for ${b.id}", File(dir, b.file!!).exists())
        }
    }

    @Test fun everyPackFollowsTheFormat() {
        val index = json.decodeFromString(BookIndex.serializer(), File(dir, "index.json").readText())
        val problems = mutableListOf<String>()
        index.books.filter { it.status == "ready" }.forEach { meta ->
            val book = BookRepository.parse(json, File(dir, meta.file!!).readText())
            val ids = mutableSetOf<String>()
            val loops = mutableMapOf<String, Int>()
            val payoffs = mutableMapOf<String, Int>()
            if (book.chapterCount != 20) problems += "${meta.id}: ${book.chapterCount} chapters"
            book.book.chapters.forEachIndexed { ci, ch ->
                val n = ci + 1
                if (ch.n != n) problems += "${meta.id}: chapter numbering at $n"
                if (ch.recap.size != 3) problems += "${meta.id} ch$n: recap needs 3 lines"
                val posts = book.postsOf(n)
                if (posts.size != 10) problems += "${meta.id} ch$n: ${posts.size} posts"
                if (posts.firstOrNull() !is HookPost) problems += "${meta.id} ch$n: post 1 is not a hook"
                if (posts.lastOrNull() !is CliffPost) problems += "${meta.id} ch$n: post 10 is not a cliffhanger"
                val interactive = posts.count { it.isInteractive }
                if (interactive !in 1..2) problems += "${meta.id} ch$n: $interactive interactive posts"
                posts.forEachIndexed { i, p ->
                    val where = "${meta.id} ${p.id}"
                    if (p.id != "$n-${i + 1}") problems += "$where: id should be $n-${i + 1}"
                    if (!ids.add(p.id)) problems += "$where: duplicate id"
                    if (p is UnknownPost) problems += "$where: unknown or malformed post"
                    if (p.t.isBlank()) problems += "$where: missing title"
                    val words = p.readingText().split(Regex("\\s+")).count { it.isNotBlank() }
                    if (words > 85) problems += "$where: $words words (max 85)"
                    if (i > 0 && posts[i - 1]::class == p::class && p !is app.bookreel.data.ScenePost) problems += "$where: same type twice in a row"
                    if (p is HookPost && p.art !in knownArt) problems += "$where: unknown art ${p.art}"
                    if (p is ChatPost) p.msgs.forEach { m -> if (book.character(m.who) == null) problems += "$where: unknown speaker ${m.who}" }
                    if (p is CharacterPost && book.character(p.charId) == null) problems += "$where: unknown character ${p.charId}"
                    if (p is GuessPost) loops[p.loopId] = n
                    if (p is IdeaPost && p.payoffLoopId != null) payoffs[p.payoffLoopId] = n
                }
            }
            loops.forEach { (loop, n) ->
                val pay = payoffs[loop]
                if (pay == null || pay <= n) problems += "${meta.id}: guess loop $loop has no later payoff"
            }
        }
        assertEquals("Content problems:\n" + problems.joinToString("\n"), 0, problems.size)
    }
}
