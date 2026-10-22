package app.bookreel.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.bookreel.BookreelApp
import app.bookreel.data.BookMeta
import app.bookreel.data.GuessPost
import app.bookreel.data.LastOpened
import app.bookreel.data.LoadedBook
import app.bookreel.data.SavedPost
import app.bookreel.data.Settings
import app.bookreel.data.UserState
import app.bookreel.domain.ChapterLock
import app.bookreel.domain.Rules
import app.bookreel.notify.ReleaseScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.ZoneId

sealed interface Screen {
    data object Library : Screen
    data object Notebook : Screen
    data object Profile : Screen
    data class BookPage(val bookId: String) : Screen
    data class Reader(val bookId: String, val ch: Int, val startPost: Int, val previewOnly: Boolean) : Screen
    data class Complete(val bookId: String, val ch: Int, val xpGained: Int) : Screen
}

sealed interface Sheet {
    data class Locked(val bookId: String, val ch: Int) : Sheet
    data class Character(val bookId: String, val charId: String) : Sheet
    data class ComingSoon(val meta: BookMeta) : Sheet
    data object HowItWorks : Sheet
    data class BookBadge(val bookId: String) : Sheet
    data object ConfirmReset : Sheet
}

class AppViewModel(private val app: BookreelApp) : ViewModel() {
    private val store = app.store
    val state: StateFlow<UserState> = store.state
    /** The library list. Starts as the bundled one; replaced when the website has new or changed books. */
    var index by mutableStateOf(app.repo.index)
        private set
    val books = mutableStateMapOf<String, LoadedBook>()

    var stack by mutableStateOf(listOf<Screen>(Screen.Library))
        private set
    var sheet by mutableStateOf<Sheet?>(null)
    var toast by mutableStateOf<String?>(null)
        private set
    var query by mutableStateOf("")
    var category by mutableStateOf("All")
    private var toastJob: Job? = null

    val zone: ZoneId get() = ZoneId.systemDefault()
    fun now() = System.currentTimeMillis()

    init {
        // Parse book packs off the main thread right away; the library renders from the index meanwhile.
        // Then ask the website for books added since this APK was built (in this order, so a book
        // parsed from the old copy never overwrites a fresh download).
        viewModelScope.launch {
            val loaded = withContext(Dispatchers.Default) {
                index.books.filter { it.status == "ready" }.mapNotNull { app.repo.book(it.id) }
            }
            loaded.forEach { books[it.id] = it }
            booksLoaded = true
            refreshBooks(force = true)
        }
    }

    private var booksLoaded = false
    private var syncing = false
    private var lastSyncAt = 0L

    /**
     * Asks the website for new or changed books: once at launch, then whenever the app comes back
     * to the front, at most every [SYNC_EVERY_MS]. Call on the main thread.
     */
    fun refreshBooks(force: Boolean = false) {
        val now = android.os.SystemClock.elapsedRealtime()
        if (!booksLoaded || syncing || (!force && now - lastSyncAt < SYNC_EVERY_MS)) return
        syncing = true
        lastSyncAt = now
        viewModelScope.launch {
            try { syncBooks() } finally { syncing = false }
        }
    }

    private suspend fun syncBooks() {
        val result = withContext(Dispatchers.IO) { app.repo.sync() } ?: return
        val wasReady = index.books.filter { it.status == "ready" }.map { it.id }.toSet()
        val fresh = withContext(Dispatchers.Default) {
            result.index.books
                .filter { it.status == "ready" && (it.id in result.changed || it.id !in books) }
                .mapNotNull { app.repo.book(it.id) }
        }
        fresh.forEach { books[it.id] = it }
        index = result.index
        val added = result.index.books.filter { it.status == "ready" && it.id !in wasReady }
        when {
            added.size == 1 -> showToast("New in your library: ${added[0].title}")
            added.size > 1 -> showToast("${added.size} new books in your library")
        }
    }

    // ---------- navigation ----------
    val top: Screen get() = stack.last()

    fun navigate(s: Screen) { stack = stack + s }
    private fun replaceTop(s: Screen) { stack = stack.dropLast(1) + s }
    fun setTab(s: Screen) { stack = listOf(s); sheet = null }

    /** Returns false when there is nothing left to go back to (the system then closes the app). */
    fun back(): Boolean {
        if (sheet != null) { sheet = null; return true }
        if (stack.size > 1) { stack = stack.dropLast(1); return true }
        if (top != Screen.Library) { stack = listOf(Screen.Library); return true }
        return false
    }

    fun showToast(msg: String) {
        toast = msg
        toastJob?.cancel()
        toastJob = viewModelScope.launch { delay(2600); toast = null }
    }

    // ---------- books ----------
    fun openBook(meta: BookMeta) {
        if (meta.status != "ready") { sheet = Sheet.ComingSoon(meta); return }
        navigate(Screen.BookPage(meta.id))
    }

    fun lock(bookId: String, ch: Int): ChapterLock = Rules.lockState(state.value, bookId, ch, now(), zone)

    fun resumePost(bookId: String, ch: Int): Int {
        if (Rules.isComplete(state.value, bookId, ch)) return 0
        return state.value.progress[Rules.key(bookId, ch)] ?: 0
    }

    /** The chapter a reader should continue with: the first one not yet finished. */
    fun nextChapter(bookId: String): Int {
        val book = books[bookId] ?: return 1
        for (n in 1..book.chapterCount) if (!Rules.isComplete(state.value, bookId, n)) return n
        return book.chapterCount
    }

    fun openChapter(bookId: String, ch: Int, post: Int? = null, fromSheet: Boolean = false) {
        sheet = null
        val l = lock(bookId, ch)
        if (l != ChapterLock.Open && !fromSheet) { sheet = Sheet.Locked(bookId, ch); return }
        val preview = l != ChapterLock.Open
        val start = if (preview) 0 else post ?: resumePost(bookId, ch)
        val screen = Screen.Reader(bookId, ch, start, preview)
        if (top is Screen.Reader || top is Screen.Complete) replaceTop(screen) else navigate(screen)
    }

    fun showLocked(bookId: String, ch: Int) { sheet = Sheet.Locked(bookId, ch) }

    /** "Read Chapter n now" on the complete screen: reading now beats waiting, so switch the book to Binge. */
    fun readNow(bookId: String, ch: Int) {
        if (Rules.mode(state.value, bookId) != Rules.BINGE) store.update { it.copy(modes = it.modes + (bookId to Rules.BINGE)) }
        openChapter(bookId, ch, 0)
    }

    fun onPostSettled(bookId: String, ch: Int, index: Int) {
        store.update {
            it.copy(
                progress = it.progress + (Rules.key(bookId, ch) to index),
                lastOpened = LastOpened(bookId, ch, index),
            )
        }
    }

    fun markViewed(bookId: String, ch: Int, index: Int) {
        val k = Rules.key(bookId, ch)
        store.update {
            val seen = it.viewed[k].orEmpty()
            if (index in seen) it else it.copy(viewed = it.viewed + (k to (seen + index)))
        }
    }

    fun finishChapter(bookId: String, ch: Int) {
        val book = books[bookId] ?: return
        var gained = 0
        store.update { s ->
            val viewed = s.viewed[Rules.key(bookId, ch)].orEmpty().size
            val r = Rules.complete(s, bookId, ch, book.chapterCount, viewed, now(), zone)
            gained = r.xpGained
            r.state.copy(lastOpened = if (ch < book.chapterCount) LastOpened(bookId, ch + 1, 0) else s.lastOpened)
        }
        replaceTop(Screen.Complete(bookId, ch, gained))
    }

    // ---------- interactions ----------
    fun answer(bookId: String, ch: Int, index: Int, option: Int) {
        val book = books[bookId] ?: return
        val post = book.postsOf(ch)[index]
        val k = Rules.postKey(bookId, post.id)
        store.update { s ->
            if (s.answers.containsKey(k)) return@update s
            var next = s.copy(answers = s.answers + (k to option))
            if (post is GuessPost) {
                next = next.copy(guesses = next.guesses + (Rules.postKey(bookId, post.loopId) to post.options[option].text))
            }
            Rules.answerXp(next, k)
        }
    }

    fun crossOff(bookId: String, postId: String, item: Int, total: Int) {
        val k = Rules.postKey(bookId, postId)
        store.update { s ->
            val cur = s.crossed[k].orEmpty()
            if (item in cur) return@update s
            val next = s.copy(crossed = s.crossed + (k to (cur + item)))
            if (cur.size + 1 >= total) Rules.answerXp(next, k) else next
        }
    }

    fun toggleLike(bookId: String, postId: String) {
        val k = Rules.postKey(bookId, postId)
        store.update { s -> s.copy(likes = if (k in s.likes) s.likes - k else s.likes + k) }
    }

    fun toggleSave(bookId: String, ch: Int, index: Int, postId: String) {
        val k = Rules.postKey(bookId, postId)
        val saved = state.value.saves.containsKey(k)
        store.update { s ->
            if (saved) s.copy(saves = s.saves - k)
            else s.copy(saves = s.saves + (k to SavedPost(bookId, ch, index, now())))
        }
        showToast(if (saved) "Removed from your notebook" else "Saved to your notebook")
    }

    // ---------- release mode ----------
    fun setMode(bookId: String, mode: String) {
        store.update { it.copy(modes = it.modes + (bookId to mode)) }
        showToast(if (mode == Rules.DAILY) "Daily mode: one chapter a day at ${hourLabel(state.value.settings.releaseHour)}" else "Binge mode: next chapter opens right away")
    }

    /** Called from the chapter-complete screen: switch to Daily and schedule tomorrow's reminder. */
    fun releaseTomorrow(context: Context, bookId: String, finishedCh: Int) {
        val book = books[bookId] ?: return
        store.update { it.copy(modes = it.modes + (bookId to Rules.DAILY)) }
        val done = state.value.completions[Rules.key(bookId, finishedCh)] ?: return
        val at = Rules.releaseAt(done.at, state.value.settings.releaseHour, zone)
        if (finishedCh < book.chapterCount) {
            val next = book.chapter(finishedCh + 1)
            ReleaseScheduler.ensureChannel(context)
            ReleaseScheduler.schedule(
                context, at,
                "Chapter ${next.n} of ${book.book.title} is ready",
                next.hook,
            )
            store.update { it.copy(reminders = it.reminders + (bookId to at)) }
        }
        showToast("Chapter ${finishedCh + 1} unlocks ${timeLabel(at)}")
    }

    // ---------- settings ----------
    fun updateSettings(change: (Settings) -> Settings) = store.update { it.copy(settings = change(it.settings)) }

    fun resetProgress() {
        val keep = state.value.settings
        store.update { UserState(settings = keep) }
        sheet = null
        setTab(Screen.Library)
        showToast("Progress reset")
    }

    fun hourLabel(h: Int): String = when {
        h == 0 -> "12 AM"
        h < 12 -> "$h AM"
        h == 12 -> "12 PM"
        else -> "${h - 12} PM"
    }

    fun timeLabel(at: Long): String {
        val dt = java.time.Instant.ofEpochMilli(at).atZone(zone)
        val today = java.time.LocalDate.now(zone)
        val day = when (dt.toLocalDate()) {
            today -> "today"
            today.plusDays(1) -> "tomorrow"
            else -> dt.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.getDefault())
        }
        val minute = if (dt.minute == 0) "" else ":%02d".format(dt.minute)
        val h = dt.hour
        val hh = if (h % 12 == 0) 12 else h % 12
        return "$day at $hh$minute ${if (h < 12) "AM" else "PM"}"
    }

    companion object {
        /** How often coming back to the app checks the website for new books. */
        const val SYNC_EVERY_MS = 10 * 60_000L

        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as BookreelApp
                AppViewModel(app)
            }
        }
    }
}
