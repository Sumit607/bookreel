package app.bookreel.ui.sheets

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.bookreel.data.UserState
import app.bookreel.domain.ChapterLock
import app.bookreel.domain.Rules
import app.bookreel.ui.AppButton
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.Avatar
import app.bookreel.ui.BtnKind
import app.bookreel.ui.Ic
import app.bookreel.ui.Label
import app.bookreel.ui.Sheet
import app.bookreel.ui.library.Cover
import app.bookreel.ui.pad2
import app.bookreel.ui.theme.LocalColors
import app.bookreel.ui.theme.bodyStyle
import app.bookreel.ui.theme.displayStyle
import app.bookreel.ui.theme.hex
import app.bookreel.ui.theme.monoStyle
import app.bookreel.ui.theme.uiStyle

@Composable
fun SheetContent(vm: AppViewModel, state: UserState, sheet: Sheet) {
    when (sheet) {
        is Sheet.Locked -> LockedSheet(vm, state, sheet)
        is Sheet.Character -> CharacterSheet(vm, state, sheet)
        is Sheet.ComingSoon -> ComingSoonSheet(vm, sheet)
        is Sheet.BookBadge -> BadgeSheet(vm, state, sheet)
        Sheet.HowItWorks -> HowSheet(vm)
        Sheet.ConfirmReset -> ResetSheet(vm)
    }
}

@Composable
private fun Title(kicker: String, title: String) {
    val c = LocalColors.current
    Label(kicker, c.muted, alpha = 1f)
    Text(title.uppercase(), style = displayStyle(34f, lineHeight = 0.95f), color = c.fg, modifier = Modifier.padding(top = 6.dp, bottom = 8.dp))
}

@Composable
private fun LockedSheet(vm: AppViewModel, state: UserState, sheet: Sheet.Locked) {
    val c = LocalColors.current
    val book = vm.books[sheet.bookId] ?: return
    val ch = book.chapter(sheet.ch)
    Title("Chapter ${pad2(sheet.ch)} of ${book.chapterCount}", ch.title)
    Text(ch.hook, style = bodyStyle(18f, italic = true, lineHeight = 1.45f), color = c.fg)
    val lock = vm.lock(sheet.bookId, sheet.ch)
    val why = when (lock) {
        is ChapterLock.WaitingUntil -> "Daily mode: unlocks ${vm.timeLabel(lock.at)}."
        ChapterLock.NeedsPrevious -> "Unlocks when you finish Chapter ${sheet.ch - 1}."
        ChapterLock.Open -> "Open now."
    }
    Row(Modifier.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        AppIcon(Ic.lock, c.muted, size = 16.dp)
        Text(why, style = monoStyle(12f, FontWeight.Normal, 0f), color = c.muted, modifier = Modifier.padding(start = 8.dp))
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (lock is ChapterLock.WaitingUntil) {
            AppButton("Switch to “right away” and read now", onClick = {
                vm.setMode(sheet.bookId, Rules.BINGE)
                vm.openChapter(sheet.bookId, sheet.ch)
            }, modifier = Modifier.fillMaxWidth())
        }
        if (lock != ChapterLock.Open) {
            AppButton("Preview the hook post", onClick = { vm.openChapter(sheet.bookId, sheet.ch, fromSheet = true) }, kind = BtnKind.Secondary, modifier = Modifier.fillMaxWidth())
        }
        AppButton("Got it", onClick = { vm.sheet = null }, kind = BtnKind.Secondary, modifier = Modifier.fillMaxWidth())
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CharacterSheet(vm: AppViewModel, state: UserState, sheet: Sheet.Character) {
    val c = LocalColors.current
    val book = vm.books[sheet.bookId] ?: return
    val ch = book.character(sheet.charId) ?: return
    val reached = vm.nextChapter(sheet.bookId)
    val unlocked = ch.firstChapter <= maxOf(reached, 1) || Rules.isComplete(state, sheet.bookId, ch.firstChapter)
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        if (!unlocked) {
            Box(Modifier.size(96.dp).clip(CircleShape).background(c.surface2), contentAlignment = Alignment.Center) {
                AppIcon(Ic.lock, c.muted, size = 30.dp)
            }
            Text("NOT YET", style = displayStyle(34f), color = c.fg, modifier = Modifier.padding(top = 12.dp))
            Text(
                "You’ll meet this person in Chapter ${ch.firstChapter}. Characters appear here as the story introduces them.",
                style = bodyStyle(15.5f, lineHeight = 1.5f), color = c.muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp),
            )
        } else {
            Avatar(ch.initials, hex(ch.color), 96.dp, textSize = 40f)
            Label(ch.role, c.muted, Modifier.padding(top = 12.dp), alpha = 1f)
            Text(ch.name.uppercase(), style = displayStyle(34f), color = c.fg, modifier = Modifier.padding(top = 4.dp))
            Text(ch.bio, style = bodyStyle(15.5f, lineHeight = 1.5f), color = c.fg, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
            FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ch.traits.forEach { t ->
                    Text(t, style = monoStyle(11.5f, FontWeight.Normal, 0f), color = c.fg, modifier = Modifier.clip(RoundedCornerShape(50)).background(c.surface2).padding(horizontal = 10.dp, vertical = 6.dp))
                }
            }
            Label("First appears in Chapter ${ch.firstChapter}", c.muted, Modifier.padding(top = 14.dp), alpha = 1f)
        }
    }
}

@Composable
private fun ComingSoonSheet(vm: AppViewModel, sheet: Sheet.ComingSoon) {
    val c = LocalColors.current
    val m = sheet.meta
    Row(verticalAlignment = Alignment.CenterVertically) {
        Cover(m.cover, m.title, Modifier.width(84.dp), small = true)
        Column(Modifier.padding(start = 14.dp)) {
            Label("Coming soon · ${m.category}", c.muted, alpha = 1f)
            Text(m.title.uppercase(), style = displayStyle(28f, lineHeight = 0.95f), color = c.fg, modifier = Modifier.padding(top = 4.dp))
            Text(m.authors.joinToString(", "), style = uiStyle(13f, FontWeight.Normal), color = c.muted)
        }
    }
    Text(m.hook, style = bodyStyle(18f, italic = true, lineHeight = 1.45f), color = c.fg, modifier = Modifier.padding(top = 14.dp))
    Text(m.blurb, style = bodyStyle(15f, lineHeight = 1.5f), color = c.muted, modifier = Modifier.padding(top = 8.dp))
    Text(
        "This free classic arrives when the content pipeline is ready. It will have the same 20 chapters of 10 posts.",
        style = monoStyle(12f, FontWeight.Normal, 0f), color = c.muted, modifier = Modifier.padding(top = 14.dp, bottom = 14.dp),
    )
    AppButton("Got it", onClick = { vm.sheet = null }, kind = BtnKind.Secondary, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun BadgeSheet(vm: AppViewModel, state: UserState, sheet: Sheet.BookBadge) {
    val c = LocalColors.current
    val book = vm.books[sheet.bookId] ?: return
    val done = Rules.completedCount(state, sheet.bookId)
    Title("$done of ${book.chapterCount} chapters read", "${book.book.title} badge")
    Text(
        if (done >= book.chapterCount) "Earned. You finished every chapter of ${book.book.title}."
        else "Finish all ${book.chapterCount} chapters to earn this badge for your profile and +${Rules.XP_BOOK} XP.",
        style = bodyStyle(15.5f, lineHeight = 1.5f), color = c.fg, modifier = Modifier.padding(bottom = 14.dp),
    )
    AppButton("Keep reading", onClick = { vm.sheet = null }, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun HowSheet(vm: AppViewModel) {
    val c = LocalColors.current
    Title("The format", "How Bookreel works")
    val points = listOf(
        "1 book = 20 chapters." to "Every book, long or short, is re-cut into 20 story beats. The Goal’s 40 original chapters became 20.",
        "1 chapter = 10 posts." to "About 3 minutes. Each post is short, around 60 words.",
        "Post 1 hooks, post 10 hangs." to "Every chapter opens on its sharpest moment and ends on a cliffhanger.",
        "Read it like a feed." to "Tap the right side or swipe left for the next post. Tap the left side to go back. Swiping up works too.",
        "Play along." to "Vote in polls, make guesses that pay off later, save posts to your notebook, and meet characters as they appear.",
        "Your pace." to "Read chapters right away, or switch a book to Daily and get one chapter each evening.",
    )
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 14.dp)) {
        points.forEachIndexed { i, (h, t) ->
            Row {
                Text("${i + 1}", style = displayStyle(22f, lineHeight = 1f), color = c.accent, modifier = Modifier.width(24.dp))
                Column {
                    Text(h, style = uiStyle(14.5f), color = c.fg)
                    Text(t, style = bodyStyle(14.5f, lineHeight = 1.45f), color = c.muted)
                }
            }
        }
    }
    AppButton("Got it", onClick = { vm.sheet = null }, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun ResetSheet(vm: AppViewModel) {
    val c = LocalColors.current
    Title("Start over", "Reset progress?")
    Text(
        "This clears chapters read, answers, saved posts, streak and XP on this phone. Settings stay. It can’t be undone.",
        style = bodyStyle(15.5f, lineHeight = 1.5f), color = c.fg, modifier = Modifier.padding(bottom = 14.dp),
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AppButton("Reset everything", onClick = { vm.resetProgress() }, modifier = Modifier.fillMaxWidth())
        AppButton("Cancel", onClick = { vm.sheet = null }, kind = BtnKind.Secondary, modifier = Modifier.fillMaxWidth())
    }
}
