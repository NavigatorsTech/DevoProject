import { PlanModel, DEFAULT_PLAN_NAME } from '../../models/Plan'
import { checkUser } from '../../utils/auth'

// List view only needs plan names/metadata to render PlanCard's collapsed
// state - passages (the largest part of each doc) load lazily per-plan via
// GET /api/plans/[id] when a card is expanded, or on the edit page.
// Scoped to the user's own plans plus the shared default, not every user's
// plans - read access itself isn't owner-gated (browsing plans before
// choosing one is intentional; PlanCard's notOwner only disables mutations).
export default defineEventHandler(async (event) => {
  const email = await checkUser(event)
  return await PlanModel.find({ $or: [{ creatorEmail: email }, { planName: DEFAULT_PLAN_NAME }] })
    .select('planName description creatorEmail')
})
