import mongoose from "mongoose";
import Campaign from "../models/Campaign";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://mahad7132_db_user:OuZimY4ga1986odz@smartoutreach.kbw53jp.mongodb.net/?appName=smartoutreach";

async function clearCampaigns() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log("✓ Connected to MongoDB");

    const result = await Campaign.deleteMany({});
    console.log(`✓ Deleted ${result.deletedCount} campaigns`);

    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

clearCampaigns();
