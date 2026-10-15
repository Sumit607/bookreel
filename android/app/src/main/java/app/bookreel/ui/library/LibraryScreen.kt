package app.bookreel.ui.library

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.bookreel.data.BookMeta
import app.bookreel.data.CoverStyle
import app.bookreel.data.UserState
import app.bookreel.domain.Rules
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.Chip
import app.bookreel.ui.HeaderChip
import app.bookreel.ui.Ic
import app.bookreel.ui.Segments
import app.bookreel.ui.Sheet
import app.bookreel.ui.theme.LocalColors
import app.bookreel.ui.theme.Pal
import app.bookreel.ui.theme.bodyStyle
import app.bookreel.ui.theme.displayStyle
import app.bookreel.ui.theme.hex
import app.bookreel.ui.theme.monoStyle
import app.bookreel.ui.theme.uiStyle

private val CATEGORIES = listOf("All", "Business", "Classics", "Mystery", "Strategy", "Thriller")

@Composable
fun LibraryScreen(vm: AppViewModel, state: UserState) {
    val c = LocalColors.current
    val q = vm.query.trim().lowercase()
    val books = vm.index.books.filter { b ->
        (vm.category == "All" || b.category.equals(vm.category, true)) &&
            (q.isEmpty() || b.title.lowercase().contains(q) || b.authors.any { it.lowercase().contains(q) } || b.category.lowercase().contains(q))
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }, key = "header") {
            Column {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f)) {
                        Text("book", style = displayStyle(28f, lineHeight = 1f), color = c.fg)
                        Text("reel", style = displayStyle(28f, lineHeight = 1f), color = c.accent)
                    }
                    HeaderChip(Ic.flame, Rules.displayedStreak(state, vm.now(), vm.zone).toString())
                    Box(Modifier.size(8.dp))
                    Box(
                        Modifier.size(36.dp).clip(CircleShape).background(Color(0xFF2F5F8A)).clickable { vm.setTab(app.bookreel.ui.Screen.Profile) },
                        contentAlignment = Alignment.Center,
                    ) { AppIcon(Ic.person, Color.White, size = 20.dp, description = "Profile") }
                }
                Text("PICK YOUR NEXT BOOK", style = displayStyle(36f), color = c.fg, modifier = Modifier.padding(top = 4.dp))
                Text("Every book · 20 chapters × 10 posts · about 1 hour", style = monoStyle(11f, FontWeight.Normal, 0.02f), color = c.muted, modifier = Modifier.padding(top = 4.dp))
                SearchField(vm)
                LazyRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(CATEGORIES) { cat -> Chip(cat, vm.category == cat, onClick = { vm.category = cat }) }
                }
                ContinueCard(vm, state)
                Row(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 2.dp), verticalAlignment = Alignment.Bottom) {
                    Text("START WITH A HOOK", style = displayStyle(21f, weight = FontWeight.ExtraBold, lineHeight = 1f), color = c.fg, modifier = Modifier.weight(1f))
                    Text("${books.size} books", style = uiStyle(13f), color = c.muted)
                }
            }
        }
        items(books, key = { it.id }) { meta -> BookCard(meta, vm) }
        if (books.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text("No books match \"${vm.query}\".", style = bodyStyle(15f), color = c.muted, modifier = Modifier.padding(vertical = 24.dp))
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }, key = "footer") {
            Text(
                "This build carries The Goal for private testing only. The classics marked “Coming soon” arrive with the content pipeline.",
                style = monoStyle(10.5f, FontWeight.Normal, 0f), color = c.muted, modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun SearchField(vm: AppViewModel) {
    val c = LocalColors.current
    Row(
        Modifier.padding(top = 12.dp).fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(c.surface2).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppIcon(Ic.search, c.muted, size = 18.dp)
        Box(Modifier.width(8.dp))
        Box(Modifier.weight(1f)) {
            if (vm.query.isEmpty()) Text("Search books, authors, ideas", style = uiStyle(14f, FontWeight.Normal), color = c.muted)
            BasicTextField(
                value = vm.query,
                onValueChange = { vm.query = it },
                singleLine = true,
                textStyle = uiStyle(14f, FontWeight.Normal).copy(color = c.fg),
                cursorBrush = SolidColor(c.accent),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (vm.query.isNotEmpty()) {
            Box(Modifier.size(28.dp).clip(CircleShape).clickable { vm.query = "" }, contentAlignment = Alignment.Center) {
                AppIcon(Ic.close, c.muted, size = 16.dp, description = "Clear search")
            }
        }
    }
}

@Composable
private fun ContinueCard(vm: AppViewModel, state: UserState) {
    val last = state.lastOpened ?: return
    val book = vm.books[last.bookId] ?: return
    val ch = last.ch.coerceIn(1, book.chapterCount)
    val chapter = book.chapter(ch)
    val done = Rules.completedCount(state, book.id)
    if (done >= book.chapterCount) return
    Row(
        Modifier
            .padding(top = 14.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Pal.steel)
            .clickable { vm.openChapter(book.id, ch) }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val meta = vm.index.books.firstOrNull { it.id == book.id }
        if (meta != null) Cover(meta.cover, meta.title, Modifier.width(60.dp), small = true)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text("CONTINUE · CHAPTER $ch OF ${book.chapterCount}", style = monoStyle(10f), color = Pal.onDark.copy(alpha = 0.7f))
            Text(chapter.title.uppercase(), style = displayStyle(22f, weight = FontWeight.ExtraBold, lineHeight = 1f), color = Pal.onDark, modifier = Modifier.padding(top = 3.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(chapter.hook, style = bodyStyle(12.5f, italic = true, lineHeight = 1.35f), color = Pal.onDark.copy(alpha = 0.9f), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
            Segments(book.chapterCount, { Rules.isComplete(state, book.id, it + 1) }, Pal.sodium, Pal.steel3, Modifier.padding(top = 8.dp), height = 4.dp, gap = 2.dp)
        }
        Box(Modifier.size(42.dp).clip(CircleShape).background(Pal.sodium), contentAlignment = Alignment.Center) {
            AppIcon(Ic.play, Pal.ink, size = 18.dp, description = "Continue reading")
        }
    }
}

@Composable
private fun BookCard(meta: BookMeta, vm: AppViewModel) {
    val c = LocalColors.current
    val ready = meta.status == "ready"
    Column(Modifier.clickable { vm.openBook(meta) }) {
        Box {
            Cover(meta.cover, meta.title, Modifier.fillMaxWidth())
            Text(
                (if (ready) meta.cover.tag else "Coming soon").uppercase(),
                style = monoStyle(8.5f, FontWeight.SemiBold, 0.08f), color = Color.White,
                modifier = Modifier.padding(8.dp).clip(RoundedCornerShape(4.dp)).background(Color(0x8C000000)).padding(horizontal = 6.dp, vertical = 3.dp),
            )
        }
        Text(meta.hook, style = bodyStyle(12.5f, italic = true, lineHeight = 1.35f), color = c.fg, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
        Text(
            if (ready) "20 ch · ${meta.minutes} min" else "Coming soon",
            style = monoStyle(10f, FontWeight.Normal, 0f), color = c.muted, modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** Original typographic covers drawn in code (no copied artwork). */
@Composable
fun Cover(style: CoverStyle, title: String, modifier: Modifier = Modifier, small: Boolean = false) {
    val bg = hex(style.bg)
    val fg = hex(style.fg)
    Box(
        modifier.aspectRatio(if (small) 0.75f else 0.8f).clip(RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp, topEnd = 10.dp, bottomEnd = 10.dp)).background(bg),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            when (style.motif) {
                "factory" -> {
                    drawRect(Pal.sodium, Offset.Zero, Size(w, h * 0.09f))
                    drawRoundRect(Pal.tagRed, Offset(w * 0.78f, h * 0.17f), Size(w * 0.12f, h * 0.17f), androidx.compose.ui.geometry.CornerRadius(3f))
                }
                "lens" -> {
                    drawCircle(fg.copy(alpha = 0.9f), radius = w * 0.2f, center = Offset(w * 0.66f, h * 0.3f), style = Stroke(width = w * 0.035f))
                    drawLine(fg.copy(alpha = 0.9f), Offset(w * 0.8f, h * 0.43f), Offset(w * 0.92f, h * 0.55f), strokeWidth = w * 0.04f)
                }
                "diamond" -> {
                    drawCircle(fg, radius = w * 0.2f, center = Offset(w * 0.5f, h * 0.3f), style = Stroke(width = 3f))
                    val p = Path().apply {
                        moveTo(w * 0.5f, h * 0.3f - w * 0.13f); lineTo(w * 0.63f, h * 0.3f); lineTo(w * 0.5f, h * 0.3f + w * 0.13f); lineTo(w * 0.37f, h * 0.3f); close()
                    }
                    drawPath(p, fg, style = Stroke(width = 3f))
                    drawCircle(fg, radius = w * 0.04f, center = Offset(w * 0.5f, h * 0.3f))
                }
                "sun" -> drawCircle(Color(0xFFC8312A), radius = w * 0.24f, center = Offset(w * 0.5f, h * 0.3f))
                "bolt" -> {
                    val p = Path().apply {
                        moveTo(w * 0.78f, h * 0.06f); lineTo(w * 0.6f, h * 0.3f); lineTo(w * 0.72f, h * 0.3f); lineTo(w * 0.62f, h * 0.52f); lineTo(w * 0.88f, h * 0.24f); lineTo(w * 0.76f, h * 0.24f); close()
                    }
                    drawPath(p, Color(0xFFE8D35A))
                }
            }
            drawRect(Color(0x40000000), Offset.Zero, Size(w * 0.03f, h))
        }
        Column(Modifier.align(Alignment.BottomStart).padding(if (small) 6.dp else 10.dp)) {
            Text(
                title.uppercase(),
                style = displayStyle(if (small) 15f else 28f, lineHeight = 0.86f),
                color = fg,
            )
        }
    }
}

/** Sheet content for a book that is not in this build yet. */
fun comingSoonSheet(meta: BookMeta) = Sheet.ComingSoon(meta)
