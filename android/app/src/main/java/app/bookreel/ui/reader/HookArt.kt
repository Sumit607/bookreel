package app.bookreel.ui.reader

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.bookreel.ui.theme.Fonts
import app.bookreel.ui.theme.LocalPrefs
import app.bookreel.ui.theme.Pal
import app.bookreel.ui.theme.monoStyle
import kotlinx.coroutines.delay

private const val VW = 320f
private const val VH = 190f

/** Chapter-opening illustrations, drawn in code so they stay sharp at 120 Hz and cost no image bytes. */
@Composable
fun HookArt(art: String, text: String?, modifier: Modifier) {
    if (art == "board") {
        DepartureBoard(modifier)
        return
    }
    val tm = rememberTextMeasurer()
    Canvas(modifier.aspectRatio(VW / VH)) {
        virtual { drawArt(art, text, tm) }
    }
}

/** Draws in a 320 × 190 coordinate space scaled to fit the canvas. */
private fun DrawScope.virtual(block: DrawScope.() -> Unit) {
    val s = minOf(size.width / VW, size.height / VH)
    val ox = (size.width - VW * s) / 2f
    val oy = (size.height - VH * s) / 2f
    withTransform({ translate(ox, oy); scale(s, s, Offset.Zero) }) { block() }
}

private fun DrawScope.label(tm: TextMeasurer, text: String, x: Float, y: Float, size: Float, color: Color, mono: Boolean = true, weight: FontWeight = FontWeight.Medium, center: Boolean = true, family: FontFamily? = null) {
    val style = TextStyle(
        fontFamily = family ?: if (mono) Fonts.mono else Fonts.display, fontWeight = weight,
        fontSize = size.toSp(), color = color, textAlign = TextAlign.Center,
    )
    val layout = tm.measure(text, style)
    val left = if (center) x - layout.size.width / 2f else x
    drawText(layout, topLeft = Offset(left, y - layout.size.height / 2f))
}

private fun DrawScope.rr(color: Color, x: Float, y: Float, w: Float, h: Float, r: Float = 0f) =
    drawRoundRect(color, Offset(x, y), Size(w, h), CornerRadius(r, r))

private fun DrawScope.drawArt(art: String, text: String?, tm: TextMeasurer) {
    val parts = text?.split("|").orEmpty()
    when (art) {
        "parking" -> parking(tm)
        "hill" -> hill()
        "clock" -> clock(tm, parts.getOrNull(0) ?: "3:00 AM", parts.getOrNull(1) ?: "")
        "skyline" -> skyline(tm, parts.getOrNull(0) ?: "")
        "trail" -> trail(tm, parts.getOrNull(0) ?: "")
        "dice" -> dice()
        "house" -> house()
        "machine" -> machine(tm, parts.getOrNull(0) ?: "NCX-10", parts.getOrNull(1) ?: "RUNNING")
        "stamp" -> stamp(tm, parts.getOrNull(0) ?: "SHIPPED", parts.getOrNull(1) ?: "")
        "drum" -> drum(tm)
        "bars" -> bars(tm, parts.getOrNull(0) ?: "")
        "chain" -> chain(tm, parts.getOrNull(0) ?: "")
        "lens" -> lens(tm, parts.getOrNull(0) ?: "")
        "fog" -> fog(tm, parts.getOrNull(0) ?: "")
        "door" -> door(tm, parts.getOrNull(0)?.ifEmpty { null } ?: "221B", parts.getOrNull(1) ?: "")
        "desert" -> desert(tm, parts.getOrNull(0) ?: "")
        "countdown" -> countdown(tm, parts.getOrNull(0)?.ifEmpty { null } ?: "29", parts.getOrNull(1) ?: "")
        "pills" -> pills(tm, parts.getOrNull(0) ?: "")
        "ring" -> ring(tm, parts.getOrNull(0) ?: "")
        "cab" -> cab(tm, parts.getOrNull(0) ?: "")
        "lab" -> lab(tm, parts.getOrNull(0) ?: "")
        "peaks" -> peaks(tm, parts.getOrNull(0) ?: "", parts.getOrNull(1) == "night")
        else -> stamp(tm, parts.getOrNull(0) ?: "BOOKREEL", parts.getOrNull(1) ?: "")
    }
}

// ---- 1. The plant manager's parking space, with the boss's crimson car in it.
private fun DrawScope.parking(tm: TextMeasurer) {
    rr(Color(0xFF262A30), 0f, 0f, VW, VH, 14f)
    listOf(40f, 160f, 280f).forEach { x -> drawLine(Pal.hazard, Offset(x, 0f), Offset(x, 152f), 4f) }
    label(tm, "PLANT MANAGER", 100f, 172f, 11f, Color(0xFFE9E4D8))
    label(tm, "CONTROLLER", 220f, 172f, 11f, Color(0xFF8B9097))
    rr(Color(0xFFB3202A), 66f, 16f, 68f, 126f, 17f)
    rr(Color(0xFF3A0D12), 74f, 42f, 52f, 24f, 6f)
    rr(Color(0xFF3A0D12), 76f, 104f, 48f, 17f, 5f)
    rr(Color(0xFFF0ECE4), 84f, 130f, 32f, 8f, 1.5f)
    label(tm, "NUMBER 1", 100f, 134f, 5.2f, Pal.ink, weight = FontWeight.SemiBold)
    rr(Color(0xFF5E7FA6), 193f, 36f, 54f, 102f, 14f)
    rr(Color(0xFF1D2A3A), 200f, 57f, 40f, 19f, 5f)
    rr(Color(0xFF1D2A3A), 201f, 108f, 38f, 13f, 4f)
}

// ---- 3. The plant seen from the hillside on a clear spring afternoon.
private fun DrawScope.hill() {
    drawRoundRect(Brush.verticalGradient(listOf(Color(0xFF5F9BD3), Color(0xFFA9CDEB), Color(0xFFD9E7EF)), 0f, 110f), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))
    drawCircle(Color(0x55FFF1C4), 34f, Offset(250f, 40f))
    drawCircle(Color(0xFFFFF1C4), 22f, Offset(250f, 40f))
    rr(Color(0xFF7E848C), 192f, 76f, 90f, 14f)
    drawRect(Brush.verticalGradient(listOf(Color(0xFFC2A867), Color(0xFF9A8250)), 102f, VH), Offset(0f, 102f), Size(VW, VH - 102f))
    rr(Color(0xFF8B9097), 180f, 90f, 96f, 13f)
    rr(Color(0xFF717780), 46f, 64f, 148f, 40f)
    rr(Color(0xFFA9C3D6), 26f, 84f, 42f, 20f)
    rr(Color(0xFFE9E4D8), 196f, 94f, 22f, 9f)
    rr(Color(0xFFE9E4D8), 222f, 94f, 22f, 9f)
    drawRect(Color(0xFF5D5446), Offset(0f, 124f), Size(VW, 5f))
    drawOval(Color(0xFF5E4E2C), Offset(-50f, 140f), Size(280f, 120f))
    rr(Color(0xFF5E7FA6), 96f, 146f, 38f, 14f, 5f)
}

// ---- Night: a digital clock and a crescent moon (the 3 AM call).
private fun DrawScope.clock(tm: TextMeasurer, time: String, place: String) {
    drawRoundRect(Brush.verticalGradient(listOf(Color(0xFF0B1022), Color(0xFF1F1A3A))), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))
    listOf(20f to 22f, 60f to 50f, 110f to 18f, 290f to 30f, 250f to 70f, 30f to 120f, 300f to 140f, 150f to 40f).forEach { (x, y) ->
        drawCircle(Color(0xCCFFFFFF), 1.3f, Offset(x, y))
    }
    drawCircle(Color(0xFFF6E7B0), 22f, Offset(262f, 44f))
    drawCircle(Color(0xFF151632), 20f, Offset(272f, 38f))
    rr(Color(0xFF0A0A0C), 70f, 70f, 180f, 70f, 10f)
    rr(Color(0xFF1A1A20), 76f, 76f, 168f, 58f, 7f)
    label(tm, time, 160f, 106f, 34f, Color(0xFFFF4B3E), weight = FontWeight.SemiBold)
    if (place.isNotEmpty()) label(tm, place, 160f, 162f, 11f, Color(0xFFB9B3D8))
}

// ---- A city skyline at dawn (breakfast in New York).
private fun DrawScope.skyline(tm: TextMeasurer, caption: String) {
    drawRoundRect(Brush.verticalGradient(listOf(Color(0xFF2B2440), Color(0xFFE08A5A), Color(0xFFF6C976))), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))
    drawCircle(Color(0xFFFFE3A0), 20f, Offset(230f, 120f))
    val towers = listOf(10f to 70f, 38f to 110f, 64f to 85f, 92f to 140f, 120f to 95f, 150f to 120f, 178f to 80f, 204f to 150f, 232f to 100f, 262f to 125f, 290f to 90f)
    towers.forEachIndexed { i, (x, h) ->
        val top = VH - h
        rr(Color(0xFF1B1D2A), x, top, 26f, h)
        var wy = top + 10f
        while (wy < VH - 8f) {
            if ((i + wy.toInt() / 10) % 3 != 0) rr(Color(0xFFF6C976), x + 6f, wy, 4f, 4f)
            if ((i * 7 + wy.toInt() / 10) % 4 == 0) rr(Color(0xFFF6C976), x + 15f, wy, 4f, 4f)
            wy += 12f
        }
    }
    if (caption.isNotEmpty()) label(tm, caption, 70f, 26f, 13f, Color(0xFFF6E7D0), weight = FontWeight.SemiBold)
}

// ---- A line of hikers spreading out along a trail, the slow one highlighted.
private fun DrawScope.trail(tm: TextMeasurer, caption: String) {
    drawRoundRect(Brush.verticalGradient(listOf(Color(0xFF3E5F2F), Color(0xFF2A4220))), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))
    listOf(30f, 90f, 250f, 300f).forEach { x ->
        val p = Path().apply { moveTo(x, 20f); lineTo(x - 14f, 52f); lineTo(x + 14f, 52f); close() }
        drawPath(p, Color(0xFF223A1A))
    }
    val path = Path().apply { moveTo(10f, 150f); cubicTo(90f, 100f, 170f, 170f, 310f, 92f) }
    drawPath(path, Color(0xFFC9B48A), style = Stroke(16f, cap = StrokeCap.Round))
    // hikers: tight at the front (right), gaps growing toward the back (left)
    val ts = listOf(0.97f, 0.93f, 0.89f, 0.84f, 0.76f, 0.70f, 0.58f, 0.50f, 0.33f)
    ts.forEach { t -> drawCircle(Pal.onDark, 5f, bez(t)) }
    drawCircle(Pal.sodium, 8f, bez(0.12f))
    label(tm, if (caption.isNotEmpty()) caption else "THE GAP GROWS", 92f, 26f, 12f, Pal.onDark, weight = FontWeight.SemiBold)
}

private fun bez(t: Float): Offset {
    val u = 1 - t
    val x = u * u * u * 10f + 3 * u * u * t * 90f + 3 * u * t * t * 170f + t * t * t * 310f
    val y = u * u * u * 150f + 3 * u * u * t * 100f + 3 * u * t * t * 170f + t * t * t * 92f
    return Offset(x, y)
}

// ---- A die, matchsticks and bowls (the matchstick game).
private fun DrawScope.dice() {
    drawRoundRect(Brush.verticalGradient(listOf(Color(0xFF6E5A2E), Color(0xFF4F3F1F))), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))
    for (i in 0 until 5) {
        val cx = 40f + i * 52f
        drawOval(Color(0xFFE9E4D8), Offset(cx - 22f, 128f), Size(44f, 22f))
        drawOval(Color(0xFFBFB8A8), Offset(cx - 18f, 131f), Size(36f, 14f))
        val n = listOf(3, 1, 5, 2, 4)[i]
        for (m in 0 until n) {
            val x = cx - 10f + m * 5f
            drawLine(Color(0xFFF2D9A0), Offset(x, 136f), Offset(x + 3f, 116f), 2.5f)
            drawCircle(Pal.tagRed, 2.6f, Offset(x + 3f, 115f))
        }
    }
    rotate(-12f, Offset(160f, 62f)) {
        rr(Color(0xFFF7F3EA), 130f, 32f, 60f, 60f, 12f)
        listOf(144f to 46f, 176f to 46f, 144f to 78f, 176f to 78f).forEach { (x, y) -> drawCircle(Pal.ink, 5f, Offset(x, y)) }
    }
}

// ---- A dark house with one lit window.
private fun DrawScope.house() {
    drawRoundRect(Brush.verticalGradient(listOf(Color(0xFF0E1220), Color(0xFF2A2440))), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))
    drawCircle(Color(0xFFF6E7B0), 16f, Offset(270f, 38f))
    val roof = Path().apply { moveTo(80f, 86f); lineTo(160f, 36f); lineTo(240f, 86f); close() }
    drawPath(roof, Color(0xFF14121E))
    rr(Color(0xFF1C1928), 92f, 86f, 136f, 84f)
    rr(Color(0xFF2A2638), 108f, 102f, 28f, 26f)
    rr(Color(0xFFF6C976), 184f, 102f, 28f, 26f)
    drawCircle(Color(0x33F6C976), 40f, Offset(198f, 115f))
    rr(Color(0xFF2A2638), 146f, 132f, 26f, 38f)
    rr(Color(0xFF3A3548), 236f, 156f, 70f, 14f)
    drawRect(Color(0xFF0B0A12), Offset(0f, 170f), Size(VW, 20f))
}

// ---- The NCX-10: a lavender machine with its status light.
private fun DrawScope.machine(tm: TextMeasurer, name: String, status: String) {
    rr(Color(0xFF20262E), 0f, 0f, VW, VH, 12f)
    drawRect(Color(0xFF2B323C), Offset(0f, 160f), Size(VW, 30f))
    rr(Color(0xFFB6A3E8), 40f, 34f, 170f, 126f, 10f)
    rr(Color(0xFF8E7CC9), 52f, 48f, 92f, 64f, 6f)
    rr(Color(0xFF14171C), 58f, 54f, 80f, 52f, 4f)
    drawLine(Color(0xFF9FD8C9), Offset(64f, 92f), Offset(132f, 66f), 2f)
    for (r in 0 until 3) for (c in 0 until 3) {
        val col = listOf(Color(0xFFFF4B3E), Pal.ok, Pal.hazard)[(r + c) % 3]
        drawCircle(col, 4.5f, Offset(162f + c * 14f, 60f + r * 14f))
    }
    rr(Color(0xFF6F5FA8), 52f, 122f, 146f, 26f, 4f)
    label(tm, name, 125f, 135f, 13f, Color.White, mono = false, weight = FontWeight.Black)
    val bad = status.contains("DOWN") || status.contains("IDLE") || status.contains("LOST")
    rr(Color(0xFF0F1317), 222f, 66f, 82f, 46f, 8f)
    drawCircle(if (bad) Color(0xFFFF4B3E) else Pal.ok, 6f, Offset(238f, 89f))
    label(tm, status, 274f, 89f, 9f, if (bad) Color(0xFFFF7A6E) else Pal.ok, weight = FontWeight.SemiBold)
    drawRect(Color(0xFF3A414C), Offset(30f, 160f), Size(190f, 6f))
}

// ---- A rubber stamp on a shipping ticket.
private fun DrawScope.stamp(tm: TextMeasurer, word: String, sub: String) {
    rr(Pal.ticket, 0f, 0f, VW, VH, 12f)
    var y = 0f
    while (y < VH) { drawLine(Color(0x1417191C), Offset(0f, y), Offset(VW, y), 1f); y += 18f }
    rotate(-7f, Offset(160f, 95f)) {
        rr(Color.Transparent, 40f, 50f, 240f, 90f)
        drawRoundRect(Pal.tagGreen, Offset(40f, 50f), Size(240f, 90f), CornerRadius(8f, 8f), style = Stroke(5f))
        drawRoundRect(Pal.tagGreen, Offset(48f, 58f), Size(224f, 74f), CornerRadius(5f, 5f), style = Stroke(1.5f))
        label(tm, word, 160f, 92f, if (word.length > 9) 30f else 40f, Pal.tagGreen, mono = false, weight = FontWeight.Black)
        if (sub.isNotEmpty()) label(tm, sub, 160f, 124f, 10f, Pal.tagGreen, weight = FontWeight.SemiBold)
    }
}

// ---- Drum, buffer, rope: the drum sets the pace, a rope ties the line to it.
private fun DrawScope.drum(tm: TextMeasurer) {
    drawRoundRect(Brush.verticalGradient(listOf(Color(0xFF2E9C5A), Color(0xFF1C6A3C))), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))
    drawOval(Color(0xFFE9E4D8), Offset(36f, 60f), Size(90f, 30f))
    rr(Color(0xFFC8312A), 36f, 75f, 90f, 54f)
    drawOval(Color(0xFFC8312A), Offset(36f, 114f), Size(90f, 30f))
    drawOval(Color(0xFFF2EDE4), Offset(38f, 61f), Size(86f, 28f))
    for (i in 0 until 5) drawLine(Color(0xFFF2D9A0), Offset(42f + i * 20f, 80f), Offset(52f + i * 20f, 128f), 2f)
    drawLine(Color(0xFF8B5A2B), Offset(70f, 40f), Offset(96f, 70f), 5f, StrokeCap.Round)
    val rope = Path().apply { moveTo(126f, 100f); cubicTo(170f, 70f, 220f, 130f, 300f, 100f) }
    drawPath(rope, Color(0xFFF2D9A0), style = Stroke(3f, cap = StrokeCap.Round))
    listOf(160f, 196f, 232f, 268f, 296f).forEachIndexed { i, x ->
        drawCircle(Pal.onDark, 6f, Offset(x, 150f - (i % 2) * 4f))
    }
    label(tm, "DRUM · BUFFER · ROPE", 210f, 30f, 11f, Color.White, weight = FontWeight.SemiBold)
}

// ---- Rising bars (throughput up).
private fun DrawScope.bars(tm: TextMeasurer, caption: String) {
    rr(Pal.steel, 0f, 0f, VW, VH, 12f)
    drawLine(Color(0xFF38414C), Offset(30f, 160f), Offset(300f, 160f), 2f)
    val hs = listOf(28f, 34f, 30f, 46f, 62f, 84f, 110f)
    hs.forEachIndexed { i, h ->
        val x = 40f + i * 37f
        rr(if (i == hs.size - 1) Pal.sodium else Color(0xFF5B6470), x, 160f - h, 24f, h, 4f)
    }
    val p = Path().apply { moveTo(52f, 128f); lineTo(126f, 122f); lineTo(200f, 92f); lineTo(274f, 44f) }
    drawPath(p, Pal.ok, style = Stroke(3f, cap = StrokeCap.Round))
    drawCircle(Pal.ok, 5f, Offset(274f, 44f))
    if (caption.isNotEmpty()) label(tm, caption, 40f, 26f, 12f, Pal.onDark, weight = FontWeight.SemiBold, center = false)
}

// ---- A chain with one weak link.
private fun DrawScope.chain(tm: TextMeasurer, caption: String) {
    rr(Color(0xFF17191C), 0f, 0f, VW, VH, 12f)
    for (i in 0 until 7) {
        val x = 18f + i * 42f
        val weak = i == 4
        val color = if (weak) Pal.tagRed else Color(0xFF9AA3AE)
        if (i % 2 == 0) drawRoundRect(color, Offset(x, 80f), Size(56f, 30f), CornerRadius(15f, 15f), style = Stroke(if (weak) 4f else 7f))
        else drawRoundRect(color, Offset(x + 6f, 89f), Size(44f, 12f), CornerRadius(6f, 6f), style = Stroke(if (weak) 4f else 7f))
    }
    drawLine(Pal.tagRed, Offset(196f, 72f), Offset(204f, 86f), 2f)
    drawLine(Pal.tagRed, Offset(208f, 104f), Offset(214f, 118f), 2f)
    label(tm, if (caption.isNotEmpty()) caption else "THE WEAKEST LINK", 160f, 150f, 12f, Pal.sodium, weight = FontWeight.SemiBold)
}

// ======== Mystery set (A Study in Scarlet and other classics). Same drawings as web/public/js/art.js.

private fun DrawScope.bg(colors: List<Color>, y1: Float = 0f, y2: Float = VH) =
    drawRoundRect(Brush.verticalGradient(colors, y1, y2), Offset.Zero, Size(VW, VH), CornerRadius(12f, 12f))

private fun DrawScope.ellipse(color: Color, cx: Float, cy: Float, rx: Float, ry: Float) =
    drawOval(color, Offset(cx - rx, cy - ry), Size(rx * 2, ry * 2))

private fun DrawScope.caption(tm: TextMeasurer, text: String, x: Float, y: Float, size: Float, color: Color, center: Boolean = false) {
    if (text.isNotEmpty()) label(tm, text, x, y, size, color, weight = FontWeight.SemiBold, center = center)
}

// ---- A magnifying glass over a word written on a wall.
private fun DrawScope.lens(tm: TextMeasurer, caption: String) {
    bg(listOf(Color(0xFF3A0F14), Color(0xFF1A0709)))
    var y = 18f
    while (y < VH) { drawLine(Color(0x12F6E7D6), Offset(20f, y), Offset(300f, y), 1f); y += 22f }
    rotate(-6f, Offset(120f, 100f)) {
        val layout = tm.measure("RACHE", TextStyle(fontFamily = Fonts.hand, fontWeight = FontWeight.Bold, fontSize = 44f.toSp(), color = Color(0xFFC21F2B)))
        drawText(layout, topLeft = Offset(70f, 110f - layout.firstBaseline))
    }
    drawCircle(Color(0x0FF6E7D6), 48f, Offset(200f, 86f))
    drawCircle(Color(0xFFE9D9C2), 48f, Offset(200f, 86f), style = Stroke(7f))
    drawLine(Color(0xFF8B5A2B), Offset(232f, 122f), Offset(272f, 166f), 11f, StrokeCap.Round)
    caption(tm, caption, 24f, 24f, 11f, Color(0xFFF6E7D6))
}

// ---- A gas lamp in London fog.
private fun DrawScope.fog(tm: TextMeasurer, caption: String) {
    bg(listOf(Color(0xFF2C3440), Color(0xFF59606A), Color(0xFFA7A9A3)))
    listOf(20f to 70f, 70f to 96f, 118f to 60f, 160f to 110f, 214f to 80f, 262f to 100f).forEach { (x, h) -> rr(Color(0xFF20262E), x, VH - h, 42f, h) }
    rr(Color(0xFF20262E), 140f, 40f, 6f, 110f)
    drawCircle(Color(0xFFF6C976), 9f, Offset(143f, 36f))
    drawCircle(Color(0x40F6C976), 30f, Offset(143f, 36f))
    for (i in 0 until 4) ellipse(Color(0x33D9DCDF), 60f + i * 70f, 150f - (i % 2) * 14f, 80f, 12f)
    caption(tm, caption, 24f, 24f, 11f, Color(0xFFF0ECE4))
}

// ---- A front door between two lit windows.
private fun DrawScope.door(tm: TextMeasurer, number: String, caption: String) {
    rr(Color(0xFF1C2A24), 0f, 0f, VW, VH, 12f)
    rr(Color(0xFF3B2A20), 0f, 166f, VW, 24f)
    rr(Color(0xFF14201B), 110f, 22f, 100f, 144f, 4f)
    rr(Color(0xFF0F1813), 122f, 34f, 76f, 60f, 3f)
    rr(Color(0xFF0F1813), 122f, 102f, 76f, 58f, 3f)
    drawCircle(Color(0xFFC9A24A), 5f, Offset(190f, 104f))
    rr(Color(0xFFC9A24A), 140f, 6f, 40f, 14f, 3f)
    label(tm, number, 160f, 13f, 10f, Pal.ink, weight = FontWeight.SemiBold)
    rr(Pal.lamp, 40f, 40f, 44f, 56f, 3f)
    rr(Pal.lamp, 236f, 40f, 44f, 56f, 3f)
    drawLine(Color(0xFF1C2A24), Offset(62f, 40f), Offset(62f, 96f), 2f)
    drawLine(Color(0xFF1C2A24), Offset(258f, 40f), Offset(258f, 96f), 2f)
    caption(tm, caption, 160f, 178f, 11f, Color(0xFFE9E4D8), center = true)
}

// ---- A salt desert under a hard sun.
private fun DrawScope.desert(tm: TextMeasurer, caption: String) {
    bg(listOf(Color(0xFFF0B35A), Color(0xFFE9D3A2)), 0f, 120f)
    drawCircle(Color(0xFFFFF3D0), 24f, Offset(250f, 44f))
    drawPath(Path().apply {
        moveTo(0f, 108f); lineTo(60f, 70f); lineTo(110f, 96f); lineTo(170f, 52f); lineTo(230f, 92f); lineTo(280f, 66f); lineTo(320f, 88f)
        lineTo(320f, VH); lineTo(0f, VH); close()
    }, Color(0xFFB98A5A))
    drawPath(Path().apply { moveTo(0f, 132f); cubicTo(80f, 118f, 200f, 140f, 320f, 124f); lineTo(320f, VH); lineTo(0f, VH); close() }, Color(0xFFE8DCC4))
    rr(Color(0xFF6B5A48), 92f, 140f, 3f, 18f)
    rr(Color(0xFF6B5A48), 104f, 140f, 3f, 18f)
    drawPath(Path().apply { moveTo(86f, 140f); lineTo(113f, 140f); lineTo(100f, 128f); close() }, Color(0xFF6B5A48))
    drawCircle(Color(0xFF3A2E24), 4f, Offset(210f, 150f))
    drawCircle(Color(0xFF3A2E24), 2.5f, Offset(222f, 154f))
    caption(tm, caption, 24f, 24f, 11f, Color(0xFF3A2E24))
}

// ---- A number chalked on a wooden wall.
private fun DrawScope.countdown(tm: TextMeasurer, num: String, caption: String) {
    rr(Color(0xFF3A2B1F), 0f, 0f, VW, VH, 12f)
    var x = 0f
    while (x < VW) { rr(Color(0xFF33251A), x, 0f, 2f, VH); x += 26f }
    label(tm, num, 160f, 104f, 96f, Color(0xFFE9D9C2), weight = FontWeight.Bold, family = Fonts.hand)
    caption(tm, caption, 160f, 170f, 11f, Color(0xFFE9D9C2), center = true)
}

// ---- A box with two identical pills.
private fun DrawScope.pills(tm: TextMeasurer, caption: String) {
    rr(Color(0xFF14181D), 0f, 0f, VW, VH, 12f)
    ellipse(Color(0xFF0C0F12), 160f, 132f, 96f, 20f)
    rr(Color(0xFFE9E4D8), 98f, 70f, 124f, 52f, 8f)
    rr(Color(0xFFC9C2B2), 98f, 70f, 124f, 14f, 8f)
    drawCircle(Color(0xFFF0ECE4), 13f, Offset(136f, 102f))
    drawCircle(Color(0xFFD7D0C0), 13f, Offset(184f, 102f))
    label(tm, "?", 136f, 102f, 14f, Color(0xFF7E1D22), weight = FontWeight.SemiBold)
    label(tm, "?", 184f, 102f, 14f, Color(0xFF7E1D22), weight = FontWeight.SemiBold)
    caption(tm, caption, 160f, 34f, 12f, Color(0xFFF6E7D6), center = true)
}

// ---- A woman's gold wedding ring.
private fun DrawScope.ring(tm: TextMeasurer, caption: String) {
    bg(listOf(Color(0xFF241A1E), Color(0xFF120D10)))
    drawOval(Color(0xFFE2B65A), Offset(114f, 58f), Size(92f, 80f), style = Stroke(12f))
    drawOval(Color(0xFFFFF0B3), Offset(114f, 58f), Size(92f, 80f), style = Stroke(2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 18f))))
    drawPath(Path().apply { moveTo(126f, 82f); quadraticTo(160f, 60f, 194f, 82f) }, Color(0xB3FFF7D6), style = Stroke(3f, cap = StrokeCap.Round))
    caption(tm, caption, 160f, 168f, 12f, Color(0xFFF6E7D6), center = true)
}

// ---- A horse-drawn cab at night.
private fun DrawScope.cab(tm: TextMeasurer, caption: String) {
    bg(listOf(Color(0xFF1E2733), Color(0xFF0E1218)))
    rr(Color(0xFF2B2F35), 0f, 150f, VW, 40f)
    rr(Color(0xFF2E1B12), 120f, 78f, 108f, 64f, 8f)
    rr(Color(0xFF40281A), 128f, 86f, 46f, 32f, 4f)
    rr(Color(0x99F6C976), 182f, 88f, 36f, 26f, 4f)
    drawCircle(Color(0xFFB8A27A), 18f, Offset(146f, 148f), style = Stroke(5f))
    drawCircle(Color(0xFFB8A27A), 18f, Offset(210f, 148f), style = Stroke(5f))
    rr(Color(0xFF2E1B12), 92f, 50f, 22f, 10f, 3f)
    drawLine(Color(0xFF2E1B12), Offset(103f, 60f), Offset(128f, 86f), 4f)
    drawPath(Path().apply { moveTo(24f, 110f); cubicTo(40f, 92f, 60f, 92f, 80f, 104f); lineTo(92f, 130f); lineTo(24f, 130f); close() }, Color(0xFF3A2E24))
    drawCircle(Color(0xFF3A2E24), 10f, Offset(62f, 92f))
    caption(tm, caption, 24f, 24f, 11f, Color(0xFFE9E4D8))
}

// ---- A chemistry bench: test tubes and a flask over a burner.
private fun DrawScope.lab(tm: TextMeasurer, caption: String) {
    bg(listOf(Color(0xFF1F3A3A), Color(0xFF0E1E1E)))
    rr(Color(0xFF3B2A20), 0f, 150f, VW, 40f)
    rr(Color(0xFF2A1D16), 0f, 150f, VW, 5f)
    rr(Color(0xFF6B4A33), 40f, 120f, 120f, 8f, 2f)
    rr(Color(0xFF6B4A33), 46f, 128f, 6f, 22f)
    rr(Color(0xFF6B4A33), 148f, 128f, 6f, 22f)
    listOf(Color(0xFFC21F2B) to 0.55f, Color(0xFFE9E4D8) to 0.25f, Color(0xFF7FC8B8) to 0.4f, Color(0xFFE2B65A) to 0.6f).forEachIndexed { i, (c, f) ->
        val x = 56f + i * 24f
        rr(Color(0x55CFE7E3), x, 66f, 14f, 58f, 7f)
        rr(c, x + 2f, 66f + 56f * (1 - f), 10f, 56f * f, 5f)
    }
    val flask = Path().apply { moveTo(222f, 70f); lineTo(222f, 96f); lineTo(198f, 136f); lineTo(268f, 136f); lineTo(244f, 96f); lineTo(244f, 70f); close() }
    drawPath(flask, Color(0x33CFE7E3))
    drawPath(Path().apply { moveTo(206f, 124f); lineTo(260f, 124f); lineTo(268f, 136f); lineTo(198f, 136f); close() }, Color(0xD9C21F2B))
    drawPath(flask, Color(0xFFCFE7E3), style = Stroke(2.5f))
    rr(Color(0xFFCFE7E3), 218f, 64f, 30f, 6f, 2f)
    rr(Color(0xFF59606A), 214f, 140f, 38f, 10f, 2f)
    drawPath(Path().apply { moveTo(233f, 150f); cubicTo(226f, 158f, 240f, 160f, 233f, 168f); cubicTo(246f, 160f, 236f, 156f, 233f, 150f); close() }, Color(0xFF6FB6FF))
    listOf(Triple(230f, 112f, 3f), Triple(238f, 104f, 2f), Triple(226f, 98f, 2.5f)).forEach { (x, y, r) -> drawCircle(Color(0xCCF6E7D6), r, Offset(x, y)) }
    caption(tm, caption, 24f, 28f, 12f, Color(0xFFCFF2E8))
}

// ---- Mountains over a valley: wheat fields by day, a pass under the stars by night.
private fun DrawScope.peaks(tm: TextMeasurer, caption: String, night: Boolean) {
    bg(if (night) listOf(Color(0xFF0E1C2A), Color(0xFF1F3B57)) else listOf(Color(0xFF8FB8DE), Color(0xFFD6E6F0)), 0f, 120f)
    if (night) {
        listOf(30f to 20f, 70f to 44f, 120f to 16f, 180f to 30f, 250f to 18f, 292f to 50f, 210f to 60f, 150f to 52f).forEach { (x, y) -> drawCircle(Color(0xCCFFFFFF), 1.3f, Offset(x, y)) }
        drawCircle(Color(0xFFE6EEF6), 12f, Offset(262f, 34f))
        drawCircle(Color(0xFF0E1C2A), 11f, Offset(268f, 30f))
    } else {
        drawCircle(Color(0xFFFFF3D0), 18f, Offset(268f, 40f))
    }
    drawPath(Path().apply {
        moveTo(0f, 132f); lineTo(52f, 70f); lineTo(84f, 100f); lineTo(132f, 40f); lineTo(176f, 96f); lineTo(214f, 60f); lineTo(262f, 110f); lineTo(320f, 74f)
        lineTo(320f, VH); lineTo(0f, VH); close()
    }, if (night) Color(0xFF16283A) else Color(0xFF5E7A8E))
    drawPath(Path().apply { moveTo(132f, 40f); lineTo(146f, 58f); lineTo(138f, 56f); lineTo(128f, 64f); lineTo(120f, 54f); close() }, Color(0xFFE6EEF6))
    drawPath(Path().apply { moveTo(214f, 60f); lineTo(226f, 74f); lineTo(216f, 72f); lineTo(206f, 76f); close() }, Color(0xFFE6EEF6))
    drawPath(Path().apply { moveTo(0f, 150f); cubicTo(70f, 130f, 150f, 160f, 320f, 136f); lineTo(320f, VH); lineTo(0f, VH); close() }, if (night) Color(0xFF0B1520) else Color(0xFF4E7A5C))
    if (night) {
        drawPath(Path().apply { moveTo(300f, 190f); cubicTo(250f, 166f, 210f, 160f, 176f, 146f) }, Color(0xFF3A5470),
            style = Stroke(5f, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2f, 9f))))
    } else {
        drawPath(Path().apply { moveTo(0f, 166f); cubicTo(60f, 156f, 120f, 162f, 170f, 154f); lineTo(170f, VH); lineTo(0f, VH); close() }, Color(0xFFD9B95C))
        drawPath(Path().apply { moveTo(170f, 154f); cubicTo(220f, 148f, 270f, 152f, 320f, 146f); lineTo(320f, VH); lineTo(170f, VH); close() }, Color(0xFF6E9A5A))
        for (i in 0 until 12) {
            val x = 10f + i * 14f
            val dy = (i % 3) * 4f
            drawLine(Color(0xFFB8963F), Offset(x, 172f + dy), Offset(x + 4f, 164f + dy), 2f, StrokeCap.Round)
        }
        rr(Color(0xFF7A4E2E), 236f, 150f, 26f, 16f, 2f)
        drawPath(Path().apply { moveTo(232f, 151f); lineTo(249f, 140f); lineTo(266f, 151f); close() }, Color(0xFF5A3622))
    }
    caption(tm, caption, 24f, if (night) 176f else 26f, 12f, if (night) Color(0xFFE6EEF6) else Color(0xFF0F1A14))
}

// ---- 2. Split-flap departure board with animated letters.
@Composable
private fun DepartureBoard(modifier: Modifier) {
    val rows = listOf("NEW YORK " to "FINAL CALL", "HOUSTON  " to "BOARDING  ", "ATLANTA  " to "ON TIME   ")
    val finals = remember { rows.flatMap { (a, b) -> (a + b).toList() } }
    val reduce = LocalPrefs.current.reduceMotion
    val shown = remember { mutableStateListOf<Char>().apply { addAll(if (reduce) finals else finals.map { if (it == ' ') ' ' else 'A' }) } }
    LaunchedEffect(Unit) {
        if (reduce) return@LaunchedEffect
        val letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        for (step in 0 until 14) {
            for (i in finals.indices) {
                if (finals[i] == ' ') continue
                shown[i] = if (step >= 4 + i % 10) finals[i] else letters[(i * 7 + step * 5) % letters.length]
            }
            delay(60)
        }
        for (i in finals.indices) shown[i] = finals[i]
    }
    Column(
        modifier.widthIn(max = 340.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFF0D1117)).padding(horizontal = 10.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth()) {
            Text("DEPARTURES", style = monoStyle(10f, FontWeight.SemiBold, 0.14f), color = Pal.sodium, modifier = Modifier.weight(1f))
            Text("O’HARE", style = monoStyle(10f, FontWeight.SemiBold, 0.14f), color = Pal.sodium)
        }
        rows.forEachIndexed { r, _ ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (k in 0 until 19) {
                    val i = r * 19 + k
                    if (k == 9) Box(Modifier.width(4.dp))
                    val ch = shown[i]
                    Box(
                        Modifier.weight(1f).aspectRatio(3f / 4.3f).clip(RoundedCornerShape(2.dp)).background(Color(0xFF1E252E)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            ch.toString(),
                            style = monoStyle(13f, FontWeight.SemiBold, 0f),
                            color = if (r == 0 && k >= 9) Pal.sodium else Color(0xFFF3E9D2),
                        )
                        Box(Modifier.align(Alignment.Center).fillMaxWidth().height(1.dp).background(Color(0xFF0B0E12)))
                    }
                }
            }
        }
    }
}
