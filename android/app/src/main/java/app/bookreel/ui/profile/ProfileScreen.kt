package app.bookreel.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.bookreel.BuildConfig
import app.bookreel.data.UserState
import app.bookreel.domain.Rules
import app.bookreel.ui.AppIcon
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.Ic
import app.bookreel.ui.Label
import app.bookreel.ui.Sheet
import app.bookreel.ui.Stat
import app.bookreel.ui.theme.LocalColors
import app.bookreel.ui.theme.bodyStyle
import app.bookreel.ui.theme.displayStyle
import app.bookreel.ui.theme.monoStyle
import app.bookreel.ui.theme.uiStyle

@Composable
fun ProfileScreen(vm: AppViewModel, state: UserState) {
    val c = LocalColors.current
    val goal = vm.books["the-goal"]
    val chaptersDone = state.completions.size
    val booksDone = vm.books.values.count { b -> Rules.completedCount(state, b.id) >= b.chapterCount }
    Column(
        Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(64.dp).clip(CircleShape).background(Color(0xFF2F5F8A)), contentAlignment = Alignment.Center) {
                AppIcon(Ic.person, Color.White, size = 30.dp)
            }
            Column(Modifier.padding(start = 14.dp)) {
                Text("READER", style = displayStyle(30f), color = c.fg)
                Text("Guest · progress saved on this phone", style = uiStyle(13f, FontWeight.Normal), color = c.muted)
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.surface2).padding(vertical = 14.dp)) {
            Stat("${Rules.displayedStreak(state, vm.now(), vm.zone)}", "streak", c.fg, c.muted)
            Stat("${state.bestStreak}", "best", c.fg, c.muted)
            Stat("${Rules.totalXp(state)}", "XP", c.fg, c.muted)
            Stat("$chaptersDone", "chapters", c.fg, c.muted)
            Stat("$booksDone", "books", c.fg, c.muted)
        }

        Section("Badges")
        if (goal != null) {
            val badges = Rules.badges(state, goal.id, goal.book.title, goal.chapterCount)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                badges.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { b ->
                            Row(
                                Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(if (b.earned) c.accent else c.surface2).padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AppIcon(if (b.earned) Ic.medal else Ic.lock, if (b.earned) c.accentInk else c.muted, size = 26.dp)
                                Column(Modifier.padding(start = 10.dp)) {
                                    Text(b.title, style = uiStyle(13.5f), color = if (b.earned) c.accentInk else c.fg)
                                    Text(b.detail, style = uiStyle(11.5f, FontWeight.Normal), color = if (b.earned) c.accentInk else c.muted)
                                }
                            }
                        }
                    }
                }
            }
        }

        Section("Reading")
        SettingRow("Theme") {
            Segmented(listOf("system" to "System", "light" to "Light", "dark" to "Dark"), state.settings.theme) { v -> vm.updateSettings { it.copy(theme = v) } }
        }
        SettingRow("Text size") {
            Segmented(listOf("0.9" to "S", "1.0" to "M", "1.15" to "L"), when { state.settings.textScale < 0.95f -> "0.9"; state.settings.textScale > 1.1f -> "1.15"; else -> "1.0" }) { v ->
                vm.updateSettings { it.copy(textScale = v.toFloat()) }
            }
        }
        SettingRow("Daily release time") {
            Segmented(listOf("19" to "7 PM", "20" to "8 PM", "21" to "9 PM"), state.settings.releaseHour.toString()) { v -> vm.updateSettings { it.copy(releaseHour = v.toInt()) } }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Reduce motion", style = uiStyle(14.5f, FontWeight.Medium), color = c.fg)
                Text("Turns off card and stamp animations", style = uiStyle(12f, FontWeight.Normal), color = c.muted)
            }
            Switch(
                checked = state.settings.reduceMotion,
                onCheckedChange = { on -> vm.updateSettings { it.copy(reduceMotion = on) } },
                colors = SwitchDefaults.colors(checkedTrackColor = c.accent, checkedThumbColor = c.accentInk),
            )
        }
        Text(
            "Swipes run at 120 Hz when the phone’s display setting allows it. On Vivo phones, keep the screen refresh rate on High or Smart switch.",
            style = bodyStyle(13.5f, lineHeight = 1.45f), color = c.muted,
        )

        Section("About")
        Text(
            "Bookreel ${BuildConfig.VERSION_NAME}. The Goal is included for private testing only and must not be shared outside this phone.",
            style = bodyStyle(13.5f, lineHeight = 1.45f), color = c.muted,
        )
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, c.line, RoundedCornerShape(12.dp)).clickable(role = Role.Button) { vm.sheet = Sheet.HowItWorks }.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppIcon(Ic.info, c.fg, size = 20.dp)
            Text("How Bookreel works", style = uiStyle(14f, FontWeight.Medium), color = c.fg, modifier = Modifier.padding(start = 10.dp))
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, c.line, RoundedCornerShape(12.dp)).clickable(role = Role.Button) { vm.sheet = Sheet.ConfirmReset }.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppIcon(Ic.close, Color(0xFFD63A2F), size = 20.dp)
            Text("Reset reading progress", style = uiStyle(14f, FontWeight.Medium), color = Color(0xFFD63A2F), modifier = Modifier.padding(start = 10.dp))
        }
        Box(Modifier.height(8.dp))
    }
}

@Composable
private fun Section(title: String) {
    Label(title, LocalColors.current.muted, alpha = 1f, modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun SettingRow(title: String, control: @Composable () -> Unit) {
    val c = LocalColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = uiStyle(14.5f, FontWeight.Medium), color = c.fg, modifier = Modifier.weight(1f))
        control()
    }
}

@Composable
private fun Segmented(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    val c = LocalColors.current
    Row(Modifier.clip(RoundedCornerShape(10.dp)).background(c.surface2).padding(3.dp)) {
        options.forEach { (value, label) ->
            val on = value == selected
            Box(
                Modifier.clip(RoundedCornerShape(8.dp)).background(if (on) c.surface else Color.Transparent).clickable(role = Role.Tab) { onSelect(value) }.padding(horizontal = 12.dp, vertical = 7.dp),
            ) { Text(label, style = monoStyle(12.5f, if (on) FontWeight.SemiBold else FontWeight.Normal, 0f), color = if (on) c.fg else c.muted) }
        }
    }
}
