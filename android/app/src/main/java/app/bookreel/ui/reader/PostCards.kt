package app.bookreel.ui.reader

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.bookreel.data.ArtifactPost
import app.bookreel.data.CharacterPost
import app.bookreel.data.ChatPost
import app.bookreel.data.CliffPost
import app.bookreel.data.ComparePost
import app.bookreel.data.CrossoffPost
import app.bookreel.data.GuessPost
import app.bookreel.data.HookPost
import app.bookreel.data.IdeaPost
import app.bookreel.data.ListPost
import app.bookreel.data.LoadedBook
import app.bookreel.data.MythPost
import app.bookreel.data.Option
import app.bookreel.data.PollPost
import app.bookreel.data.Post
import app.bookreel.data.ScenePost
import app.bookreel.data.TwistPost
import app.bookreel.data.UnknownPost
import app.bookreel.data.UserState
import app.bookreel.domain.Rules
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.Avatar
import app.bookreel.ui.Ic
import app.bookreel.ui.Label
import app.bookreel.ui.pad2
import app.bookreel.ui.theme.Fonts
import app.bookreel.ui.theme.LocalPrefs
import app.bookreel.ui.theme.Pal
import app.bookreel.ui.theme.bodyStyle
import app.bookreel.ui.theme.displayStyle
import app.bookreel.ui.theme.hex
import app.bookreel.ui.theme.monoStyle
import app.bookreel.ui.theme.uiStyle
import kotlinx.coroutines.delay

// ---------------------------------------------------------------- themes

private data class CardTheme(val fg: Color, val paint: Modifier)

private fun themeOf(name: String): CardTheme = when (name) {
    "paper" -> CardTheme(Pal.ink, Modifier.drawBehind {
        drawRect(Pal.ticket)
        val step = 22.dp.toPx()
        val line = Color(0x0E17191C)
        var x = 0f
        while (x < size.width) { drawLine(line, Offset(x, 0f), Offset(x, size.height), 1f); x += step }
        var y = 0f
        while (y < size.height) { drawLine(line, Offset(0f, y), Offset(size.width, y), 1f); y += step }
    })
    "night" -> CardTheme(Pal.nightFg, Modifier.drawBehind {
        drawRect(Pal.night)
        drawRect(Brush.radialGradient(listOf(Pal.lamp.copy(alpha = 0.30f), Color.Transparent), center = Offset(size.width * 0.88f, 0f), radius = size.width * 1.1f))
    })
    "flash" -> CardTheme(Pal.flashFg, Modifier.drawBehind {
        drawRect(Pal.flash)
        drawRect(Brush.radialGradient(listOf(Color(0x38D6AA6E), Color.Transparent), center = Offset(size.width * 0.2f, 0f), radius = size.width))
    })
    "floor" -> CardTheme(Pal.onDark, Modifier.drawBehind {
        drawRect(Pal.steel)
        drawRect(Brush.radialGradient(listOf(Pal.sodium.copy(alpha = 0.42f), Color.Transparent), center = Offset(size.width / 2, -size.height * 0.12f), radius = size.width * 1.1f))
    })
    "sodium" -> CardTheme(Pal.ink, Modifier.background(Pal.sodium))
    "chat" -> CardTheme(Pal.onDark, Modifier.background(Pal.chat))
    else -> CardTheme(Pal.onDark, Modifier.background(Pal.steel))
}

/** Label pinned at the top; the rest is centred vertically and scrolls only if it overflows. */
@Composable
private fun CardFrame(
    theme: CardTheme,
    label: String?,
    arrangement: Arrangement.Vertical = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().then(theme.paint).padding(top = 22.dp, bottom = 8.dp)) {
        if (label != null) Label(label, theme.fg, Modifier.padding(horizontal = 20.dp))
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val scroll = rememberScrollState()
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(scroll, enabled = scroll.maxValue in 1 until Int.MAX_VALUE)
                    .heightIn(min = maxHeight)
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = arrangement,
                content = content,
            )
        }
    }
}

@Composable
private fun Prose(text: String, color: Color, size: Float = 17f) {
    Text(text, style = bodyStyle(size, LocalPrefs.current.textScale), color = color)
}

@Composable
private fun H3(text: String, color: Color, size: Float = 31f) {
    Text(text.uppercase(), style = displayStyle(size, LocalPrefs.current.textScale, FontWeight.ExtraBold, 0.98f), color = color)
}

@Composable
private fun Foot(text: String, color: Color) {
    Text(
        text,
        style = monoStyle(12.5f, FontWeight.Normal, 0f),
        color = color,
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawLine(color, Offset(0f, 0f), Offset(size.width, 0f), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
            }
            .padding(top = 12.dp),
    )
}

// ---------------------------------------------------------------- dispatcher

@Composable
fun PostCard(
    vm: AppViewModel, state: UserState, book: LoadedBook, ch: Int, index: Int, post: Post,
    isLast: Boolean, previewOnly: Boolean, onFinish: () -> Unit,
) {
    when (post) {
        is HookPost -> HookCard(post, ch, book)
        is ScenePost -> SceneCard(post)
        is ChatPost -> ChatCard(post, book)
        is CharacterPost -> CharacterCard(post, book)
        is TwistPost -> TwistCard(post)
        is PollPost -> ChoiceCard(post.label, post.q, post.options, post.reveal, post.hint, "What happened", state.answers[Rules.postKey(book.id, post.id)]) { vm.answer(book.id, ch, index, it) }
        is GuessPost -> ChoiceCard(post.label, post.q, post.options, post.reveal, post.hint, "What Jonah said".takeIf { book.id == "the-goal" && ch == 2 } ?: "The answer, for now", state.answers[Rules.postKey(book.id, post.id)]) { vm.answer(book.id, ch, index, it) }
        is CrossoffPost -> CrossoffCard(post, state.crossed[Rules.postKey(book.id, post.id)].orEmpty()) { vm.crossOff(book.id, post.id, it, post.items.size) }
        is MythPost -> MythCard(post)
        is IdeaPost -> IdeaCard(post, post.payoffLoopId?.let { state.guesses[Rules.postKey(book.id, it)] })
        is ListPost -> ListCard(post)
        is ComparePost -> CompareCard(post)
        is ArtifactPost -> ArtifactCard(post)
        is CliffPost -> CliffCard(post, book, ch, previewOnly, onFinish)
        is UnknownPost -> CardFrame(themeOf("steel"), "Post") { Prose(post.text, Pal.onDark) }
    }
}

// ---------------------------------------------------------------- hook

@Composable
private fun HookCard(post: HookPost, ch: Int, book: LoadedBook) {
    val s = LocalPrefs.current.textScale
    val chapter = book.chapter(ch)
    Column(
        Modifier
            .fillMaxSize()
            .drawBehind {
                drawRect(Pal.steel)
                drawRect(Brush.radialGradient(listOf(Pal.sodium.copy(alpha = 0.16f), Color.Transparent), center = Offset(size.width / 2, size.height * 0.3f), radius = size.width * 0.9f))
            }
            .padding(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Label("Chapter ${pad2(ch)} of ${book.chapterCount} · ${chapter.minutes} min · ${post.kicker}", Pal.onDark)
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            HookArt(post.art, post.artText, Modifier.fillMaxWidth().heightIn(max = 230.dp))
        }
        Text(post.head.uppercase(), style = displayStyle(42f, s, lineHeight = 0.9f), color = Pal.onDark)
        Text(post.sub, style = bodyStyle(18f, s, italic = true, lineHeight = 1.4f), color = Pal.sodium)
        val reduce = LocalPrefs.current.reduceMotion
        val dx = if (reduce) 0f else {
            val t = rememberInfiniteTransition(label = "cue")
            t.animateFloat(0f, 5f, infiniteRepeatable(tween(700, easing = LinearEasing), RepeatMode.Reverse), label = "dx").value
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Tap to start", style = monoStyle(12f, FontWeight.Normal, 0f), color = Pal.onDark.copy(alpha = 0.8f))
            AppIcon(Ic.arrow, Pal.onDark.copy(alpha = 0.8f), size = 18.dp, modifier = Modifier.padding(start = 8.dp).graphicsLayer { translationX = dx.dp.toPx() })
        }
    }
}

// ---------------------------------------------------------------- scene

@Composable
private fun SceneCard(post: ScenePost) {
    val th = themeOf(post.theme)
    CardFrame(th, post.label) {
        if (post.h != null) H3(post.h, th.fg)
        if (post.extra == "reportcard") ReportCard()
        Prose(post.text, th.fg)
        if (post.foot != null) Foot(post.foot, th.fg)
    }
}

@Composable
private fun ReportCard() {
    Column(
        Modifier
            .rotate(-2.5f)
            .clip(RoundedCornerShape(6.dp))
            .background(Color(0xFFFBF7EC))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(26.dp)) {
            Text("REPORT CARD", style = monoStyle(10f), color = Color(0xFF1E2A44))
            Text("SHARON R.", style = monoStyle(10f), color = Color(0xFF1E2A44))
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(5) {
                Box(Modifier.size(30.dp).border(1.5.dp, Color(0xFF1E2A44)), contentAlignment = Alignment.Center) {
                    Text("A", style = androidx.compose.ui.text.TextStyle(fontFamily = Fonts.hand, fontWeight = FontWeight.Bold, fontSize = 24.sp), color = Pal.stampRed)
                }
            }
        }
    }
}

// ---------------------------------------------------------------- chat

@Composable
private fun ChatCard(post: ChatPost, book: LoadedBook) {
    val s = LocalPrefs.current.textScale
    val reduce = LocalPrefs.current.reduceMotion
    CardFrame(themeOf("chat"), post.label, Arrangement.spacedBy(5.dp, Alignment.Top)) {
        var prev: String? = null
        post.msgs.forEachIndexed { j, m ->
            val me = m.who == book.book.narrator
            val first = m.who != prev
            prev = m.who
            val who = book.character(m.who)
            val anim = remember { Animatable(if (reduce) 1f else 0f) }
            LaunchedEffect(Unit) { delay(j * 280L); anim.animateTo(1f, tween(320)) }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = if (first) 7.dp else 0.dp, start = if (me) 48.dp else 0.dp, end = if (me) 0.dp else 36.dp)
                    .graphicsLayer { alpha = anim.value; translationY = (1f - anim.value) * 16.dp.toPx() },
                horizontalArrangement = if (me) Arrangement.End else Arrangement.Start,
                verticalAlignment = Alignment.Bottom,
            ) {
                if (!me) {
                    if (first) Avatar(who?.initials ?: "?", hex(who?.color ?: "#555555"), 28.dp, textSize = 12.5f)
                    else Box(Modifier.size(28.dp))
                    Box(Modifier.width(8.dp))
                }
                Column(
                    Modifier
                        .weight(1f, fill = false)
                        .clip(if (me) RoundedCornerShape(16.dp, 16.dp, 5.dp, 16.dp) else RoundedCornerShape(16.dp, 16.dp, 16.dp, 5.dp))
                        .background(if (me) Pal.sodium else Color(0xFF252C35))
                        .padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 9.dp),
                ) {
                    if (first) Text((who?.short ?: m.who).uppercase(), style = monoStyle(10f, FontWeight.SemiBold, 0.07f), color = (if (me) Pal.ink else Pal.onDark).copy(alpha = 0.7f))
                    Text(m.text, style = bodyStyle(15.5f, s, lineHeight = 1.4f), color = if (me) Pal.ink else Pal.onDark)
                }
            }
        }
    }
}


// ---------------------------------------------------------------- character

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CharacterCard(post: CharacterPost, book: LoadedBook) {
    val c = book.character(post.charId)
    val th = themeOf("steel")
    CardFrame(th, "New character unlocked") {
        if (c == null) {
            Prose("A new character joins the story.", th.fg)
        } else {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(92.dp).clip(CircleShape).background(Pal.sodium).padding(3.dp).clip(CircleShape).background(Pal.steel).padding(3.dp)) {
                Avatar(c.initials, hex(c.color), 80.dp, textSize = 34f)
            }
            Column(Modifier.padding(start = 16.dp)) {
                H3(c.name, th.fg)
                Text(c.role, style = monoStyle(12f, FontWeight.Normal, 0f), color = th.fg.copy(alpha = 0.75f), modifier = Modifier.padding(top = 5.dp))
            }
        }
        Prose(c.bio, th.fg)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            c.traits.forEach { t ->
                Text(
                    t, style = monoStyle(11.5f, FontWeight.Normal, 0f), color = th.fg,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Color(0xFF232A33)).border(1.dp, Pal.steel3, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
        }
    }
}

// ---------------------------------------------------------------- twist

@Composable
private fun TwistCard(post: TwistPost) {
    val s = LocalPrefs.current.textScale
    val stripes = Brush.linearGradient(
        0f to Pal.hazard, 0.5f to Pal.hazard, 0.5f to Color(0xFF141414), 1f to Color(0xFF141414),
        start = Offset.Zero, end = Offset(32f, 32f), tileMode = TileMode.Repeated,
    )
    Box(Modifier.fillMaxSize().background(stripes).padding(12.dp)) {
        CardFrame(CardTheme(Pal.onDark, Modifier.clip(RoundedCornerShape(10.dp)).background(Pal.steel)), null) {
            Text(
                "PLOT TWIST", style = displayStyle(15f, weight = FontWeight.Black, lineHeight = 1f).copy(letterSpacing = 0.14.em),
                color = Pal.hazard,
                modifier = Modifier.rotate(-3f).border(2.dp, Pal.hazard).padding(horizontal = 10.dp, vertical = 3.dp),
            )
            Text(post.head.uppercase(), style = displayStyle(40f, s, lineHeight = 0.94f), color = Pal.onDark)
            Prose(post.text, Pal.onDark)
            val reduce = LocalPrefs.current.reduceMotion
            val a = if (reduce) 1f else {
                val t = rememberInfiniteTransition(label = "blink")
                t.animateFloat(1f, 0.15f, infiniteRepeatable(tween(500), RepeatMode.Reverse), label = "a").value
            }
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color(0xFF0F1317)).padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(9.dp).graphicsLayer { alpha = a }.clip(CircleShape).background(Color(0xFFFF4B3E)))
                Text(post.status.uppercase(), style = monoStyle(12f, FontWeight.SemiBold, 0.04f), color = Color(0xFFFF7A6E), modifier = Modifier.padding(start = 9.dp))
            }
        }
    }
}

// ---------------------------------------------------------------- poll / guess

@Composable
private fun ChoiceCard(
    label: String, q: String, options: List<Option>, reveal: String, hint: String, revealLabel: String,
    answer: Int?, onAnswer: (Int) -> Unit,
) {
    val s = LocalPrefs.current.textScale
    CardFrame(themeOf("steel"), label, Arrangement.spacedBy(12.dp, Alignment.CenterVertically)) {
        Text(q.uppercase(), style = displayStyle(29f, s, FontWeight.ExtraBold, 0.98f), color = Pal.onDark)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEachIndexed { j, o ->
                val sel = answer == j
                val dim = answer != null && !sel
                Row(
                    Modifier
                        .fillMaxWidth()
                        .graphicsLayer { alpha = if (dim) 0.42f else 1f }
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (sel) Color(0xFF3A2A17) else Color(0xFF232A33))
                        .border(1.5.dp, if (sel) Pal.sodium else Pal.steel3, RoundedCornerShape(12.dp))
                        .then(if (answer == null) Modifier.clickable(role = Role.Button) { onAnswer(j) } else Modifier)
                        .padding(horizontal = 12.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        Modifier.size(22.dp).clip(CircleShape).background(if (sel) Pal.sodium else Color.Transparent).border(1.5.dp, if (sel) Pal.sodium else Pal.onDark, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Text("ABCD"[j].toString(), style = monoStyle(11f, FontWeight.SemiBold, 0f), color = if (sel) Pal.ink else Pal.onDark) }
                    Text(o.text, style = bodyStyle(15.5f, s, lineHeight = 1.35f), color = Pal.onDark, modifier = Modifier.padding(start = 12.dp))
                }
            }
        }
        if (answer != null) {
            Text(options[answer].feedback, style = monoStyle(12.5f, FontWeight.Normal, 0f), color = Pal.sodium)
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(8.dp)).background(Color(0xFF0F1317))) {
                Box(Modifier.width(3.dp).fillMaxHeight().background(Pal.tagGreen))
                Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                    Label(revealLabel, Pal.onDark)
                    Text(reveal, style = bodyStyle(15.5f, s, lineHeight = 1.5f), color = Pal.onDark, modifier = Modifier.padding(top = 6.dp))
                }
            }
        } else {
            Text(hint, style = monoStyle(12f, FontWeight.Normal, 0f), color = Pal.onDark.copy(alpha = 0.62f))
        }
    }
}

// ---------------------------------------------------------------- cross-off (legal pad)

@Composable
private fun CrossoffCard(post: CrossoffPost, crossed: List<Int>, onCross: (Int) -> Unit) {
    val s = LocalPrefs.current.textScale
    var last by remember(post.id) { mutableStateOf<Int?>(null) }
    val all = crossed.size >= post.items.size
    Box(Modifier.fillMaxSize().background(Color(0xFF262B32)).padding(12.dp)) {
        CardFrame(
            CardTheme(Pal.padInk, Modifier.clip(RoundedCornerShape(4.dp)).drawBehind {
                drawRect(Pal.pad)
                val rule = 34.dp.toPx()
                var y = rule
                while (y < size.height) { drawLine(Pal.padRule, Offset(0f, y), Offset(size.width, y), 1.2f); y += rule }
                val mx = 14.dp.toPx()
                drawLine(Pal.padMargin, Offset(mx, 0f), Offset(mx, size.height), 2f)
            }),
            null,
            Arrangement.spacedBy(2.dp, Alignment.Top),
        ) {
            Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
                Text(post.title, style = handStyle(28f * s), color = Pal.padInk, modifier = Modifier.weight(1f))
                Text("LEGAL PAD", style = monoStyle(9.5f), color = Pal.padInk.copy(alpha = 0.6f))
            }
            post.items.forEachIndexed { j, item ->
                val isX = j in crossed
                val frac by animateFloatAsState(if (isX) 1f else 0f, tween(400), label = "strike")
                Column {
                    Text(
                        item.text,
                        style = handStyle(25f * s, FontWeight.SemiBold),
                        color = if (isX) Pal.padInk.copy(alpha = 0.5f) else Pal.padInk,
                        modifier = Modifier
                            .then(if (!isX) Modifier.clickable(role = Role.Button) { last = j; onCross(j) } else Modifier)
                            .drawWithContent {
                                drawContent()
                                if (frac > 0f) drawLine(Pal.padMargin, Offset(0f, size.height * 0.58f), Offset(size.width * frac, size.height * 0.58f), 3.dp.toPx(), StrokeCap.Round)
                            }
                            .padding(vertical = 1.dp),
                    )
                    if (isX && last == j) {
                        Text(item.why, style = monoStyle(11.5f, FontWeight.Normal, 0f), color = Color(0xFF2E3646), modifier = Modifier.padding(bottom = 6.dp))
                    }
                }
            }
            Box(Modifier.height(10.dp))
            if (all) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("What’s left?  ", style = handStyle(25f * s, FontWeight.SemiBold), color = Pal.padInk)
                    Text(
                        post.answer, style = handStyle(33f * s), color = Pal.stampRed,
                        modifier = Modifier.rotate(-4f).drawBehind {
                            drawOval(Pal.stampRed, topLeft = Offset(-12.dp.toPx(), -2.dp.toPx()), size = Size(size.width + 24.dp.toPx(), size.height + 4.dp.toPx()), style = Stroke(3.dp.toPx()))
                        }.padding(horizontal = 4.dp),
                    )
                }
                if (post.note.isNotEmpty()) Text(post.note, style = monoStyle(11.5f, FontWeight.Normal, 0f), color = Color(0xFF2E3646), modifier = Modifier.padding(top = 10.dp))
            } else {
                Text("TAP EACH ONE TO CROSS IT OFF · ${crossed.size} OF ${post.items.size}", style = monoStyle(10.5f, FontWeight.Medium, 0.06f), color = Pal.padInk.copy(alpha = 0.7f))
            }
        }
    }
}

private fun handStyle(size: Float, weight: FontWeight = FontWeight.Bold) = androidx.compose.ui.text.TextStyle(
    fontFamily = Fonts.hand, fontWeight = weight,
    fontSize = size.sp,
    lineHeight = (size * 1.25f).sp,
)

// ---------------------------------------------------------------- myth / truth

@Composable
private fun MythCard(post: MythPost) {
    val s = LocalPrefs.current.textScale
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).fillMaxWidth().background(Color(0xFF2C1714)).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically)) {
            Tag("Myth", Pal.tagRed)
            Text(
                post.myth.uppercase(),
                style = displayStyle(28f, s, FontWeight.ExtraBold, 1.02f).copy(textDecoration = TextDecoration.LineThrough),
                color = Color(0xFFF3E2DE),
            )
        }
        Column(Modifier.weight(1f).fillMaxWidth().background(Color(0xFF10261A)).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically)) {
            Tag("Truth", Pal.tagGreen)
            Text(post.truth.uppercase(), style = displayStyle(28f, s, FontWeight.ExtraBold, 1.02f), color = Color(0xFFDDF0E3))
        }
    }
}

@Composable
private fun Tag(text: String, color: Color) {
    Row(
        Modifier.clip(RoundedCornerShape(3.dp, 6.dp, 6.dp, 3.dp)).background(color).padding(start = 8.dp, end = 12.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(Color(0x66000000)))
        Text(text.uppercase(), style = monoStyle(12f, FontWeight.SemiBold, 0.1f), color = Color.White, modifier = Modifier.padding(start = 8.dp))
    }
}

// ---------------------------------------------------------------- big idea

@Composable
private fun IdeaCard(post: IdeaPost, guess: String?) {
    val s = LocalPrefs.current.textScale
    val th = themeOf(post.theme)
    CardFrame(th, post.label, Arrangement.spacedBy(18.dp, Alignment.CenterVertically)) {
        if (post.visual == "meters") Meters(th.fg)
        Text(post.head.uppercase(), style = displayStyle(if (post.visual == "meters") 40f else 54f, s, lineHeight = 0.9f), color = th.fg)
        Text(post.sub, style = bodyStyle(17.5f, s, lineHeight = 1.5f), color = th.fg)
        if (guess != null) {
            Text(
                "Your guess earlier: $guess", style = monoStyle(12f, FontWeight.Normal, 0f),
                color = if (post.theme == "sodium") Pal.sodium else Pal.ink,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (post.theme == "sodium") Pal.ink else Pal.sodium).padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun Meters(fg: Color) {
    val reduce = LocalPrefs.current.reduceMotion
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf("Net profit", "Return on investment", "Cash flow").forEachIndexed { j, name ->
            val needle = remember { Animatable(if (reduce) 1f else 0f) }
            LaunchedEffect(Unit) { delay(j * 150L); needle.animateTo(1f, tween(1200)) }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Canvas(Modifier.fillMaxWidth().aspectRatio(100f / 58f)) {
                    val k = size.width / 100f
                    val center = Offset(50f * k, 50f * k)
                    val r = 40f * k
                    val arcTopLeft = Offset(center.x - r, center.y - r)
                    drawArc(Pal.steel3, 180f, 180f, false, arcTopLeft, Size(2 * r, 2 * r), style = Stroke(8f * k, cap = StrokeCap.Round))
                    drawArc(Pal.sodium, 180f, 150f * needle.value, false, arcTopLeft, Size(2 * r, 2 * r), style = Stroke(8f * k, cap = StrokeCap.Round))
                    val angle = Math.toRadians((180.0 + 146.0 * needle.value))
                    val tip = Offset(center.x + (33f * k * Math.cos(angle)).toFloat(), center.y + (33f * k * Math.sin(angle)).toFloat())
                    drawLine(fg, center, tip, 3f * k, StrokeCap.Round)
                    drawCircle(fg, 4.5f * k, center)
                }
                Text(name.uppercase(), style = monoStyle(10f, FontWeight.Medium, 0.06f), color = fg.copy(alpha = 0.85f), textAlign = TextAlign.Center)
                Text("▲ up", style = uiStyle(12.5f), color = Pal.ok)
            }
        }
    }
}

// ---------------------------------------------------------------- list (checklist / receipt)

@Composable
private fun ListCard(post: ListPost) {
    val s = LocalPrefs.current.textScale
    val th = themeOf(post.theme)
    if (post.style == "receipt") {
        CardFrame(th, null) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Pal.ticket).padding(16.dp)) {
                Label(post.label, Pal.ink)
                Text(post.h.uppercase(), style = displayStyle(28f, s, lineHeight = 0.95f), color = Pal.ink, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                post.items.forEach { item ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.5.dp), verticalAlignment = Alignment.Bottom) {
                        Text(item.text, style = monoStyle(12.5f, FontWeight.Normal, 0f), color = Pal.ink)
                        Box(
                            Modifier.weight(1f).padding(horizontal = 6.dp).height(10.dp).drawBehind {
                                drawLine(Pal.ink.copy(alpha = 0.4f), Offset(0f, size.height - 2f), Offset(size.width, size.height - 2f), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2f, 4f)))
                            },
                        )
                        Text(item.value ?: "", style = monoStyle(12.5f, FontWeight.SemiBold, 0f), color = Pal.ink)
                    }
                }
                if (post.total != null) {
                    Box(Modifier.padding(top = 12.dp).fillMaxWidth().height(2.dp).background(Pal.ink))
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Text("TOTAL", style = monoStyle(13f, FontWeight.SemiBold, 0f), color = Pal.ink, modifier = Modifier.weight(1f))
                        Text(post.total.uppercase(), style = monoStyle(13f, FontWeight.SemiBold, 0f), color = Pal.ink)
                    }
                }
            }
            if (post.text.isNotEmpty()) Prose(post.text, th.fg, 16.5f)
        }
        return
    }
    CardFrame(th, post.label) {
        H3(post.h, th.fg)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            post.items.forEach { item ->
                val (bg, mark, markColor) = when (item.state) {
                    "warn" -> Triple(Pal.hazard, "!", Pal.ink)
                    "no" -> Triple(Pal.tagRed, "✕", Color.White)
                    else -> Triple(Pal.tagGreen, "✓", Color.White)
                }
                Row(verticalAlignment = Alignment.Top) {
                    Box(Modifier.padding(top = 1.dp).size(22.dp).clip(RoundedCornerShape(5.dp)).background(bg), contentAlignment = Alignment.Center) {
                        Text(mark, style = monoStyle(13f, FontWeight.SemiBold, 0f), color = markColor)
                    }
                    Text(
                        item.text, style = bodyStyle(16f, s, weight = if (item.state == "no") FontWeight.SemiBold else FontWeight.Normal, lineHeight = 1.35f),
                        color = th.fg, modifier = Modifier.padding(start = 10.dp),
                    )
                }
            }
        }
        if (post.text.isNotEmpty()) Prose(post.text, th.fg, 16.5f)
    }
}

// ---------------------------------------------------------------- compare

@Composable
private fun CompareCard(post: ComparePost) {
    val s = LocalPrefs.current.textScale
    val th = themeOf("paper")
    CardFrame(th, post.label) {
        H3(post.h, th.fg)
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), verticalAlignment = Alignment.CenterVertically) {
            CompareCol(post.leftTitle, post.left, Modifier.weight(1f).fillMaxHeight())
            Text(post.mid, style = displayStyle(40f, lineHeight = 1f), color = Pal.tagRed, modifier = Modifier.padding(horizontal = 6.dp))
            CompareCol(post.rightTitle, post.right, Modifier.weight(1f).fillMaxHeight())
        }
        Prose(post.text, th.fg, 16.5f)
    }
}

@Composable
private fun CompareCol(title: String, items: List<String>, modifier: Modifier) {
    val s = LocalPrefs.current.textScale
    Column(modifier.clip(RoundedCornerShape(8.dp)).background(Color(0x99FFFFFF)).border(1.5.dp, Pal.ink, RoundedCornerShape(8.dp)).padding(10.dp)) {
        Text(title.uppercase(), style = monoStyle(10f, FontWeight.SemiBold, 0.08f), color = Pal.ink)
        items.forEach { Text(it, style = bodyStyle(14f, s, lineHeight = 1.3f), color = Pal.ink, modifier = Modifier.padding(top = 5.dp)) }
    }
}

// ---------------------------------------------------------------- artifact (order ticket)

@Composable
private fun ArtifactCard(post: ArtifactPost) {
    val th = themeOf("paper")
    CardFrame(th, null) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Label(post.label, Pal.ink)
                Text(post.number, style = displayStyle(54f, lineHeight = 0.88f), color = Pal.ink)
            }
            if (post.badge.isNotEmpty()) {
                Text(
                    post.badge.uppercase(), style = monoStyle(12f, FontWeight.SemiBold, 0f), color = Color.White, textAlign = TextAlign.Center,
                    modifier = Modifier.rotate(4f).clip(RoundedCornerShape(4.dp)).background(Pal.tagRed).padding(horizontal = 10.dp, vertical = 7.dp),
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(Pal.ink))
        Column {
            post.route.forEachIndexed { j, step ->
                val last = j == post.route.size - 1
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                    Box(Modifier.width(14.dp).fillMaxHeight()) {
                        if (!last) Box(Modifier.padding(top = 16.dp).align(Alignment.TopCenter).width(2.dp).fillMaxHeight().background(Pal.ink.copy(alpha = 0.25f)))
                        val fill = when (step.state) { "ok" -> Pal.tagGreen; "wait" -> Pal.hazard; else -> Color.Transparent }
                        Box(
                            Modifier.padding(top = 1.dp).size(14.dp).clip(CircleShape).background(fill)
                                .border(2.dp, if (step.state == "ok") Pal.tagGreen else Pal.ink.copy(alpha = if (step.state == "stop") 0.5f else 1f), CircleShape),
                        )
                    }
                    Column(Modifier.padding(start = 10.dp, bottom = 9.dp).graphicsLayer { alpha = if (step.state == "stop") 0.55f else 1f }) {
                        Text(step.text, style = monoStyle(12.5f, if (step.state == "wait") FontWeight.SemiBold else FontWeight.Normal, 0f), color = Pal.ink)
                        if (step.note != null) Text(step.note, style = monoStyle(11f, FontWeight.Normal, 0f), color = Pal.ink.copy(alpha = 0.75f))
                    }
                }
            }
        }
        if (post.text.isNotEmpty()) Prose(post.text, Pal.ink, 16f)
        if (post.foot != null) Foot(post.foot, Pal.ink)
    }
}

// ---------------------------------------------------------------- cliffhanger

@Composable
private fun CliffCard(post: CliffPost, book: LoadedBook, ch: Int, previewOnly: Boolean, onFinish: () -> Unit) {
    val s = LocalPrefs.current.textScale
    val next = if (ch < book.chapterCount) book.chapter(ch + 1) else null
    val nb = next?.let { hex(it.bg) } ?: Pal.sodiumDeep
    val nb2 = next?.bg2?.let { hex(it) } ?: Pal.steel
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(nb, nb2)))) {
        Column(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0x8C06080A), Color(0xE606080A))))
                .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(if (next == null) "THE END" else "TO BE CONTINUED", style = displayStyle(36f, lineHeight = 0.9f), color = Pal.sodium)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                Text(post.text, style = bodyStyle(18f, s, lineHeight = 1.55f), color = Color.White)
            }
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0x12FFFFFF)).border(1.dp, Color(0x38FFFFFF), RoundedCornerShape(14.dp)).padding(14.dp),
            ) {
                if (next != null) {
                    Label("Next · Chapter ${pad2(next.n)}", Color.White)
                    Text(next.title.uppercase(), style = displayStyle(28f, lineHeight = 0.95f), color = Color.White, modifier = Modifier.padding(vertical = 6.dp))
                    Text(next.hook, style = bodyStyle(15f, s, italic = true, lineHeight = 1.45f), color = Color.White.copy(alpha = 0.92f))
                } else {
                    Label("Book complete", Color.White)
                    Text("YOU FINISHED ${book.book.title.uppercase()}", style = displayStyle(28f, lineHeight = 0.95f), color = Color.White, modifier = Modifier.padding(vertical = 6.dp))
                    Text("Finish to collect the book badge.", style = bodyStyle(15f, s, italic = true), color = Color.White.copy(alpha = 0.92f))
                }
            }
            Box(
                Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(12.dp)).background(Pal.sodium).clickable(role = Role.Button, onClick = onFinish),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when {
                        previewOnly -> "See when it unlocks"
                        next == null -> "Finish the book"
                        else -> "Finish chapter"
                    },
                    style = uiStyle(15f, FontWeight.Bold), color = Pal.ink,
                )
            }
        }
    }
}

@Suppress("unused")
private val unusedDp: Dp = 0.dp
