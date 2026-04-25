import mongoose, { Schema, Document } from "mongoose";

export interface ISettings extends Document {
  userId: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    oldPassword?: string;
  };
  billingDetails: {
    companyName: string;
    address: string;
    city: string;
    zipCode: string;
    country: string;
    companyNumber: string;
  };
  subscription: {
    plan: "free" | "starter" | "professional" | "enterprise";
    status: "active" | "inactive" | "cancelled" | "trial";
    startDate?: Date;
    endDate?: Date;
    renewalDate?: Date;
    amount: number;
    currency: string;
    billingCycle?: "monthly" | "yearly";
  };
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<ISettings>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    personalInfo: {
      firstName: { type: String, default: "" },
      lastName: { type: String, default: "" },
      email: { type: String, default: "" },
      oldPassword: { type: String, default: "" },
    },
    billingDetails: {
      companyName: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      country: { type: String, default: "" },
      companyNumber: { type: String, default: "" },
    },
    subscription: {
      plan: {
        type: String,
        enum: ["free", "starter", "professional", "enterprise"],
        default: "free",
      },
      status: {
        type: String,
        enum: ["active", "inactive", "cancelled", "trial"],
        default: "inactive",
      },
      startDate: { type: Date },
      endDate: { type: Date },
      renewalDate: { type: Date },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "USD" },
      billingCycle: {
        type: String,
        enum: ["monthly", "yearly"],
      },
    },
  },
  {
    timestamps: true,
  }
);

export const Settings = mongoose.model<ISettings>(
  "Settings",
  settingsSchema
);
