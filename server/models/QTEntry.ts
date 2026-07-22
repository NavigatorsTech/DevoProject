import mongoose from 'mongoose'
// @ts-expect-error - no published types for mongoose-field-encryption
import mongooseFieldEncryption from 'mongoose-field-encryption'

const { Schema, model, models } = mongoose
const { fieldEncryption } = mongooseFieldEncryption

export interface QTEntryDocument {
  creatorEmail: string
  date: Date
  passageReference: string
  title: string
  thoughts: string
  applicationImplication: string
}

const QTEntrySchema = new Schema<QTEntryDocument>({
  creatorEmail: { type: String, required: true, lowercase: true, trim: true },
  date: { type: Date, required: true },
  passageReference: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  thoughts: { type: String, required: true, trim: true },
  applicationImplication: { type: String, required: true, trim: true }
})

// Encrypted at rest. Update paths MUST go through find + mutate + .save() (not
// findOneAndUpdate) so this pre-save hook actually fires - see docs/migration-plan.md
// Phase 1 notes.
QTEntrySchema.plugin(fieldEncryption, {
  fields: ['thoughts', 'applicationImplication'],
  secret: useRuntimeConfig().mongooseSecret
})

export const QTEntryModel = models.QTEntry || model<QTEntryDocument>('QTEntry', QTEntrySchema)
