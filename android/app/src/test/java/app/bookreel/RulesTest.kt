package app.bookreel

import app.bookreel.data.Completion
import app.bookreel.data.UserState
import app.bookreel.domain.ChapterLock
import app.bookreel.domain.Rules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class RulesTest {
    private val zone: ZoneId = ZoneId.of("Asia/Kolkata")
    private fun at(y: Int, m: Int, d: Int, h: Int, min: Int = 0): Long =
        LocalDateTime.of(y, m, d, h, min).atZone(zone).toInstant().toEpochMilli()

    @Test fun releaseAfterLateFinishIsTomorrowEvening() {
        assertEquals(at(2026, 10, 16, 20), Rules.releaseAt(at(2026, 10, 15, 21, 30), 20, zone))
    }

    @Test fun releaseAfterMorningFinishIsSameEvening() {
        assertEquals(at(2026, 10, 15, 20), Rules.releaseAt(at(2026, 10, 15, 9), 20, zone))
    }

    @Test fun releaseNeedsEightHoursGap() {
        // Finished at 13:00: 13:00 + 8 h = 21:00, which is past 20:00, so tomorrow.
        assertEquals(at(2026, 10, 16, 20), Rules.releaseAt(at(2026, 10, 15, 13), 20, zone))
    }

    @Test fun chapterOneIsAlwaysOpen() {
        assertEquals(ChapterLock.Open, Rules.lockState(UserState(), "b", 1, at(2026, 1, 1, 10), zone))
    }

    @Test fun chapterTwoNeedsChapterOne() {
        assertEquals(ChapterLock.NeedsPrevious, Rules.lockState(UserState(), "b", 2, at(2026, 1, 1, 10), zone))
    }

    @Test fun bingeOpensNextImmediately() {
        val s = UserState(completions = mapOf("b:1" to Completion(at(2026, 10, 15, 21), "2026-10-15", 10)))
        assertEquals(ChapterLock.Open, Rules.lockState(s, "b", 2, at(2026, 10, 15, 21, 1), zone))
    }

    @Test fun dailyWaitsForReleaseTime() {
        val s = UserState(
            completions = mapOf("b:1" to Completion(at(2026, 10, 15, 21), "2026-10-15", 10)),
            modes = mapOf("b" to Rules.DAILY),
        )
        val lock = Rules.lockState(s, "b", 2, at(2026, 10, 16, 9), zone)
        assertEquals(ChapterLock.WaitingUntil(at(2026, 10, 16, 20)), lock)
        assertEquals(ChapterLock.Open, Rules.lockState(s, "b", 2, at(2026, 10, 16, 20, 1), zone))
    }

    @Test fun streakGrowsOnConsecutiveDaysAndResetsAfterAGap() {
        var s = UserState()
        s = Rules.complete(s, "b", 1, 20, 10, at(2026, 10, 15, 21), zone).state
        assertEquals(1, s.streak)
        s = Rules.complete(s, "b", 2, 20, 10, at(2026, 10, 15, 22), zone).state
        assertEquals(1, s.streak) // same day
        s = Rules.complete(s, "b", 3, 20, 10, at(2026, 10, 16, 8), zone).state
        assertEquals(2, s.streak)
        s = Rules.complete(s, "b", 4, 20, 10, at(2026, 10, 19, 8), zone).state
        assertEquals(1, s.streak)
        assertEquals(2, s.bestStreak)
    }

    @Test fun displayedStreakDropsToZeroAfterAMissedDay() {
        val s = UserState(streak = 4, lastDay = "2026-10-15")
        assertEquals(4, Rules.displayedStreak(s, at(2026, 10, 16, 23), zone))
        assertEquals(0, Rules.displayedStreak(s, at(2026, 10, 17, 9), zone))
    }

    @Test fun skimmingGivesNoChapterXp() {
        val r = Rules.complete(UserState(), "b", 1, 20, 3, at(2026, 10, 15, 21), zone)
        assertEquals(0, r.xpGained)
        val r2 = Rules.complete(UserState(), "b", 1, 20, 9, at(2026, 10, 15, 21), zone)
        assertEquals(Rules.XP_CHAPTER, r2.xpGained)
    }

    @Test fun rereadingNeverAddsXpTwice() {
        val first = Rules.complete(UserState(), "b", 1, 20, 10, at(2026, 10, 15, 21), zone).state
        val again = Rules.complete(first, "b", 1, 20, 10, at(2026, 10, 16, 21), zone)
        assertEquals(0, again.xpGained)
        assertTrue(!again.firstTime)
    }

    @Test fun finishingTheBookAddsBookXp() {
        var s = UserState()
        var gained = 0
        for (n in 1..3) { val r = Rules.complete(s, "b", n, 3, 10, at(2026, 10, 15, 10 + n), zone); s = r.state; gained = r.xpGained }
        assertEquals(Rules.XP_CHAPTER + Rules.XP_BOOK, gained)
    }

    @Test fun answerXpOncePerPost() {
        var s = Rules.answerXp(UserState(), "b:1-6")
        s = Rules.answerXp(s, "b:1-6")
        assertEquals(Rules.XP_ANSWER, Rules.totalXp(s))
    }
}
