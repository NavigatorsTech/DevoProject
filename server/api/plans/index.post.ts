import { PlanModel } from '../../models/Plan'
import { checkUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const email = await checkUser(event)
  const body = await readBody(event)

  const plan = await PlanModel.create({
    creatorEmail: email,
    planName: body.planName,
    description: body.description,
    passages: body.passages
  })

  setResponseStatus(event, 201)
  return plan
})
