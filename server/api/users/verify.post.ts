import { UserModel } from '../../models/User'
import { PlanModel, DEFAULT_PLAN_NAME } from '../../models/Plan'
import { getEmailFromToken } from '../../utils/auth'

// Login/register happen client-side against the Firebase client SDK (email/password
// and Google both). This is the one place a Mongo User doc gets provisioned (with
// the default plan) for first-time users - upsert so two near-simultaneous calls
// (double-click, two tabs) can't create duplicates, and fail loudly (not HTTP 200)
// if provisioning didn't actually happen, so a missing default plan doesn't
// masquerade as success.
export default defineEventHandler(async (event) => {
  const email = await getEmailFromToken(event)

  const existing = await UserModel.findOne({ email }).select('_id').lean()
  if (!existing) {
    const defaultPlan = await PlanModel.findOne({ planName: DEFAULT_PLAN_NAME }).select('_id').lean()
    if (!defaultPlan) {
      console.error(`users/verify: default plan not found, cannot provision ${email}`)
      throw createError({ statusCode: 503, statusMessage: 'Account setup unavailable' })
    }

    try {
      await UserModel.findOneAndUpdate(
        { email },
        { $setOnInsert: { email, planChosen: String(defaultPlan._id) } },
        { upsert: true }
      )
    } catch (err: any) {
      // E11000: a concurrent call (double-click, two tabs) won the race - the
      // doc exists now, which is the only thing we wanted.
      if (err?.code !== 11000) throw err
    }
  }

  return { ok: true }
})
