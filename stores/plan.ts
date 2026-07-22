export const usePlanStore = defineStore('plan', {
  state: () => ({
    chosenPlan: null as string | null,
    plans: [] as any[]
  }),

  getters: {
    getPlans: (state) => state.plans,
    getChosenPlan: (state) => state.chosenPlan,
    getPlanUsingID: (state) => (id: string) => state.plans.find((p: any) => p._id === id),
    getPlansSize: (state) => state.plans.length
  },

  actions: {
    async createPlan(planSubmitted: any) {
      try {
        // Push the server's returned document (with its real Mongo _id), not the
        // submitted input - fixes a latent Nuxt 2 bug where the newly created plan
        // was pushed to local state without an _id at all.
        const plan = await authFetch('/api/plans', { method: 'POST', body: planSubmitted })
        this.plans.push(plan)
      } catch (e) {
        console.error(e)
      }
    },

    async updatePlan(planSubmitted: any) {
      const userStore = useUserStore()
      userStore.syncCookie()
      try {
        const updated: any = await authFetch('/api/plans', {
          method: 'PUT',
          body: {
            planID: planSubmitted._id,
            planName: planSubmitted.planName,
            description: planSubmitted.description,
            passages: planSubmitted.passages
          }
        })
        const idx = this.plans.findIndex((p: any) => p._id === updated._id)
        if (idx !== -1) this.plans[idx] = updated
      } catch (e) {
        console.error(e)
      }
    },

    async setChosenPlan(planID: string) {
      this.chosenPlan = planID
      const userStore = useUserStore()
      try {
        await authFetch('/api/users/planChosen', {
          method: 'POST',
          body: { userID: userStore.userID, planChosen: planID }
        })
        const passageStore = usePassageStore()
        await passageStore.refreshPassage()
      } catch (e) {
        console.error(e)
      }
    },

    clearChosenPlan() {
      this.chosenPlan = null
    },

    storePlans(plans: any[]) {
      this.plans = plans
    },

    async getPlanChosen() {
      const userStore = useUserStore()
      if (userStore.userID == null) return
      try {
        const data: any = await authFetch('/api/users/planChosen', {
          params: { userID: userStore.userID }
        })
        this.chosenPlan = data.planChosen
      } catch (e) {
        console.error(e)
      }
    },

    async deletePlan(planID: string) {
      const userStore = useUserStore()
      userStore.syncCookie()
      try {
        await authFetch('/api/plans', { method: 'DELETE', params: { planID } })
        this.plans = this.plans.filter((p: any) => p._id !== planID)
      } catch (e) {
        console.error(e)
      }
    },

    clearPlans() {
      this.plans = []
    }
  }
})
