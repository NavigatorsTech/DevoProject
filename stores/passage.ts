export const usePassageStore = defineStore('passage', {
  state: () => ({
    todaysPassage: null as any,
    todaysReference: null as string | null
  }),

  getters: {
    getTodaysPassage: (state) => state.todaysPassage,
    getTodaysReference: (state) => state.todaysReference
  },

  actions: {
    async refreshPassage() {
      const planStore = usePlanStore()
      try {
        const data: any = await $fetch('/api/passages/today', {
          params: { planID: planStore.chosenPlan }
        })
        this.todaysPassage = data.passages[0]
        this.todaysReference = data.canonical
      } catch (e) {
        console.error(e)
      }
    },
    refreshTodaysPassage(passage: any) {
      this.todaysPassage = passage
    },
    refreshTodaysReference(reference: string) {
      this.todaysReference = reference
    }
  }
})
