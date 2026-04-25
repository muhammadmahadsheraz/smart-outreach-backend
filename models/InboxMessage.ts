import mongoose, { Schema, Document } from "mongoose";

export interface IInboxMessage extends Document {
  userId: string; // email of the user
  senderName?: string;
  senderEmail: string;
  subject: string;
  body: string;
  preview: string;
  receivedAt: Date;
  isRead: boolean;
  tag?: "lead" | "meeting_booked" | "possible";
  campaignId?: string;
  gmailMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const inboxMessageSchema = new Schema<IInboxMessage>(
  {
    userId: { type: String, required: true, index: true },
    senderName: { type: String },
    senderEmail: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    preview: { type: String },
    receivedAt: { type: Date, required: true, index: true },
    isRead: { type: Boolean, default: false },
    tag: { type: String, enum: ["lead", "meeting_booked", "possible", "not_interested", "wrong_person"] },
    campaignId: { type: String },
    gmailMessageId: { type: String, unique: true, sparse: true },
  },
  {
    timestamps: true,
  }
);

export const InboxMessage = mongoose.model<IInboxMessage>("InboxMessage", inboxMessageSchema);
