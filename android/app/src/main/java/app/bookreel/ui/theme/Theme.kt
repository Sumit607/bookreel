package app.bookreel.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.bookreel.R

/** App chrome colours; the reader and post cards use the fixed [Pal] palette instead. */
@Immutable
data class AppColors(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val fg: Color,
    val muted: Color,
    val line: Color,
    val accent: Color,
    val accentInk: Color,
    val tileLocked: Color,
    val tileLockedFg: Color,
    val isDark: Boolean,
)

val LightColors = AppColors(
    bg = Color(0xFFE4E7EB), surface = Color(0xFFFBFBFC), surface2 = Color(0xFFEDF0F3),
    fg = Color(0xFF15181D), muted = Color(0xFF5B6470), line = Color(0xFFD6DAE0),
    accent = Color(0xFFD2541A), accentInk = Color(0xFFFFFFFF),
    tileLocked = Color(0xFFDCE0E6), tileLockedFg = Color(0xFF56606C), isDark = false,
)

val DarkColors = AppColors(
    bg = Color(0xFF07080A), surface = Color(0xFF111418), surface2 = Color(0xFF1B1F25),
    fg = Color(0xFFECEEF1), muted = Color(0xFF98A1AD), line = Color(0xFF2A2F37),
    accent = Color(0xFFFF8740), accentInk = Color(0xFF1A0E06),
    tileLocked = Color(0xFF1C2128), tileLockedFg = Color(0xFF7F8995), isDark = true,
)

/** The plant-floor palette from the prototype: steel, sodium-lamp orange, red and green job tags. */
object Pal {
    val steel = Color(0xFF1B2026)
    val steel2 = Color(0xFF262D35)
    val steel3 = Color(0xFF38414C)
    val onDark = Color(0xFFF0ECE4)
    val reader = Color(0xFF0B0D10)
    val chat = Color(0xFF11151A)
    val sodium = Color(0xFFF4A23C)
    val sodiumDeep = Color(0xFFE0611C)
    val tagRed = Color(0xFFD63A2F)
    val tagGreen = Color(0xFF2E9C5A)
    val ok = Color(0xFF43C27A)
    val ticket = Color(0xFFF1EDE2)
    val ink = Color(0xFF17191C)
    val hazard = Color(0xFFF2C200)
    val night = Color(0xFF1A1830)
    val nightFg = Color(0xFFF3EDE2)
    val flash = Color(0xFF2A231E)
    val flashFg = Color(0xFFEFE4D2)
    val pad = Color(0xFFF8E79B)
    val padRule = Color(0xFFA9C1DE)
    val padMargin = Color(0xFFD9665B)
    val padInk = Color(0xFF1B2230)
    val stampRed = Color(0xFFB3202A)
    val lamp = Color(0xFFF6C976)
}

object Fonts {
    val display = FontFamily(
        Font(R.font.display_semibold, FontWeight.SemiBold),
        Font(R.font.display_extrabold, FontWeight.ExtraBold),
        Font(R.font.display_black, FontWeight.Black),
    )
    val body = FontFamily(
        Font(R.font.literata_regular, FontWeight.Normal),
        Font(R.font.literata_medium, FontWeight.Medium),
        Font(R.font.literata_semibold, FontWeight.SemiBold),
        Font(R.font.literata_italic, FontWeight.Normal, FontStyle.Italic),
    )
    val mono = FontFamily(
        Font(R.font.plexmono_regular, FontWeight.Normal),
        Font(R.font.plexmono_medium, FontWeight.Medium),
        Font(R.font.plexmono_semibold, FontWeight.SemiBold),
    )
    val hand = FontFamily(
        Font(R.font.caveat_semibold, FontWeight.SemiBold),
        Font(R.font.caveat_bold, FontWeight.Bold),
    )
}

/** Reader preferences that every post card reads. */
@Immutable
data class ReadingPrefs(val textScale: Float = 1f, val reduceMotion: Boolean = false)

val LocalColors = staticCompositionLocalOf { LightColors }
val LocalPrefs = staticCompositionLocalOf { ReadingPrefs() }

@Composable
fun BookreelTheme(dark: Boolean, prefs: ReadingPrefs, content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalColors provides if (dark) DarkColors else LightColors,
        LocalPrefs provides prefs,
        content = content,
    )
}

// ---------- text styles ----------
private fun scaled(size: Float, scale: Float): TextUnit = (size * scale).sp

fun displayStyle(size: Float, scale: Float = 1f, weight: FontWeight = FontWeight.Black, lineHeight: Float = 0.92f) =
    TextStyle(
        fontFamily = Fonts.display, fontWeight = weight, fontSize = scaled(size, scale),
        lineHeight = scaled(size * lineHeight, scale), letterSpacing = 0.005.em,
    )

fun bodyStyle(size: Float, scale: Float = 1f, italic: Boolean = false, weight: FontWeight = FontWeight.Normal, lineHeight: Float = 1.55f) =
    TextStyle(
        fontFamily = Fonts.body, fontWeight = weight, fontSize = scaled(size, scale),
        lineHeight = scaled(size * lineHeight, scale),
        fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
    )

fun monoStyle(size: Float, weight: FontWeight = FontWeight.Medium, spacing: Float = 0.09f) =
    TextStyle(
        fontFamily = Fonts.mono, fontWeight = weight, fontSize = size.sp,
        lineHeight = (size * 1.45f).sp, letterSpacing = spacing.em,
    )

fun uiStyle(size: Float, weight: FontWeight = FontWeight.SemiBold) =
    TextStyle(fontFamily = FontFamily.Default, fontWeight = weight, fontSize = size.sp, lineHeight = (size * 1.3f).sp)

fun hex(s: String): Color = try {
    Color(android.graphics.Color.parseColor(s))
} catch (e: Exception) {
    Pal.steel
}
