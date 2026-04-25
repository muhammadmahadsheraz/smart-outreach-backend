import mongoose, { Schema, Document } from "mongoose";

export interface IProduct extends Document {
    userId: string;  // Reference to User._id (MongoDB ObjectId as string)
    product: string;
    edge: string;
    successStories: string;
    createdAt: Date;
    updatedAt: Date;
}

export type ProductRecord = {
    _id?: any;
    userId: string;  // Reference to User._id (MongoDB ObjectId as string)
    product: string;
    edge: string;
    successStories: string;
    createdAt: Date;
    updatedAt: Date;
};

const productSchema = new Schema<IProduct>(
    {
        userId: { type: String, required: true, index: true },
        product: { type: String, required: true },
        edge: { type: String, required: true },
        successStories: { type: String, required: true },
    },
    { timestamps: true }
);

export default mongoose.model<IProduct>("Product", productSchema);
