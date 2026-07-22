import { UserModel } from '../../models/User'
import { PlanModel } from '../../models/Plan'
import { getEmailFromToken } from '../../utils/auth'

const DEFAULT_PLAN_NAME = '--- Default Nav Plan ---'

// Login/register happen client-side against the Firebase client SDK (email/password
// and Google both). This endpoint just verifies the resulting idToken and
// provisions a User doc (with the default plan) for first-time users.
async function ensureUser(email: string) {
  const normalizedEmail = email.toLowerCase()
  const existing = await UserModel.findOne({ email: normalizedEmail })
  if (existing) return

  const defaultPlan = await PlanModel.findOne({ planName: DEFAULT_PLAN_NAME })
  if (!defaultPlan) {
    console.error(`users/verify: default plan not found, cannot provision user ${normalizedEmail}`)
    return
  }

  await UserModel.create({ email: normalizedEmail, planChosen: defaultPlan._id })
}

export default defineEventHandler(async (event) => {
  const email = await getEmailFromToken(event)
  await ensureUser(email)
  return { ok: true }
})
