package app.bookreel.ui.complete

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.bookreel.data.UserState
import app.bookreel.domain.Rules
import app.bookreel.notify.ReleaseScheduler
import app.bookreel.ui.AppButton
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.BtnKind
import app.bookreel.ui.Ic
import app.bookreel.ui.Label
import app.bookreel.ui.Screen
import app.bookreel.ui.pad2
import app.bookreel.ui.theme.LocalPrefs
import app.bookreel.ui.theme.Pal
import app.bookreel.ui.theme.bodyStyle
import app.bookreel.ui.theme.displayStyle
import app.bookreel.ui.theme.hex
import app.bookreel.ui.theme.monoStyle

@Composable
fun CompleteScreen(vm: AppViewModel, state: UserState, screen: Screen.Complete) {
    val book = vm.books[screen.bookId] ?: return
    val chapter = book.chapter(screen.ch)
    val next = if (screen.ch < book.chapterCount) book.chapter(screen.ch + 1) else null
    val context = LocalContext.current
    val reduce = LocalPrefs.current.reduceMotion
    val stamp = remember { Animatable(if (reduce) 1f else 0f) }
    LaunchedEffect(Unit) { stamp.animateTo(1f, tween(420)) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        vm.releaseTomorrow(context, screen.bookId, screen.ch)
    }
    val savedHere = state.saves.values.count { it.bookId == screen.bookId && it.ch == screen.ch }
    val bookDone = Rules.completedCount(state, screen.bookId) >= book.chapterCount

    Column(
        Modifier
            .fillMaxSize()
            .drawBehind {
                drawRect(Pal.steel)
                drawRect(Brush.radialGradient(listOf(Pal.sodium.copy(alpha = 0.22f), Color.Transparent), center = Offset(size.width / 2, 0f), radius = size.width))
            }
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                if (bookDone && next == null) "FINISHED" else "SHIPPED",
                style = displayStyle(56f, lineHeight = 1f).copy(letterSpacing = androidx.compose.ui.unit.TextUnit.Unspecified),
                color = Pal.ok,
                modifier = Modifier
                    .graphicsLayer {
                        val k = 1.8f - 0.8f * stamp.value
                        scaleX = k; scaleY = k; alpha = stamp.value; rotationZ = -6f
                    }
                    .border(5.dp, Pal.ok, RoundedCornerShape(8.dp))
                    .padding(horizontal = 18.dp, vertical = 2.dp),
            )
            Label("Chapter ${pad2(screen.ch)} · ${chapter.title} · complete", Pal.onDark, Modifier.padding(top = 18.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatBox(Modifier.weight(1f), "${Rules.displayedStreak(state, vm.now(), vm.zone).coerceAtLeast(1)}", "day streak", flame = true)
            StatBox(Modifier.weight(1f), "+${screen.xpGained}", "XP")
            StatBox(Modifier.weight(1f), "$savedHere", "saved")
        }
        Label("The chapter in 3 lines", Pal.onDark)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            chapter.recap.forEachIndexed { i, r ->
                Row {
                    Text("${i + 1}.", style = bodyStyle(16f, lineHeight = 1.5f), color = Pal.sodium, modifier = Modifier.padding(end = 8.dp))
                    Text(r, style = bodyStyle(16f, lineHeight = 1.5f), color = Pal.onDark)
                }
            }
        }
        if (next != null) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Pal.steel2)) {
                Box(
                    Modifier.fillMaxWidth().height(104.dp).background(Brush.linearGradient(listOf(hex(next.bg), hex(next.bg2 ?: next.bg)))).padding(horizontal = 16.dp, vertical = 12.dp),
                    contentAlignment = Alignment.BottomStart,
                ) { Text(pad2(next.n), style = displayStyle(58f, lineHeight = 0.8f), color = hex(next.fg)) }
                Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp)) {
                    Label("Up next", Pal.onDark)
                    Text(next.title.uppercase(), style = displayStyle(30f, lineHeight = 0.95f), color = Pal.onDark, modifier = Modifier.padding(vertical = 6.dp))
                    Text(next.hook, style = bodyStyle(15.5f, italic = true, lineHeight = 1.45f), color = Pal.onDark)
                }
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppButton("Read Chapter ${next.n} now", onClick = { vm.readNow(screen.bookId, next.n) }, modifier = Modifier.fillMaxWidth())
                    val reminder = state.reminders[screen.bookId]
                    val scheduled = reminder != null && reminder > vm.now() && Rules.mode(state, screen.bookId) == Rules.DAILY
                    AppButton(
                        if (scheduled) "Unlocks ${vm.timeLabel(reminder!!)}" else "Release it to me tomorrow at ${vm.hourLabel(state.settings.releaseHour)}",
                        onClick = {
                            if (!scheduled) {
                                if (Build.VERSION.SDK_INT >= 33 && !ReleaseScheduler.canNotify(context)) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                                else vm.releaseTomorrow(context, screen.bookId, screen.ch)
                            }
                        },
                        kind = BtnKind.Ghost,
                        ghostColor = Pal.onDark,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        } else {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Pal.sodium).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AppIcon(Ic.medal, Pal.ink, size = 40.dp)
                Text("BOOK BADGE EARNED", style = displayStyle(30f, lineHeight = 0.95f), color = Pal.ink)
                Text(
                    "You read all ${book.chapterCount} chapters of ${book.book.title}. Your saved posts are waiting in the Notebook.",
                    style = bodyStyle(15.5f, lineHeight = 1.45f), color = Pal.ink,
                )
            }
        }
        AppButton("Back to the book", onClick = { vm.setTab(Screen.Library); vm.navigate(Screen.BookPage(screen.bookId)) }, kind = BtnKind.Ghost, ghostColor = Pal.onDark, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun StatBox(modifier: Modifier, value: String, label: String, flame: Boolean = false) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(Pal.steel2).padding(vertical = 12.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (flame) AppIcon(Ic.flame, Pal.sodium, size = 18.dp)
        Text(value, style = displayStyle(30f, weight = FontWeight.ExtraBold, lineHeight = 1f), color = Pal.onDark)
        Text(label.uppercase(), style = monoStyle(10.5f, FontWeight.Medium, 0.06f), color = Pal.onDark.copy(alpha = 0.72f))
    }
}
