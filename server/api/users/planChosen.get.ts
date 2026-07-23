import { UserModel } from '../../models/User'
import { checkUser } from '../../utils/auth'

// Fix (§10): this endpoint had NO authentication at all in the Nuxt 2 app -
// anyone who knew/guessed an email could read another user's chosen plan.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const userID = query.userID as string
  await checkUser(event, userID)

  const user = await UserModel.findOne({ email: userID })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  return { planChosen: user.planChosen }
})
