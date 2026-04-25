import mongoose, { Schema, Document } from "mongoose";

export interface ICompany extends Document {
    userId: string;  // Reference to User._id (MongoDB ObjectId as string)
    companyName: string;
    website: string;
    description: string;
    brochureUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type CompanyRecord = {
    _id?: any;
    userId: string;  // Reference to User._id (MongoDB ObjectId as string)
    companyName: string;
    website: string;
    description: string;
    brochureUrl?: string;
    createdAt: Date;
    updatedAt: Date;
};

const companySchema = new Schema<ICompany>(
    {
        userId: { type: String, required: true, index: true },
        companyName: { type: String, required: true },
        website: { type: String, required: true },
        description: { type: String, required: true },
        brochureUrl: String,
    },
    { timestamps: true }
);

export default mongoose.model<ICompany>("Company", companySchema);
