package app.bookreel

import android.app.Application
import app.bookreel.data.BookRepository
import app.bookreel.data.StateStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File

class BookreelApp : Application() {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val repo by lazy { BookRepository(this) }
    val store by lazy { StateStore(File(filesDir, "state.json"), appScope) }
}
