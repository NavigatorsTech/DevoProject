#!/usr/bin/env node
// Read-only production data validation gate for the Nuxt 4 migration (§12 of
// docs/migration-plan.md). Checks, without ever writing anything back:
//
//   1. QTEntry field encryption round-trips (decrypts a sample, confirms the
//      plaintext is sane) - never prints the actual decrypted content, only
//      pass/fail and length metadata, since thoughts/applicationImplication
//      are personal journal entries.
//   2. Plan.passages deserializes into the expected nested Map-of-Map shape.
//   3. Every User.planChosen references a Plan that actually exists (no
//      dangling references).
//
// Usage: node scripts/validate-data.mjs <path-to-ecosystem.config.js>
//
// Deliberately reads MONGODB_ACCESS/MONGOOSE_SECRET out of the real deployed
// PM2 config file rather than accepting them as inline arguments/env vars, so
// this script never needs the credentials typed into a shell command.

import { createRequire } from 'node:module'
import mongoose from 'mongoose'
// eslint-disable-next-line import/no-unresolved
import fieldEncryptionPkg from 'mongoose-field-encryption'

const { fieldEncryption } = fieldEncryptionPkg
const require = createRequire(import.meta.url)

const configPath = process.argv[2]
if (!configPath) {
  console.error('Usage: node validate-data.mjs <path-to-ecosystem.config.js>')
  process.exit(1)
}

const ecosystem = require(configPath)
const env = ecosystem.apps[0].env
const MONGODB_ACCESS = env.MONGODB_ACCESS
const MONGOOSE_SECRET = env.MONGOOSE_SECRET

if (!MONGODB_ACCESS || !MONGOOSE_SECRET) {
  console.error('Could not find MONGODB_ACCESS / MONGOOSE_SECRET in', configPath)
  process.exit(1)
}

const SAMPLE_SIZE = 15

const QTEntrySchema = new mongoose.Schema({
  creatorEmail: String,
  date: Date,
  passageReference: String,
  title: String,
  thoughts: String,
  applicationImplication: String
})
QTEntrySchema.plugin(fieldEncryption, {
  fields: ['thoughts', 'applicationImplication'],
  secret: MONGOOSE_SECRET
})

const PlanSchema = new mongoose.Schema({
  creatorEmail: String,
  planName: String,
  description: String,
  passages: { type: Map, of: Map }
})

const UserSchema = new mongoose.Schema({
  email: String,
  planChosen: String
})

let failures = 0

function report(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL'
  if (!ok) failures++
  console.log(`[${status}] ${name}${detail ? ' - ' + detail : ''}`)
}

async function main() {
  console.log(`Connecting (read-only) to production Mongo...`)
  await mongoose.connect(MONGODB_ACCESS)
  const QTEntry = mongoose.model('QTEntry', QTEntrySchema)
  const Plan = mongoose.model('Plan', PlanSchema)
  const User = mongoose.model('User', UserSchema)

  // 1. Encryption round-trip -----------------------------------------------
  console.log(`\n--- QTEntry encryption round-trip (sample of ${SAMPLE_SIZE}) ---`)
  const entries = await QTEntry.find({}).limit(SAMPLE_SIZE)
  if (entries.length === 0) {
    report('QTEntry sample', false, 'no entries found in production - cannot validate')
  }
  for (const entry of entries) {
    const thoughtsOk = typeof entry.thoughts === 'string' && entry.thoughts.length > 0
    const appImpOk = typeof entry.applicationImplication === 'string' && entry.applicationImplication.length > 0
    report(
      `entry ${entry._id} decrypts`,
      thoughtsOk && appImpOk,
      thoughtsOk && appImpOk
        ? `thoughts=${entry.thoughts.length} chars, applicationImplication=${entry.applicationImplication.length} chars`
        : 'decrypted field was empty or non-string - possible encryption/secret mismatch'
    )
  }

  // 2. Plan.passages shape ---------------------------------------------------
  console.log(`\n--- Plan.passages nested Map-of-Map shape (sample of ${SAMPLE_SIZE}) ---`)
  const plans = await Plan.find({}).limit(SAMPLE_SIZE)
  if (plans.length === 0) {
    report('Plan sample', false, 'no plans found in production - cannot validate')
  }
  for (const plan of plans) {
    const isMap = plan.passages instanceof Map
    let innerOk = true
    let monthCount = 0
    let dayCount = 0
    if (isMap) {
      for (const [monthKey, monthValue] of plan.passages.entries()) {
        monthCount++
        if (!(monthValue instanceof Map)) {
          innerOk = false
          break
        }
        for (const [dayKey, ref] of monthValue.entries()) {
          dayCount++
          if (typeof ref !== 'string' || !ref) {
            innerOk = false
            break
          }
        }
      }
    }
    report(
      `plan "${plan.planName}" (${plan._id}) passages shape`,
      isMap && innerOk,
      isMap ? `${monthCount} month(s), ${dayCount} day(s)` : 'passages is not a Map at the top level'
    )
  }

  // 3. User.planChosen referential integrity --------------------------------
  console.log(`\n--- User.planChosen referential integrity (all users) ---`)
  const users = await User.find({}).lean()
  if (users.length === 0) {
    report('User sample', false, 'no users found in production - cannot validate')
  }
  const planIds = new Set((await Plan.find({}, { _id: 1 }).lean()).map((p) => p._id.toString()))
  for (const user of users) {
    const ok = typeof user.planChosen === 'string' && planIds.has(user.planChosen)
    report(`user ${user.email} planChosen (${user.planChosen})`, ok, ok ? undefined : 'dangling or malformed plan reference')
  }

  await mongoose.connection.close()

  console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Validation script crashed:', err)
  process.exit(1)
})
