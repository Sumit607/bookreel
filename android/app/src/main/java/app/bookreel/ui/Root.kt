package app.bookreel.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.bookreel.ui.book.BookScreen
import app.bookreel.ui.complete.CompleteScreen
import app.bookreel.ui.library.LibraryScreen
import app.bookreel.ui.notebook.NotebookScreen
import app.bookreel.ui.profile.ProfileScreen
import app.bookreel.ui.reader.ReaderScreen
import app.bookreel.ui.sheets.SheetContent
import app.bookreel.ui.theme.BookreelTheme
import app.bookreel.ui.theme.LocalColors
import app.bookreel.ui.theme.ReadingPrefs
import app.bookreel.ui.theme.uiStyle

@Composable
fun BookreelRoot(vm: AppViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val dark = when (state.settings.theme) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    // Respect Android's "Remove animations" setting as well as the in-app switch.
    val context = androidx.compose.ui.platform.LocalContext.current
    val systemNoAnim = androidx.compose.runtime.remember {
        android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val prefs = ReadingPrefs(state.settings.textScale, state.settings.reduceMotion || systemNoAnim)
    BookreelTheme(dark, prefs) {
        val c = LocalColors.current
        val screen = vm.top
        val immersive = screen is Screen.Reader || screen is Screen.Complete
        SystemBarIcons(lightIcons = dark || immersive)
        BackHandler(enabled = vm.sheet != null || vm.stack.size > 1 || screen != Screen.Library) { vm.back() }

        Box(Modifier.fillMaxSize().background(if (immersive) app.bookreel.ui.theme.Pal.reader else c.bg)) {
            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    Crossfade(targetState = screen, animationSpec = tween(if (prefs.reduceMotion) 0 else 160), label = "screen") { s ->
                        Box(Modifier.fillMaxSize().background(if (s is Screen.Reader || s is Screen.Complete) app.bookreel.ui.theme.Pal.reader else c.surface)) {
                            when (s) {
                                Screen.Library -> LibraryScreen(vm, state)
                                Screen.Notebook -> NotebookScreen(vm, state)
                                Screen.Profile -> ProfileScreen(vm, state)
                                is Screen.BookPage -> BookScreen(vm, state, s.bookId)
                                is Screen.Reader -> ReaderScreen(vm, state, s)
                                is Screen.Complete -> CompleteScreen(vm, state, s)
                            }
                        }
                    }
                }
                if (!immersive) BottomNav(vm, screen)
            }

            // Bottom sheet overlay
            AnimatedVisibility(vm.sheet != null, enter = fadeIn(tween(150)), exit = fadeOut(tween(150))) {
                Box(Modifier.fillMaxSize().background(Color(0x80050608)).clickable(indication = null, interactionSource = null) { vm.sheet = null })
            }
            AnimatedVisibility(
                vm.sheet != null,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically(tween(220)) { it / 3 } + fadeIn(tween(180)),
                exit = slideOutVertically(tween(180)) { it / 3 } + fadeOut(tween(150)),
            ) {
                val sheet = vm.sheet
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                        .background(c.surface)
                        .clickable(indication = null, interactionSource = null) { }
                        .navigationBarsPadding()
                        .verticalScroll(rememberScrollState())
                        .padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 22.dp),
                ) {
                    Box(Modifier.align(Alignment.CenterHorizontally).padding(top = 4.dp, bottom = 14.dp).width(40.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(c.line))
                    if (sheet != null) SheetContent(vm, state, sheet)
                }
            }

            // Toast
            val toast = vm.toast
            AnimatedVisibility(
                toast != null,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 86.dp, start = 16.dp, end = 16.dp),
                enter = fadeIn(tween(150)), exit = fadeOut(tween(200)),
            ) {
                Text(
                    toast ?: "",
                    style = uiStyle(13f, FontWeight.Medium),
                    color = c.surface,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.widthIn(max = 420.dp).clip(RoundedCornerShape(10.dp)).background(c.fg).padding(horizontal = 14.dp, vertical = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun SystemBarIcons(lightIcons: Boolean) {
    val view = LocalView.current
    if (view.isInEditMode) return
    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        val controller = WindowCompat.getInsetsController(window, view)
        controller.isAppearanceLightStatusBars = !lightIcons
        controller.isAppearanceLightNavigationBars = !lightIcons
    }
}

@Composable
private fun BottomNav(vm: AppViewModel, screen: Screen) {
    val c = LocalColors.current
    val tab = when (screen) {
        Screen.Notebook -> 1
        Screen.Profile -> 2
        else -> 0
    }
    Column(Modifier.fillMaxWidth().background(c.surface)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.line))
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(top = 6.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.SpaceAround,
        ) {
            NavItem("Library", Ic.home, tab == 0) { vm.setTab(Screen.Library) }
            NavItem("Notebook", Ic.bookmark, tab == 1) { vm.setTab(Screen.Notebook) }
            NavItem("Profile", Ic.person, tab == 2) { vm.setTab(Screen.Profile) }
        }
    }
}

@Composable
private fun NavItem(label: String, icon: ImageVector, selected: Boolean, onClick: () -> Unit) {
    val c = LocalColors.current
    val color = if (selected) c.fg else c.muted
    Column(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AppIcon(icon, color, size = 25.dp, description = label)
        Text(label, style = uiStyle(10.5f), color = color, modifier = Modifier.padding(top = 2.dp))
    }
}

/** Small outlined pill used in headers (streak, saved count). */
@Composable
fun HeaderChip(icon: ImageVector, text: String, onClick: (() -> Unit)? = null) {
    val c = LocalColors.current
    Row(
        Modifier
            .height(36.dp)
            .clip(RoundedCornerShape(50))
            .border(1.dp, c.line, RoundedCornerShape(50))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppIcon(icon, c.accent, size = 18.dp)
        Box(Modifier.size(5.dp))
        Text(text, style = app.bookreel.ui.theme.monoStyle(13f, FontWeight.SemiBold, 0f), color = c.fg)
    }
}
