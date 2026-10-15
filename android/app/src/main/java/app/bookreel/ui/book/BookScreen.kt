package app.bookreel.ui.book

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.bookreel.data.LoadedBook
import app.bookreel.data.UserState
import app.bookreel.domain.ChapterLock
import app.bookreel.domain.Rules
import app.bookreel.ui.AppButton
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.Avatar
import app.bookreel.ui.BtnKind
import app.bookreel.ui.Ic
import app.bookreel.ui.Segments
import app.bookreel.ui.Sheet
import app.bookreel.ui.Stat
import app.bookreel.ui.library.Cover
import app.bookreel.ui.pad2
import app.bookreel.ui.theme.LocalColors
import app.bookreel.ui.theme.bodyStyle
import app.bookreel.ui.theme.displayStyle
import app.bookreel.ui.theme.hex
import app.bookreel.ui.theme.monoStyle
import app.bookreel.ui.theme.uiStyle
import kotlinx.coroutines.delay

@Composable
fun BookScreen(vm: AppViewModel, state: UserState, bookId: String) {
    val c = LocalColors.current
    val book = vm.books[bookId]
    val meta = vm.index.books.firstOrNull { it.id == bookId }
    if (book == null || meta == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Loading…", style = uiStyle(14f), color = c.muted) }
        return
    }
    // Re-check daily-release locks every 30 s while this page is open.
    var now by remember { mutableLongStateOf(vm.now()) }
    LaunchedEffect(Unit) { while (true) { delay(30_000); now = vm.now() } }

    val done = Rules.completedCount(state, bookId)
    val next = vm.nextChapter(bookId)
    val mode = Rules.mode(state, bookId)
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        modifier = Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }, key = "top") {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(40.dp).clip(CircleShape).clickable(role = Role.Button) { vm.back() }, contentAlignment = Alignment.Center) {
                        AppIcon(Ic.back, c.fg, description = "Back")
                    }
                    Text(book.book.title, style = uiStyle(16f), color = c.fg, modifier = Modifier.weight(1f).padding(start = 4.dp))
                    Box(Modifier.size(40.dp).clip(CircleShape).clickable(role = Role.Button) { vm.sheet = Sheet.HowItWorks }, contentAlignment = Alignment.Center) {
                        AppIcon(Ic.info, c.fg, size = 22.dp, description = "How it works")
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Cover(meta.cover, meta.title, Modifier.width(92.dp), small = true)
                    Row(Modifier.weight(1f).padding(start = 12.dp)) {
                        Stat("${book.chapterCount}", "chapters", c.fg, c.muted)
                        Stat("${book.posts.sumOf { it.size }}", "posts", c.fg, c.muted)
                        Stat("~${meta.minutes}", "minutes", c.fg, c.muted)
                    }
                }
                Text(book.book.title.uppercase(), style = displayStyle(30f, lineHeight = 1f), color = c.fg, modifier = Modifier.padding(top = 14.dp))
                Text(book.book.authors.joinToString(" & "), style = uiStyle(13f, FontWeight.Normal), color = c.muted)
                Text(book.book.blurb, style = bodyStyle(15f, lineHeight = 1.5f), color = c.fg, modifier = Modifier.padding(top = 8.dp))
                Segments(book.chapterCount, { Rules.isComplete(state, bookId, it + 1) }, c.accent, c.line, Modifier.padding(top = 14.dp), height = 6.dp, gap = 3.dp)
                Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    Text("$done of ${book.chapterCount} chapters", style = monoStyle(11.5f, FontWeight.Normal, 0f), color = c.muted, modifier = Modifier.weight(1f))
                    Text("${Rules.totalXp(state)} XP", style = monoStyle(11.5f, FontWeight.Normal, 0f), color = c.muted)
                }
                val label = when {
                    done >= book.chapterCount -> "Read again from Chapter 1"
                    done == 0 && (state.progress[Rules.key(bookId, 1)] ?: 0) == 0 -> "Start Chapter 1: ${book.chapter(1).title}"
                    else -> "Continue Chapter $next: ${book.chapter(next).title}"
                }
                AppButton(
                    label,
                    onClick = { if (done >= book.chapterCount) vm.openChapter(bookId, 1, 0) else vm.openChapter(bookId, next) },
                    modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                )
                ModeRow(vm, bookId, mode, state.settings.releaseHour)
                LazyRow(Modifier.padding(top = 14.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(book.book.characters, key = { it.id }) { ch ->
                        val unlocked = ch.firstChapter <= maxOf(next, 1) || Rules.isComplete(state, bookId, ch.firstChapter)
                        CharacterBubble(ch.initials, ch.short, hex(ch.color), unlocked, ch.firstChapter) { vm.sheet = Sheet.Character(bookId, ch.id) }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(c.line))
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(Ic.grid, c.fg, size = 17.dp)
                    Text("  20 chapters · 10 posts each", style = uiStyle(13f), color = c.fg)
                }
            }
        }
        items(book.book.chapters, key = { it.n }) { ch ->
            Tile(vm, book, state, ch.n, now, isNext = ch.n == next && done < book.chapterCount)
        }
        item(key = "badge") {
            val earned = done >= book.chapterCount
            Box(
                Modifier.aspectRatio(0.8f).background(if (earned) c.accent else c.tileLocked).clickable { vm.sheet = Sheet.BookBadge(bookId) }.padding(9.dp),
            ) {
                AppIcon(Ic.medal, if (earned) c.accentInk else c.tileLockedFg, size = 44.dp, modifier = Modifier.align(Alignment.TopStart))
                Text("BOOK BADGE", style = displayStyle(16f, weight = FontWeight.ExtraBold, lineHeight = 1f), color = if (earned) c.accentInk else c.tileLockedFg, modifier = Modifier.align(Alignment.BottomStart))
                if (!earned) AppIcon(Ic.lock, c.tileLockedFg, size = 16.dp, modifier = Modifier.align(Alignment.TopEnd))
            }
        }
    }
}

@Composable
private fun ModeRow(vm: AppViewModel, bookId: String, mode: String, hour: Int) {
    val c = LocalColors.current
    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Next chapter", style = uiStyle(13f, FontWeight.Normal), color = c.muted, modifier = Modifier.weight(1f))
        Row(Modifier.clip(RoundedCornerShape(10.dp)).background(c.surface2).padding(3.dp)) {
            Seg("Right away", mode == Rules.BINGE) { if (mode != Rules.BINGE) vm.setMode(bookId, Rules.BINGE) }
            Seg("Daily at ${vm.hourLabel(hour)}", mode == Rules.DAILY) { if (mode != Rules.DAILY) vm.setMode(bookId, Rules.DAILY) }
        }
    }
}

@Composable
private fun Seg(text: String, on: Boolean, onClick: () -> Unit) {
    val c = LocalColors.current
    Box(
        Modifier.clip(RoundedCornerShape(8.dp)).background(if (on) c.surface else Color.Transparent).clickable(role = Role.Tab, onClick = onClick).padding(horizontal = 10.dp, vertical = 7.dp),
    ) { Text(text, style = uiStyle(12.5f), color = if (on) c.fg else c.muted) }
}

@Composable
private fun CharacterBubble(initials: String, name: String, color: Color, unlocked: Boolean, chapter: Int, onClick: () -> Unit) {
    val c = LocalColors.current
    Column(Modifier.width(66.dp).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        val ring = if (unlocked) Brush.sweepGradient(listOf(c.accent, app.bookreel.ui.theme.Pal.sodium, app.bookreel.ui.theme.Pal.tagRed, c.accent)) else Brush.linearGradient(listOf(c.line, c.line))
        Box(Modifier.size(64.dp).clip(CircleShape).background(ring).padding(2.5.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.fillMaxSize().clip(CircleShape).border(3.dp, c.surface, CircleShape).background(if (unlocked) color else c.surface2), contentAlignment = Alignment.Center) {
                if (unlocked) Text(initials, style = displayStyle(20f, weight = FontWeight.ExtraBold, lineHeight = 1f), color = Color.White)
                else AppIcon(Ic.lock, c.muted, size = 20.dp)
            }
        }
        Text(if (unlocked) name else "Ch $chapter", style = uiStyle(11.5f, FontWeight.Medium), color = if (unlocked) c.fg else c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 5.dp))
    }
}

@Composable
private fun Tile(vm: AppViewModel, book: LoadedBook, state: UserState, n: Int, now: Long, isNext: Boolean) {
    val c = LocalColors.current
    val ch = book.chapter(n)
    val lock = Rules.lockState(state, book.id, n, now, vm.zone)
    val open = lock == ChapterLock.Open
    val done = Rules.isComplete(state, book.id, n)
    val bg = hex(ch.bg)
    val fg = hex(ch.fg)
    Box(
        Modifier
            .aspectRatio(0.8f)
            .background(if (open) bg else c.tileLocked)
            .then(if (isNext) Modifier.border(2.dp, c.accent) else Modifier)
            .clickable { vm.openChapter(book.id, n) }
            .padding(9.dp),
    ) {
        val color = if (open) fg else c.tileLockedFg
        Text(pad2(n), style = displayStyle(42f, lineHeight = 0.85f), color = color, modifier = Modifier.align(Alignment.TopStart))
        Text(ch.title.uppercase(), style = displayStyle(16f, weight = FontWeight.ExtraBold, lineHeight = 1f), color = color, modifier = Modifier.align(Alignment.BottomStart))
        when {
            done -> Box(Modifier.align(Alignment.TopEnd).size(24.dp).clip(CircleShape).background(app.bookreel.ui.theme.Pal.ok), contentAlignment = Alignment.Center) {
                AppIcon(Ic.check, Color(0xFF0B1A10), size = 15.dp, description = "Read")
            }
            lock is ChapterLock.WaitingUntil -> Text(
                "OPENS\n${vm.hourLabel(java.time.Instant.ofEpochMilli(lock.at).atZone(vm.zone).hour)}",
                style = monoStyle(9f, FontWeight.SemiBold, 0.04f), color = c.tileLockedFg, modifier = Modifier.align(Alignment.TopEnd),
            )
            !open -> AppIcon(Ic.lock, c.tileLockedFg, size = 16.dp, modifier = Modifier.align(Alignment.TopEnd), description = "Locked")
        }
    }
}
