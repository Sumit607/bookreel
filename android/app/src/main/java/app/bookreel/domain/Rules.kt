package app.bookreel.domain

import app.bookreel.data.Completion
import app.bookreel.data.UserState
import app.bookreel.data.XpEntry
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Where a chapter stands for this reader. */
sealed interface ChapterLock {
    data object Open : ChapterLock
    data object NeedsPrevious : ChapterLock
    data class WaitingUntil(val at: Long) : ChapterLock
}

data class Badge(val id: String, val title: String, val detail: String, val earned: Boolean)

/** All game and unlock rules. Pure functions of state + time, so they are unit-tested on the JVM. */
object Rules {
    const val XP_CHAPTER = 100
    const val XP_ANSWER = 20
    const val XP_BOOK = 500
    const val XP_STREAK7 = 200
    const val MIN_VIEWED_FOR_XP = 8
    const val BINGE = "binge"
    const val DAILY = "daily"

    fun key(bookId: String, ch: Int) = "$bookId:$ch"
    fun postKey(bookId: String, postId: String) = "$bookId:$postId"

    fun isComplete(s: UserState, bookId: String, ch: Int) = s.completions.containsKey(key(bookId, ch))
    fun completedCount(s: UserState, bookId: String) = s.completions.keys.count { it.startsWith("$bookId:") }
    fun mode(s: UserState, bookId: String) = s.modes[bookId] ?: BINGE

    fun dayKey(at: Long, zone: ZoneId): String = Instant.ofEpochMilli(at).atZone(zone).toLocalDate().toString()

    /** The first release time (e.g. 20:00) that is at least 8 hours after the previous chapter was finished. */
    fun releaseAt(completedAt: Long, releaseHour: Int, zone: ZoneId): Long {
        val earliest = Instant.ofEpochMilli(completedAt).plus(Duration.ofHours(8)).atZone(zone)
        var candidate = earliest.toLocalDate().atTime(releaseHour, 0).atZone(zone)
        if (candidate.isBefore(earliest)) candidate = candidate.plusDays(1)
        return candidate.toInstant().toEpochMilli()
    }

    fun lockState(s: UserState, bookId: String, ch: Int, now: Long, zone: ZoneId): ChapterLock {
        if (ch <= 1 || isComplete(s, bookId, ch)) return ChapterLock.Open
        val prev = s.completions[key(bookId, ch - 1)] ?: return ChapterLock.NeedsPrevious
        if (mode(s, bookId) == BINGE) return ChapterLock.Open
        val at = releaseAt(prev.at, s.settings.releaseHour, zone)
        return if (now >= at) ChapterLock.Open else ChapterLock.WaitingUntil(at)
    }

    /** Streak shown to the reader: 0 once a full calendar day has passed without a finished chapter. */
    fun displayedStreak(s: UserState, now: Long, zone: ZoneId): Int {
        val last = s.lastDay ?: return 0
        val today = LocalDate.parse(dayKey(now, zone))
        val lastDate = LocalDate.parse(last)
        return if (lastDate == today || lastDate == today.minusDays(1)) s.streak else 0
    }

    data class CompletionResult(val state: UserState, val xpGained: Int, val firstTime: Boolean)

    fun complete(
        s: UserState, bookId: String, ch: Int, chapterCount: Int, viewed: Int, now: Long, zone: ZoneId,
    ): CompletionResult {
        val k = key(bookId, ch)
        if (s.completions.containsKey(k)) return CompletionResult(s, 0, false)
        val day = dayKey(now, zone)
        val newStreak = when (s.lastDay) {
            day -> maxOf(s.streak, 1)
            LocalDate.parse(day).minusDays(1).toString() -> s.streak + 1
            else -> 1
        }
        val entries = s.xp.toMutableList()
        fun add(e: XpEntry) { if (entries.none { it.event == e.event && it.ref == e.ref }) entries += e }
        if (viewed >= MIN_VIEWED_FOR_XP) add(XpEntry("chapter", k, XP_CHAPTER))
        val completions = s.completions + (k to Completion(now, day, viewed))
        if (completions.keys.count { it.startsWith("$bookId:") } >= chapterCount) add(XpEntry("book", bookId, XP_BOOK))
        if (newStreak >= 7 && s.streak < 7) add(XpEntry("streak7", day, XP_STREAK7))
        val gained = entries.sumOf { it.amount } - s.xp.sumOf { it.amount }
        val next = s.copy(
            completions = completions,
            xp = entries,
            streak = newStreak,
            bestStreak = maxOf(s.bestStreak, newStreak),
            lastDay = day,
        )
        return CompletionResult(next, gained, true)
    }

    fun answerXp(s: UserState, ref: String): UserState =
        if (s.xp.any { it.event == "answer" && it.ref == ref }) s
        else s.copy(xp = s.xp + XpEntry("answer", ref, XP_ANSWER))

    fun totalXp(s: UserState) = s.xp.sumOf { it.amount }

    fun badges(s: UserState, bookId: String, bookTitle: String, chapterCount: Int): List<Badge> {
        val done = completedCount(s, bookId)
        return listOf(
            Badge("first", "First chapter", "Finish any chapter", s.completions.isNotEmpty()),
            Badge("streak7", "7-day streak", "Read 7 days in a row", s.bestStreak >= 7),
            Badge("notebook", "Note taker", "Save 5 posts", s.saves.size >= 5),
            Badge("book-$bookId", bookTitle, "Finish all $chapterCount chapters", done >= chapterCount),
        )
    }
}
