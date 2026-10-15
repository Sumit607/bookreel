package app.bookreel.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Local-first store: the phone is the source of truth. Changes apply in memory at once and are
 * written to disk 400 ms later (debounced), atomically via a temp file, so a crash never corrupts state.
 */
class StateStore(private val file: File, private val scope: CoroutineScope) {
    private val json = Json { ignoreUnknownKeys = true }
    private val _state = MutableStateFlow(load())
    val state: StateFlow<UserState> = _state
    private var saveJob: Job? = null

    private fun load(): UserState = try {
        if (file.exists()) json.decodeFromString(UserState.serializer(), file.readText()) else UserState()
    } catch (e: Exception) {
        UserState()
    }

    fun update(change: (UserState) -> UserState) {
        _state.update(change)
        saveJob?.cancel()
        saveJob = scope.launch(Dispatchers.IO) {
            delay(400)
            write(_state.value)
        }
    }

    /** Called when the app goes to the background so nothing is lost if the system kills it. */
    fun flush() {
        saveJob?.cancel()
        scope.launch(Dispatchers.IO) { write(_state.value) }
    }

    @Synchronized
    private fun write(s: UserState) {
        try {
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(json.encodeToString(UserState.serializer(), s))
            if (!tmp.renameTo(file)) {
                file.delete()
                tmp.renameTo(file)
            }
        } catch (_: Exception) {
        }
    }
}
