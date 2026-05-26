import mongoose, { Schema, Document } from "mongoose";

export interface IProspect extends Document {
  id: number;
  company: string;
  url: string;
  name: string;
  email: string;
  role: string;
  industry?: string;
  country?: string;
  employees?: string;
  keywords?: string[];
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const prospectSchema = new Schema<IProspect>(
  {
    id: { type: Number, required: true, unique: true },
    company: { type: String, required: true },
    url: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, required: true },
    industry: String,
    country: String,
    employees: String,
    keywords: [String],
    userId: String,
  },
  { timestamps: true }
);

prospectSchema.index({ email: 1 });
prospectSchema.index({ userId: 1 });
prospectSchema.index({ id: 1 });

export default mongoose.model<IProspect>("Prospect", prospectSchema);
