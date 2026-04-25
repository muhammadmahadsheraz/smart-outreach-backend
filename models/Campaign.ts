import mongoose, { Schema, Document } from "mongoose";

export interface Email {
  id: string;
  subject: string;
  body: string;
}

export interface ICampaign extends Document {
  userId: string;  // Reference to User._id (MongoDB ObjectId as string)
  name: string;
  // Step 0: Ideal Customer
  country?: string;
  jobTitles?: string[];
  industry?: string;
  keywords?: string;
  employees?: string;
  selectedProspects: number[]; // Prospect IDs
  prospectEmails?: string[]; // Prospect Email addresses for quick lookup
  
  // Step 1: Offer
  product: string;
  targetCustomer: string;
  successStories: string;
  competitorDifference: string;
  
  // Step 2: Confirm Messages
  subject: string;
  messageBody: string;
  emailSequence?: Email[];
  
  // Step 3: Automate
  sendTime?: Date;
  status: "draft" | "scheduled" | "sent" | "sending" | "active" | "paused";
  recipientCount: number;
  sentCount: number;
  failedCount?: number;
  failureReason?: string;
  clicks: number;
  opened: number;
  replied: number;
  opportunities: number;

  
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    country: String,
    jobTitles: [String],
    industry: String,
    keywords: String,
    employees: String,
    selectedProspects: { type: [Number], default: [] },
    prospectEmails: { type: [String], default: [] },
    
    product: { type: String, required: true },
    targetCustomer: { type: String, required: true },
    successStories: { type: String, required: true },
    competitorDifference: { type: String, required: true },
    
    subject: { type: String, required: true },
    messageBody: { type: String, required: true },
    emailSequence: [{
      id: String,
      subject: String,
      body: String,
    }],
    
    sendTime: Date,
    status: { type: String, enum: ["draft", "scheduled", "sent", "sending", "active", "paused"], default: "draft" },
    recipientCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    failureReason: String,
    clicks: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    replied: { type: Number, default: 0 },
    opportunities: { type: Number, default: 0 },

  },
  { timestamps: true }
);

export default mongoose.model<ICampaign>("Campaign", campaignSchema);
