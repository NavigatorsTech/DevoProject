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

export const UserModel: Model<UserDocument> = models.User || model<UserDocument>('User', UserSchema)
