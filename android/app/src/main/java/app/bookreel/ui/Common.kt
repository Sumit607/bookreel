package app.bookreel.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.bookreel.ui.theme.LocalColors
import app.bookreel.ui.theme.monoStyle
import app.bookreel.ui.theme.uiStyle

/** Mono uppercase label, the "eyebrow" used on every card and section. */
@Composable
fun Label(text: String, color: Color, modifier: Modifier = Modifier, size: Float = 11f, alpha: Float = 0.75f) {
    Text(text.uppercase(), style = monoStyle(size), color = color.copy(alpha = alpha), modifier = modifier)
}

@Composable
fun AppIcon(icon: ImageVector, tint: Color, modifier: Modifier = Modifier, size: Dp = 24.dp, description: String? = null) {
    Icon(imageVector = icon, contentDescription = description, tint = tint, modifier = modifier.size(size))
}

/** Segmented progress bar: stories-style for the reader, book progress on the book page. */
@Composable
fun Segments(total: Int, filled: (Int) -> Boolean, on: Color, off: Color, modifier: Modifier = Modifier, height: Dp = 3.dp, gap: Dp = 4.dp) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap)) {
        repeat(total) { i ->
            Box(
                Modifier
                    .weight(1f)
                    .height(height)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (filled(i)) on else off),
            )
        }
    }
}

enum class BtnKind { Primary, Secondary, Ghost }

@Composable
fun AppButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.Primary,
    icon: ImageVector? = null,
    ghostColor: Color = Color.White,
) {
    val c = LocalColors.current
    val (bg, fg) = when (kind) {
        BtnKind.Primary -> c.accent to c.accentInk
        BtnKind.Secondary -> c.surface2 to c.fg
        BtnKind.Ghost -> Color.Transparent to ghostColor
    }
    Row(
        modifier
            .heightIn(min = 46.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bg)
            .then(if (kind == BtnKind.Ghost) Modifier.border(1.dp, ghostColor.copy(alpha = 0.3f), RoundedCornerShape(12.dp)) else Modifier)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            AppIcon(icon, fg, size = 18.dp)
            if (text.isNotEmpty()) Box(Modifier.size(8.dp))
        }
        if (text.isNotEmpty()) Text(text, style = uiStyle(14.5f), color = fg, textAlign = TextAlign.Center)
    }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalColors.current
    Box(
        modifier
            .height(34.dp)
            .clip(RoundedCornerShape(50))
            .background(if (selected) c.fg else Color.Transparent)
            .border(1.dp, if (selected) c.fg else c.line, RoundedCornerShape(50))
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = uiStyle(13f), color = if (selected) c.surface else c.fg)
    }
}

/** Circle with initials, used for characters and the reader header. */
@Composable
fun Avatar(initials: String, bg: Color, size: Dp, fg: Color = Color.White, textSize: Float = 18f, modifier: Modifier = Modifier) {
    Box(modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Text(initials, style = app.bookreel.ui.theme.displayStyle(textSize, weight = FontWeight.ExtraBold, lineHeight = 1f), color = fg)
    }
}

/** Clickable without the ripple, for large tap areas such as cards. */
@Composable
fun Modifier.plainClick(onClick: () -> Unit): Modifier {
    val source = remember { MutableInteractionSource() }
    return this.clickable(interactionSource = source, indication = null, onClick = onClick)
}

@Composable
fun RowScope.Stat(value: String, label: String, valueColor: Color, labelColor: Color) {
    androidx.compose.foundation.layout.Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = app.bookreel.ui.theme.displayStyle(26f, weight = FontWeight.ExtraBold, lineHeight = 1.05f), color = valueColor)
        Text(label, style = uiStyle(12.5f, FontWeight.Normal), color = labelColor)
    }
}

fun pad2(n: Int) = n.toString().padStart(2, '0')

fun compactCount(x: Int): String = if (x >= 1000) {
    val v = x / 100 / 10.0
    (if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()) + "k"
} else x.toString()

fun Modifier.horizontalGutter(): Modifier = this.padding(horizontal = 16.dp)
