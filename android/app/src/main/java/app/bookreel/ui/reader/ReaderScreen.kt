package app.bookreel.ui.reader

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.bookreel.data.UserState
import app.bookreel.domain.Rules
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.Avatar
import app.bookreel.ui.Ic
import app.bookreel.ui.Screen
import app.bookreel.ui.Segments
import app.bookreel.ui.Sheet
import app.bookreel.ui.compactCount
import app.bookreel.ui.pad2
import app.bookreel.ui.theme.LocalPrefs
import app.bookreel.ui.theme.Pal
import app.bookreel.ui.theme.hex
import app.bookreel.ui.theme.monoStyle
import app.bookreel.ui.theme.uiStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

@Composable
fun ReaderScreen(vm: AppViewModel, state: UserState, screen: Screen.Reader) {
    val book = vm.books[screen.bookId]
    if (book == null) {
        Box(Modifier.fillMaxSize().background(Pal.reader))
        return
    }
    val chapter = book.chapter(screen.ch)
    val posts = book.postsOf(screen.ch)
    val pageCount = if (screen.previewOnly) 1 else posts.size
    val prefs = LocalPrefs.current
    val pager = rememberPagerState(initialPage = screen.startPost.coerceIn(0, pageCount - 1)) { pageCount }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(pager, screen) {
        snapshotFlow { pager.settledPage }.distinctUntilChanged().collect { page ->
            if (!screen.previewOnly) vm.onPostSettled(screen.bookId, screen.ch, page)
        }
    }
    LaunchedEffect(pager.settledPage, screen) {
        delay(1500)
        if (!screen.previewOnly) vm.markViewed(screen.bookId, screen.ch, pager.settledPage)
    }

    val go = rememberUpdatedState<(Int) -> Unit> { delta ->
        val target = pager.currentPage + delta
        if (target in 0 until pageCount) {
            scope.launch {
                if (prefs.reduceMotion) pager.scrollToPage(target) else pager.animateScrollToPage(target)
            }
        } else if (target >= pageCount) {
            if (screen.previewOnly) vm.showLocked(screen.bookId, screen.ch) else vm.finishChapter(screen.bookId, screen.ch)
        }
        Unit
    }

    Column(Modifier.fillMaxSize().background(Pal.reader).statusBarsPadding().navigationBarsPadding()) {
        // Top: 10-segment progress + header
        Column(Modifier.padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 8.dp)) {
            Segments(
                total = posts.size,
                filled = { it <= pager.currentPage },
                on = Pal.onDark, off = Pal.onDark.copy(alpha = 0.22f),
                modifier = Modifier.padding(end = 6.dp),
            )
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(pad2(screen.ch), hex(chapter.bg), 34.dp, fg = hex(chapter.fg), textSize = 15f)
                Column(Modifier.weight(1f).padding(start = 10.dp)) {
                    Text(book.book.title, style = uiStyle(13.5f), color = Pal.onDark)
                    Text(
                        "Chapter ${screen.ch} · ${chapter.title}" + if (screen.previewOnly) " · preview" else "",
                        style = monoStyle(11f, FontWeight.Normal, 0f), color = Pal.onDark.copy(alpha = 0.7f),
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                Text("${pager.currentPage + 1}/${posts.size}", style = monoStyle(12f, FontWeight.Normal, 0f), color = Pal.onDark.copy(alpha = 0.75f))
                Box(
                    Modifier.size(42.dp).clip(CircleShape).clickable(role = Role.Button) { vm.back() },
                    contentAlignment = Alignment.Center,
                ) { AppIcon(Ic.close, Pal.onDark, description = "Close chapter") }
            }
        }

        HorizontalPager(
            state = pager,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 8.dp),
            pageSpacing = 8.dp,
            beyondViewportPageCount = 1,
            key = { posts[it].id },
        ) { page ->
            Box(
                Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(18.dp))
                    .semantics { contentDescription = "Post ${page + 1} of ${posts.size}" }
                    .pointerInput(page) {
                        detectTapGestures(onTap = { o -> go.value(if (o.x < size.width * 0.3f) -1 else 1) })
                    }
                    .pointerInput(page) {
                        var total = 0f
                        detectVerticalDragGestures(
                            onDragStart = { total = 0f },
                            onDragEnd = {
                                if (total < -140f) go.value(1) else if (total > 140f) go.value(-1)
                            },
                            onVerticalDrag = { _, dy -> total += dy },
                        )
                    },
            ) {
                PostCard(
                    vm = vm, state = state, book = book, ch = screen.ch, index = page, post = posts[page],
                    isLast = page == posts.size - 1, previewOnly = screen.previewOnly,
                    onFinish = { go.value(1) },
                )
            }
        }

        // Action rail
        val post = posts[pager.currentPage.coerceIn(0, posts.size - 1)]
        val pk = Rules.postKey(screen.bookId, post.id)
        val liked = pk in state.likes
        val saved = state.saves.containsKey(pk)
        val likes = 420 + ((screen.ch * 131 + pager.currentPage * 197) % 41) * 61 + if (liked) 1 else 0
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            RailButton(if (liked) Ic.heartFilled else Ic.heart, compactCount(likes), if (liked) androidx.compose.ui.graphics.Color(0xFFFF4D5E) else Pal.onDark, "Like") {
                vm.toggleLike(screen.bookId, post.id)
            }
            RailButton(Ic.comment, "${9 + (screen.ch * 17 + pager.currentPage * 29) % 57}", Pal.onDark, "Discussion") {
                vm.showToast("Reader discussions arrive with accounts in the next version.")
            }
            RailButton(Ic.send, "", Pal.onDark, "Share") {
                val text = "${post.t}: from Chapter ${screen.ch} of ${book.book.title} on Bookreel.\n\n${chapter.hook}"
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
                context.startActivity(Intent.createChooser(send, "Share post"))
            }
            Box(Modifier.weight(1f))
            if (pager.currentPage == 0 && !screen.previewOnly) {
                Text("Tap right · swipe", style = monoStyle(11f, FontWeight.Normal, 0f), color = Pal.onDark.copy(alpha = 0.55f), modifier = Modifier.padding(end = 6.dp))
            }
            RailButton(if (saved) Ic.bookmarkFilled else Ic.bookmark, "", if (saved) Pal.sodium else Pal.onDark, if (saved) "Remove from notebook" else "Save to notebook") {
                vm.toggleSave(screen.bookId, screen.ch, pager.currentPage, post.id)
            }
        }
    }
}

@Composable
private fun RailButton(icon: androidx.compose.ui.graphics.vector.ImageVector, count: String, tint: androidx.compose.ui.graphics.Color, label: String, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button, onClickLabel = label, onClick = onClick).padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        AppIcon(icon, tint, size = 25.dp, description = label)
        if (count.isNotEmpty()) Text(count, style = monoStyle(12.5f, FontWeight.Normal, 0f), color = Pal.onDark)
    }
}
