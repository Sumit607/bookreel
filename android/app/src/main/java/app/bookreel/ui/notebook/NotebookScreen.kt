package app.bookreel.ui.notebook

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.bookreel.data.UserState
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.Ic
import app.bookreel.ui.Label
import app.bookreel.ui.pad2
import app.bookreel.ui.theme.LocalColors
import app.bookreel.ui.theme.bodyStyle
import app.bookreel.ui.theme.displayStyle
import app.bookreel.ui.theme.uiStyle

@Composable
fun NotebookScreen(vm: AppViewModel, state: UserState) {
    val c = LocalColors.current
    val saved = state.saves.values.sortedWith(compareBy({ it.bookId }, { it.ch }, { it.index }))
    LazyColumn(
        Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Column(Modifier.padding(bottom = 8.dp)) {
                Label("Your notebook", c.muted, alpha = 1f)
                Text("SAVED POSTS", style = displayStyle(34f), color = c.fg, modifier = Modifier.padding(top = 4.dp))
                Text(
                    "${saved.size} saved. Tap the bookmark under any post to keep it here.",
                    style = bodyStyle(14.5f, lineHeight = 1.45f), color = c.muted, modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        if (saved.isEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    AppIcon(Ic.bookmark, c.muted, size = 40.dp)
                    Text(
                        "Nothing saved yet. The ideas you save stay with you after the book ends.",
                        style = bodyStyle(15f, lineHeight = 1.5f), color = c.muted, modifier = Modifier.padding(top = 12.dp, start = 24.dp, end = 24.dp),
                    )
                }
            }
        }
        items(saved, key = { "${it.bookId}:${it.ch}:${it.index}" }) { s ->
            val book = vm.books[s.bookId] ?: return@items
            val post = book.postsOf(s.ch).getOrNull(s.index) ?: return@items
            val chapter = book.chapter(s.ch)
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, c.line, RoundedCornerShape(12.dp))
                    .clickable { vm.openChapter(s.bookId, s.ch, s.index, fromSheet = true) }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Label("${book.book.title} · Ch ${pad2(s.ch)} · ${chapter.title} · post ${s.index + 1}", c.muted, alpha = 1f, size = 10.5f)
                Text(post.t.uppercase(), style = displayStyle(21f, weight = FontWeight.ExtraBold, lineHeight = 1f), color = c.fg)
                if (post.take != null) Text(post.take!!, style = bodyStyle(14.5f, lineHeight = 1.45f), color = c.fg)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Open post", style = uiStyle(13f), color = c.accent)
                    AppIcon(Ic.arrow, c.accent, size = 16.dp, modifier = Modifier.padding(start = 4.dp))
                }
            }
        }
    }
}
