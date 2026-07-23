import { getPassage } from '../../utils/bible-retrieval'
import { checkUser } from '../../utils/auth'

// Arbitrary passage lookup (viewing a past journal entry's original passage).
// Every call site is already behind login client-side; enforce it server-side
// too since this has no landing-page use case forcing it public (§10).
export default defineEventHandler(async (event) => {
  await checkUser(event)
  const query = getQuery(event)
  const passageReference = query.passageReference as string
  return await getPassage(passageReference)
})
