package app.bookreel

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import app.bookreel.ui.AppViewModel
import app.bookreel.ui.BookreelRoot

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels { AppViewModel.Factory }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        preferHighestRefreshRate()
        setContent { BookreelRoot(vm) }
    }

    override fun onStart() {
        super.onStart()
        vm.refreshBooks()
    }

    override fun onStop() {
        super.onStop()
        (application as BookreelApp).store.flush()
    }

    /** Ask for the screen's highest refresh rate (120 Hz on the Vivo V60) at the current resolution. */
    private fun preferHighestRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val d = display ?: return
        val current = d.mode
        val best = d.supportedModes
            .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
            .maxByOrNull { it.refreshRate } ?: return
        val attrs = window.attributes
        attrs.preferredDisplayModeId = best.modeId
        window.attributes = attrs
    }
}
