// Normalize any date (Date object, ISO string, etc.) to a DST-safe integer day
// index based on the *local* calendar day, so consecutive days always differ
// by exactly 1 regardless of daylight-saving shifts.
export function toDayIndex(input: string | Date): number {
  const d = new Date(input)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
}

function uniqueSortedDays(entries: any[]): number[] {
  return [...new Set(entries.map((e) => toDayIndex(e.date)))].sort((a, b) => a - b)
}

export const useJournalStore = defineStore('journal', {
  state: () => ({
    qtEntries: [] as any[]
  }),

  getters: {
    getAllQTEntries: (state) => state.qtEntries,
    getEntryUsingID: (state) => (id: string) => state.qtEntries.find((e: any) => e._id === id),
    getQTEntriesLength: (state) => state.qtEntries.length,

    getCurrentStreak: (state) => {
      const days = uniqueSortedDays(state.qtEntries)
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

    getLongestStreak: (state) => {
      const days = uniqueSortedDays(state.qtEntries)
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

    hasJournaledToday: (state) => {
      const days = uniqueSortedDays(state.qtEntries)
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
        this.qtEntries.push(entry)
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    },

    storeAllQTEntries(entries: any[]) {
      this.qtEntries = entries
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
        await authFetch('/api/qtJournalEntries', { method: 'DELETE', params: { journalID } })
        this.qtEntries = this.qtEntries.filter((e: any) => e._id !== journalID)
      } catch (e) {
        console.error(e)
      }
    },

    clearEntries() {
      this.qtEntries = []
    }
  }
})
