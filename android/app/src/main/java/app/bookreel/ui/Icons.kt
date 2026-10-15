package app.bookreel.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** Line icons drawn from the same SVG paths as the prototype, so the app and the design match. */
object Ic {
    private fun icon(name: String, filled: Boolean, vararg paths: String): ImageVector {
        val b = ImageVector.Builder(
            name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f,
        )
        paths.forEach { d ->
            b.addPath(
                pathData = addPathNodes(d),
                fill = if (filled) SolidColor(Color.Black) else null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.8f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return b.build()
    }

    private const val HEART = "M12 20.5s-6.9-4.3-9.4-8.6C.9 8.8 2.7 4.9 6.4 4.6c2.3-.2 4 1.1 5.6 3.1 1.6-2 3.3-3.3 5.6-3.1 3.7.3 5.5 4.2 3.8 7.3C18.9 16.2 12 20.5 12 20.5z"
    private const val BOOKMARK = "M6 3.5h12v17.2l-6-4.5-6 4.5z"

    val heart = icon("heart", false, HEART)
    val heartFilled = icon("heartFilled", true, HEART)
    val bookmark = icon("bookmark", false, BOOKMARK)
    val bookmarkFilled = icon("bookmarkFilled", true, BOOKMARK)
    val comment = icon("comment", false, "M20.5 11.6a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.2a8.5 8.5 0 1 1 15.6-4.7z")
    val send = icon("send", false, "M21.5 3 10.3 14.2M21.5 3l-6.8 18-4.4-6.8L3.5 9.8z")
    val close = icon("close", false, "M5.5 5.5l13 13M18.5 5.5l-13 13")
    val back = icon("back", false, "M15 5l-7 7 7 7")
    val grid = icon("grid", false, "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z")
    val flame = icon("flame", false, "M12 21.5c-4 0-6.8-2.8-6.8-6.5 0-3.8 3.1-5.9 4.1-9.9.2-.9 1.3-1.2 1.9-.5 2.5 2.9 2.6 5.1 2.4 6.6 1-.5 1.8-1.5 2.1-2.8.2-.7 1.1-.9 1.5-.3 1.1 1.7 1.7 3.7 1.7 5.9 0 4.1-2.9 7.5-6.9 7.5z")
    val lock = icon("lock", false, "M5 10.5h14v10H5z", "M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7")
    val info = icon("info", false, "M12 3a9 9 0 1 0 .01 0z", "M12 11v6M12 7.6v.2")
    val check = icon("check", false, "M5 12.5l4.5 4.5L19 7.5")
    val arrow = icon("arrow", false, "M5 12h14M13 6l6 6-6 6")
    val home = icon("home", false, "M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z")
    val person = icon("person", false, "M12 4.5a4 4 0 1 0 .01 0z", "M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6")
    val search = icon("search", false, "M11 4a7 7 0 1 0 .01 0z", "M20 20l-4-4")
    val play = icon("play", true, "M8 5.5v13l10.5-6.5z")
    val medal = icon("medal", false, "M12 9a5.5 5.5 0 1 0 .01 0z", "M8.6 3.5l2.1 5.9M15.4 3.5l-2.1 5.9")
    val book = icon("book", false, "M5 4.5h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z", "M5 17.5a3 3 0 0 1 3-3h11")
}
