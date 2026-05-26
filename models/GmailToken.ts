import mongoose, { Schema, Document } from "mongoose";

export interface IGmailToken extends Document {
  userId: string;
  gmailEmail: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  historyId?: string;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const gmailTokenSchema = new Schema<IGmailToken>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    gmailEmail: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiryDate: { type: Number, required: true },
    historyId: { type: String },
    lastSyncAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

export const GmailToken = mongoose.model<IGmailToken>("GmailToken", gmailTokenSchema);
