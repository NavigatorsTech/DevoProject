import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'
import { getHeader, createError, type H3Event } from 'h3'

function getBearerToken(event: H3Event): string {
  const header = getHeader(event, 'authorization')
  if (!header) {
    // A missing Authorization header must reject, not silently pass - fixes the
    // Nuxt 2 auth service's no-header-⇒-resolves bug (docs/migration-plan.md §10).
    throw createError({ statusCode: 401, statusMessage: 'Not Authorized' })
  }
  const token = header.split(' ')[1]
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not Authorized' })
  }
  return token
}

// checkUser/requireOwner both funnel through this per request - several
// endpoints (plan/entry PUT, DELETE, single-entry GET) call both in the same
// request, so without caching verifyIdToken's CPU-bound crypto already ran
// twice per request there. TTL is well under the token's own ~1hr lifetime;
// only successes are cached (a bad/expired token retries every time, so a
// legitimate retry right after a refresh is never masked).
const TOKEN_CACHE_TTL_MS = 60_000
const tokenCache = new Map<string, { decoded: DecodedIdToken; expiresAt: number }>()

async function verifyRequest(event: H3Event) {
  const token = getBearerToken(event)

  const cached = tokenCache.get(token)
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.decoded
    tokenCache.delete(token)
  }

  try {
    const decoded = await getAuth().verifyIdToken(token)
    tokenCache.set(token, { decoded, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS })
    return decoded
  } catch (err) {
    throw createError({ statusCode: 401, statusMessage: 'Not Authorized' })
  }
}

/**
 * Verifies the request's Bearer idToken. If userEmailID is given, also requires
 * the token's email to match it. Returns the verified email.
 */
export async function checkUser(event: H3Event, userEmailID?: string): Promise<string> {
  const decoded = await verifyRequest(event)
  const email = decoded.email
  if (!email) {
    throw createError({ statusCode: 401, statusMessage: 'Not Authorized' })
  }
  if (userEmailID && email !== userEmailID) {
    throw createError({ statusCode: 401, statusMessage: 'Not Authorized' })
  }
  return email
}

export async function getEmailFromToken(event: H3Event): Promise<string> {
  return checkUser(event)
}

/**
 * Requires the verified token's email to match resourceCreatorEmail. 403 (not
 * 401) since the requester IS authenticated - they just don't own this resource.
 */
export async function requireOwner(event: H3Event, resourceCreatorEmail: string): Promise<string> {
  const email = await checkUser(event)
  if (email !== resourceCreatorEmail) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return email
}
