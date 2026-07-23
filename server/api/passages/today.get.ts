import { PlanModel } from '../../models/Plan'
import { getPassage } from '../../utils/bible-retrieval'

const DEFAULT_PLAN_NAME = '--- Default Nav Plan ---'

function getDefaultPassage(): string {
  return `Proverbs ${new Date().getDate()}`
}

// Public: the landing page shows today's passage to logged-out visitors, and it's
// preloaded during SSR regardless of auth state. Do NOT add auth here (§10).
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const planID = query.planID as string | undefined

  try {
    const plan = planID
      ? await PlanModel.findOne({ _id: planID })
      : await PlanModel.findOne({ planName: DEFAULT_PLAN_NAME })

    if (!plan) {
      return await getPassage(getDefaultPassage())
    }

    const now = new Date().toString()
    const month = now.substring(4, 7) + ' ' + now.substring(11, 15)
    const day = new Date().getDate()
    const reference = plan.passages.get(month)?.get(day.toString())

    if (!reference) {
      return await getPassage(getDefaultPassage())
    }

    return await getPassage(reference)
  } catch (err) {
    console.error('passages/today: falling back to default passage', err)
    return await getPassage(getDefaultPassage())
  }
})
