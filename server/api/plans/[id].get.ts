import { PlanModel } from '../../models/Plan'
import { checkUser } from '../../utils/auth'

// Backs PlanCard's lazy passages-on-expand fetch and the plan edit page - full
// doc including passages, the field the list endpoint deliberately omits.
// No requireOwner: plan reads aren't owner-gated (see plans/index.get.ts).
export default defineEventHandler(async (event) => {
  await checkUser(event)
  const id = getRouterParam(event, 'id')

  const plan = await PlanModel.findOne({ _id: id })
  if (!plan) {
    throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
  }

  return plan
})
