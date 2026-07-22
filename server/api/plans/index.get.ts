import { PlanModel } from '../../models/Plan'
import { checkUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await checkUser(event)
  return await PlanModel.find({})
})
