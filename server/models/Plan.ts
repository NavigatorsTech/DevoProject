import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

export interface PlanDocument {
  creatorEmail: string
  planName: string
  description: string
  // Outer key: month string "MMM YYYY" (e.g. "Jul 2026"). Inner key: day-of-month
  // as a string. Inner value: passage reference string. Keep this nested Map-of-Map
  // shape exactly as-is — see docs/migration-plan.md §12 data migration notes.
  passages: Map<string, Map<string, string>>
}

const PlanSchema = new Schema<PlanDocument>({
  creatorEmail: { type: String, required: true, lowercase: true, trim: true },
  planName: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  passages: { type: Map, of: Map, required: true }
})

export const PlanModel: Model<PlanDocument> = models.Plan || model<PlanDocument>('Plan', PlanSchema)
