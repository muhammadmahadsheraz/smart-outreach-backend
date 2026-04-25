import mongoose, { Schema, Document } from "mongoose";

export interface IClient extends Document {
    userId: string;  // Reference to User._id (MongoDB ObjectId as string)
    niches: string[];
    location: string;
    decisionMakers?: string[];
    targetCompanies?: string[];
    createdAt: Date;
    updatedAt: Date;
}

export type ClientRecord = {
    _id?: any;
    userId: string;  // Reference to User._id (MongoDB ObjectId as string)
    niches: string[];
    location: string;
    decisionMakers?: string[];
    targetCompanies?: string[];
    createdAt: Date;
    updatedAt: Date;
};

const clientSchema = new Schema<IClient>(
    {
        userId: { type: String, required: true, index: true },
        niches: { type: [String], required: true },
        location: { type: String, required: true },
        decisionMakers: [String],
        targetCompanies: [String],
    },
    { timestamps: true }
);

export default mongoose.model<IClient>("Client", clientSchema);
