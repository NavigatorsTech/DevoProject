import { QTEntryModel } from '../../models/QTEntry'
import { checkUser, requireOwner } from '../../utils/auth'

// Lets the entry detail page fetch just this one entry instead of downloading
// and decrypting the user's entire journal history to find it by id.
export default defineEventHandler(async (event) => {
  await checkUser(event)
  const id = getRouterParam(event, 'id')

  const entry = await QTEntryModel.findOne({ _id: id })
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  }
  await requireOwner(event, entry.creatorEmail)

  return entry
})
