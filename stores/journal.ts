// Normalize any date (Date object, ISO string, etc.) to a DST-safe integer day
// index based on the *local* calendar day, so consecutive days always differ
// by exactly 1 regardless of daylight-saving shifts.
export function toDayIndex(input: string | Date): number {
  const d = new Date(input)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
}

function uniqueSortedDays(dates: (string | Date)[]): number[] {
  return [...new Set(dates.map((d) => toDayIndex(d)))].sort((a, b) => a - b)
}

const DEFAULT_PAGE_SIZE = 20

export const useJournalStore = defineStore('journal', {
  state: () => ({
    qtEntries: [] as any[],
    // Dates-only mirror of every entry the user has ever written, independent of
    // qtEntries' pagination - streaks need every day, not just the loaded page.
    entryDates: [] as (string | Date)[],
    hasMoreEntries: true
  }),

  getters: {
    getAllQTEntries: (state) => state.qtEntries,
    getEntryUsingID: (state) => (id: string) => state.qtEntries.find((e: any) => e._id === id),
    getQTEntriesLength: (state) => state.qtEntries.length,

    // Computed once per entryDates change (Pinia caches each getter independently),
    // then reused by all three streak getters below instead of each recomputing
    // uniqueSortedDays from scratch.
    sortedEntryDayIndexes: (state) => uniqueSortedDays(state.entryDates),

    getCurrentStreak(): number {
      const days = this.sortedEntryDayIndexes
      if (days.length === 0) return 0

      const today = toDayIndex(new Date())
      const mostRecent = days[days.length - 1]!

      // Streak is broken if the most recent entry is older than yesterday.
      if (today - mostRecent > 1) return 0

      let streak = 1
      for (let i = days.length - 1; i > 0; i--) {
        if (days[i]! - days[i - 1]! === 1) {
          streak++
        } else {
          break
        }
      }
      return streak
    },

    getLongestStreak(): number {
      const days = this.sortedEntryDayIndexes
      if (days.length === 0) return 0

      let longest = 1
      let current = 1
      for (let i = 1; i < days.length; i++) {
        if (days[i]! - days[i - 1]! === 1) {
          current++
          longest = Math.max(longest, current)
        } else {
          current = 1
        }
      }
      return longest
    },

    hasJournaledToday(): boolean {
      const days = this.sortedEntryDayIndexes
      if (days.length === 0) return false
      return days[days.length - 1] === toDayIndex(new Date())
    }
  },

  actions: {
    async createEntry(entrySubmitted: any) {
      try {
        const entry = await authFetch('/api/qtJournalEntries', {
          method: 'POST',
          body: entrySubmitted
        })
        // List is newest-first from the server; unshift keeps a freshly-created
        // entry visible at the top without a refetch.
        this.qtEntries.unshift(entry)
        this.entryDates.push(entry.date)
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    },

    // Stores the first paginated page from /api/qtJournalEntries (list mode),
    // which now returns { entries, hasMore } instead of a bare array.
    storeFirstPage(entries: any[], hasMore: boolean) {
      this.qtEntries = entries
      this.hasMoreEntries = hasMore
    },

    appendQTEntries(entries: any[]) {
      this.qtEntries.push(...entries)
    },

    // Inserts or replaces a single entry (e.g. from the single-entry detail
    // fetch) - keeps getEntryUsingID/retrievedEntry working on the detail page
    // without requiring the paginated list to already contain it.
    upsertEntry(entry: any) {
      const idx = this.qtEntries.findIndex((e: any) => e._id === entry._id)
      if (idx !== -1) {
        this.qtEntries[idx] = entry
      } else {
        this.qtEntries.push(entry)
      }
    },

    async loadMore(limit = DEFAULT_PAGE_SIZE) {
      const userStore = useUserStore()
      try {
        const { entries, hasMore } = await authFetch('/api/qtJournalEntries', {
          params: { creatorEmail: userStore.userID, skip: this.qtEntries.length, limit }
        })
        this.appendQTEntries(entries)
        this.hasMoreEntries = hasMore
      } catch (e) {
        console.error(e)
      }
    },

    // Cheap dates-only fetch backing the streak getters - independent of
    // qtEntries' pagination, so streaks always reflect the full history.
    async fetchEntryDates() {
      const userStore = useUserStore()
      try {
        this.entryDates = await authFetch('/api/qtJournalEntries', {
          params: { creatorEmail: userStore.userID, mode: 'dates' }
        }).then((dates: any[]) => dates.map((d) => d.date))
      } catch (e) {
        // Swallowed in general - both callers treat the streak/dates fetch as
        // non-fatal, the rest of their page must still render. The one
        // exception: a still-pending-verification account needs its caller's
        // useAsyncData `error` ref to actually see this, so it can redirect
        // to the verify-email page instead of silently rendering as if
        // nothing happened - rethrow only that one, narrowly, rather than
        // making this non-fatal-on-failure behavior fatal in general.
        if (isEmailNotVerifiedError(e)) throw e
        console.error(e)
      }
    },

    async updateEntry(entrySubmitted: any) {
      try {
        const updated: any = await authFetch('/api/qtJournalEntries', {
          method: 'PUT',
          body: {
            journalID: entrySubmitted.journalID,
            title: entrySubmitted.title,
            thoughts: entrySubmitted.thoughts,
            applicationImplication: entrySubmitted.applicationImplication
          }
        })
        const idx = this.qtEntries.findIndex((e: any) => e._id === updated._id)
        if (idx !== -1) this.qtEntries[idx] = updated
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    },

    async deleteEntry(journalID: string) {
      try {
        // Capture the date before removing - the entry is always currently
        // loaded/rendered here, so this is the exact value to drop from
        // entryDates too (entryDates holds one entry per date, unpaginated).
        const entry = this.qtEntries.find((e: any) => e._id === journalID)
        await authFetch('/api/qtJournalEntries', { method: 'DELETE', params: { journalID } })
        this.qtEntries = this.qtEntries.filter((e: any) => e._id !== journalID)
        if (entry) {
          // Remove exactly one date matching this entry's calendar day. Which
          // duplicate gets removed doesn't matter for streak correctness - the
          // getters only care whether at least one entry remains for that day.
          const idx = this.entryDates.findIndex((d) => toDayIndex(d) === toDayIndex(entry.date))
          if (idx !== -1) this.entryDates.splice(idx, 1)
        }
      } catch (e) {
        console.error(e)
      }
    },

    clearEntries() {
      this.qtEntries = []
      this.entryDates = []
      this.hasMoreEntries = true
    }
  }
})
