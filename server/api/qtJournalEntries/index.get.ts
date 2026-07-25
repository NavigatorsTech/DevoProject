import { QTEntryModel } from '../../models/QTEntry'
import { checkUser } from '../../utils/auth'

const DEFAULT_LIMIT = 20

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const creatorEmail = query.creatorEmail as string
  await checkUser(event, creatorEmail)

  // Dates-only mode backs the streak card: no decryption (date isn't an
  // encrypted field) and a tiny payload, independent of the list's pagination
  // below so streaks always reflect the user's entire history.
  if (query.mode === 'dates') {
    return await QTEntryModel.find({ creatorEmail }).select('date -_id').lean()
  }

  const limit = Number(query.limit) || DEFAULT_LIMIT
  const skip = Number(query.skip) || 0

  // Exclude applicationImplication (list view only ever showed a thoughts
  // preview) and fetch one extra doc to detect hasMore without a separate
  // COUNT query.
  // __enc_thoughts is mongoose-field-encryption's own marker field - its
  // post('init') decrypt hook only fires for a field when this marker is
  // present in the loaded doc, so it must be explicitly selected too or
  // `thoughts` comes back still-encrypted (the marker isn't projected in by
  // default the way _id is).
  const docs = await QTEntryModel.find({ creatorEmail })
    .select('title date passageReference thoughts __enc_thoughts')
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit + 1)

  const hasMore = docs.length > limit
  return { entries: docs.slice(0, limit), hasMore }
})
