import mongoose from "mongoose";
import { compare, hash, genSaltSync, hashSync, compareSync } from "bcryptjs";
import { User, type IUser } from "../models/User";
import Campaign from "../models/Campaign";
import ClientModel, { type IClient } from "../models/Client";
import CompanyModel, { type ICompany } from "../models/Company";
import ProductModel, { type IProduct } from "../models/Product";
import type { CompanyRecord } from "../models/Company";
import type { ClientRecord } from "../models/Client";
import type { ProductRecord } from "../models/Product";

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://mahad7132_db_user:OuZimY4ga1986odz@smartoutreach.kbw53jp.mongodb.net/?appName=smartoutreach";

export type UserRecord = {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    company: string;
};

export type { CompanyRecord, ClientRecord, ProductRecord };

// Connect to MongoDB using Mongoose
async function connectToDb() {
    if (mongoose.connection.readyState === 1) {
        return;
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Failed to connect to MongoDB:", error);
        throw error;
    }
}

export function hashPassword(password: string): string {
    const salt = genSaltSync(10);
    return hashSync(password, salt);
}

export function verifyPassword(password: string, hash_value: string): boolean {
    return compareSync(password, hash_value);
}

export async function findUserByEmail(email: string): Promise<IUser | null> {
    await connectToDb();
    return await User.findOne({ email: email.toLowerCase() });
}

export async function createUser(params: {
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    password: string;
}): Promise<UserRecord> {
    await connectToDb();

    const existing = await findUserByEmail(params.email);
    if (existing) {
        throw new Error("User already exists");
    }

    const hashedPassword = hashPassword(params.password);
    
    const user = new User({
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email.toLowerCase(),
        company: params.company,
        password: hashedPassword,
    });

    const savedUser = await user.save();
    
    return {
        _id: savedUser._id.toString(),
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        email: savedUser.email,
        company: savedUser.company,
    };
}

export async function verifyUser(email: string, password: string): Promise<UserRecord | null> {
    await connectToDb();
    const user = await findUserByEmail(email);
    if (!user) return null;
    
    if (!verifyPassword(password, user.password)) return null;
    
    return {
        _id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        company: user.company,
    };
}

// Company functions
export async function saveCompanyData(userId: string, data: {
    companyName: string;
    website: string;
    description: string;
    brochureUrl?: string;
}): Promise<CompanyRecord> {
    await connectToDb();
    
    const companyRecord = await CompanyModel.findOneAndUpdate(
        { userId },
        {
            userId,
            companyName: data.companyName,
            website: data.website,
            description: data.description,
            brochureUrl: data.brochureUrl,
        },
        { upsert: true, new: true }
    );

    return companyRecord?.toObject() as CompanyRecord;
}

export async function getCompanyData(userId: string): Promise<CompanyRecord | null> {
    await connectToDb();
    const company = await CompanyModel.findOne({ userId });
    return company ? (company.toObject() as CompanyRecord) : null;
}

// Client functions
export async function saveClientData(userId: string, data: {
    niches: string[];
    location: string;
    decisionMakers?: string[];
    targetCompanies?: string[];
}): Promise<ClientRecord> {
    await connectToDb();
    
    const clientRecord = await ClientModel.findOneAndUpdate(
        { userId },
        {
            userId,
            niches: data.niches,
            location: data.location,
            decisionMakers: data.decisionMakers,
            targetCompanies: data.targetCompanies,
        },
        { upsert: true, new: true }
    );

    return clientRecord?.toObject() as ClientRecord;
}

export async function getClientData(userId: string): Promise<ClientRecord | null> {
    await connectToDb();
    const client = await ClientModel.findOne({ userId });
    return client ? (client.toObject() as ClientRecord) : null;
}

// Product functions
export async function saveProductData(userId: string, data: {
    product: string;
    edge: string;
    successStories: string;
}): Promise<ProductRecord> {
    await connectToDb();
    
    const productRecord = await ProductModel.findOneAndUpdate(
        { userId },
        {
            userId,
            product: data.product,
            edge: data.edge,
            successStories: data.successStories,
        },
        { upsert: true, new: true }
    );

    return productRecord?.toObject() as ProductRecord;
}

export async function getProductData(userId: string): Promise<ProductRecord | null> {
    await connectToDb();
    const product = await ProductModel.findOne({ userId });
    return product ? (product.toObject() as ProductRecord) : null;
}
