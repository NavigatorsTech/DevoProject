import Vue from 'vue'

export const state = () => ({
    qtEntries: []
})

// --- Streaks helpers ---
// Normalize any date (Date object, ISO string, etc.) to a DST-safe integer
// day index based on the *local* calendar day, so consecutive days always
// differ by exactly 1 regardless of daylight-saving shifts.
function toDayIndex(input) {
    const d = new Date(input);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function uniqueSortedDays(entries) {
    return [...new Set(entries.map(e => toDayIndex(e.date)))].sort((a, b) => a - b);
}

export const mutations = {
    setAllQTEntries(state, entries) {
        state.qtEntries = entries
    },
    addEntry(state, entry) {
        Vue.set(state.qtEntries, state.qtEntries.length, entry);
    },
    updateEntry(state, entry) {
        for (let i in state.qtEntries) {
            if (state.qtEntries[i]._id === entry.journalID) {
                state.qtEntries[i].title = entry.title;
                state.qtEntries[i].thoughts = entry.thoughts;
                state.qtEntries[i].applicationImplication = entry.applicationImplication;
            }
        }
    },
    deleteEntry(state, id) {
        for (let i in state.qtEntries) {
            if (state.qtEntries[i]._id === id) {
                state.qtEntries.splice(i, 1);                
            }
        }
    },
    clearEntries(state) {
        state.qtEntries = [];
    }
}

export const actions = {
    async createEntry(vuexContext, entrySubmitted) {
        return await this.$axios.$post("/qtJournalEntries", {
             creatorEmail: entrySubmitted.creatorEmail,
             date: entrySubmitted.date,
             passageReference: entrySubmitted.passageReference,
             title: entrySubmitted.title,
             thoughts: entrySubmitted.thoughts,
             applicationImplication: entrySubmitted.applicationImplication
        }).then(response => {
            if (response === 'Created') { // 201
                vuexContext.commit('addEntry', entrySubmitted);
            }
        }).catch(e => console.log(e));
    },
    storeAllQTEntries(vuexContext, entries) {
        vuexContext.commit('setAllQTEntries', entries);
    },
    async updateEntry(vuexContext, entrySubmitted) {
        return await this.$axios.$put("/qtJournalEntries", {
            journalID: entrySubmitted.journalID,
            title: entrySubmitted.title,
            thoughts: entrySubmitted.thoughts,
            applicationImplication: entrySubmitted.applicationImplication
       }).then(response => {
           if (response === 'OK') { // 200
               vuexContext.commit('updateEntry', entrySubmitted);
           }
       }).catch(e => console.log(e));
    },
    async deleteEntry(vuexContext, jID) {
        return await this.$axios.delete('/qtJournalEntries', {
            params: {
                journalID: jID
            }
        }).then(response => {
            if (response.status === 200) {
                vuexContext.commit('deleteEntry', jID);
            }
        }).catch(e => console.log(e))
    },
    clearEntries(vuexContext) {
        vuexContext.commit('clearEntries');
    }
}

export const getters = {
    getAllQTEntries(state) {
        return state.qtEntries
    },
    getEntryUsingID: (state) => (id) => {
        return state.qtEntries.find(x => x._id === id);
    },
    getQTEntriesLength(state) {
        return state.qtEntries.length;
    },
    getCurrentStreak(state) {
        const days = uniqueSortedDays(state.qtEntries);
        if (days.length === 0) return 0;

        const today = toDayIndex(new Date());
        const mostRecent = days[days.length - 1];

        // Streak is broken if the most recent entry is older than yesterday.
        if (today - mostRecent > 1) return 0;

        let streak = 1;
        for (let i = days.length - 1; i > 0; i--) {
            if (days[i] - days[i - 1] === 1) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    },
    getLongestStreak(state) {
        const days = uniqueSortedDays(state.qtEntries);
        if (days.length === 0) return 0;

        let longest = 1;
        let current = 1;
        for (let i = 1; i < days.length; i++) {
            if (days[i] - days[i - 1] === 1) {
                current++;
                longest = Math.max(longest, current);
            } else {
                current = 1;
            }
        }
        return longest;
    },
    hasJournaledToday(state) {
        const days = uniqueSortedDays(state.qtEntries);
        if (days.length === 0) return false;
        return days[days.length - 1] === toDayIndex(new Date());
    }
}