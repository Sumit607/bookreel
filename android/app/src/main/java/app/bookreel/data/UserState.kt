package app.bookreel.data

import kotlinx.serialization.Serializable

/**
 * Everything the reader has done, stored on the phone as one small JSON file.
 * Keys: "bookId:chapter" for chapters, "bookId:postId" for posts, "bookId:loopId" for guesses.
 */
@Serializable
data class UserState(
    val progress: Map<String, Int> = emptyMap(),
    val lastOpened: LastOpened? = null,
    val completions: Map<String, Completion> = emptyMap(),
    val viewed: Map<String, List<Int>> = emptyMap(),
    val answers: Map<String, Int> = emptyMap(),
    val crossed: Map<String, List<Int>> = emptyMap(),
    val guesses: Map<String, String> = emptyMap(),
    val likes: List<String> = emptyList(),
    val saves: Map<String, SavedPost> = emptyMap(),
    val xp: List<XpEntry> = emptyList(),
    val streak: Int = 0,
    val bestStreak: Int = 0,
    val lastDay: String? = null,
    val modes: Map<String, String> = emptyMap(),
    val reminders: Map<String, Long> = emptyMap(),
    val settings: Settings = Settings(),
)

@Serializable
data class LastOpened(val bookId: String, val ch: Int, val post: Int)

@Serializable
data class Completion(val at: Long, val dayKey: String, val viewed: Int)

@Serializable
data class SavedPost(val bookId: String, val ch: Int, val index: Int, val at: Long)

@Serializable
data class XpEntry(val event: String, val ref: String, val amount: Int)

@Serializable
data class Settings(
    val theme: String = "system",
    val textScale: Float = 1f,
    val reduceMotion: Boolean = false,
    val releaseHour: Int = 20,
)
