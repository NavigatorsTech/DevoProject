import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

export interface UserDocument {
  email: string
  planChosen: string
}

const UserSchema = new Schema<UserDocument>({
  email: { type: String, required: true, lowercase: true, trim: true },
  planChosen: { type: String, required: true, trim: true }
})

// `unique` is load-bearing, not hygiene: it's what makes concurrent
// first-login provisioning attempts (double-click, two tabs) collapse to one
// document instead of racing into duplicates - see
// server/api/users/verify.post.ts's upsert. Build this by hand in Atlas
// BEFORE deploying a change that relies on it (audit for existing duplicate/
// mixed-case emails first) - don't rely on Mongoose's boot-time autoIndex,
// which fails silently here since server/plugins/mongo.ts only listens for
// connection-level errors, not index-build failures.
UserSchema.index({ email: 1 }, { unique: true })

export const UserModel: Model<UserDocument> = models.User || model<UserDocument>('User', UserSchema)
