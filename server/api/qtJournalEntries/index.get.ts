import { QTEntryModel } from '../../models/QTEntry'
import { checkUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const creatorEmail = query.creatorEmail as string
  await checkUser(event, creatorEmail)

  return await QTEntryModel.find({ creatorEmail })
})
