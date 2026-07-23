import { UserModel } from '../../models/User'
import { checkUser } from '../../utils/auth'

// Fix (§10): this endpoint had NO authentication at all in the Nuxt 2 app -
// anyone who knew/guessed an email could silently overwrite their chosen plan.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  await checkUser(event, body.userID)

  await UserModel.findOneAndUpdate({ email: body.userID }, { planChosen: body.planChosen })

  setResponseStatus(event, 201)
  return { planChosen: body.planChosen }
})
