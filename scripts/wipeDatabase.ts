import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smart-outreach";

async function wipeDatabase() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }

    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log(`\n📋 Found ${collections.length} collections`);

    // Collections to wipe (everything except prospects)
    const collectionsToWipe = [
      "users",
      "campaigns",
      "inboxmessages",
      "gmailtokens",
      "clients",
      "companies",
      "products",
    ];

    console.log("\n🗑️  Wiping collections...\n");

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      
      // Skip prospects collection
      if (collectionName.toLowerCase() === "prospects") {
        console.log(`⏭️  Skipping: ${collectionName} (preserved)`);
        continue;
      }

      // Check if this collection should be wiped
      if (collectionsToWipe.some(name => collectionName.toLowerCase().includes(name.toLowerCase()))) {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        await collection.deleteMany({});
        console.log(`✅ Wiped: ${collectionName} (${count} documents deleted)`);
      } else {
        console.log(`⏭️  Skipped: ${collectionName} (not in wipe list)`);
      }
    }

    console.log("\n✅ Database wipe complete!");
    console.log("📊 Prospects collection preserved");

  } catch (error) {
    console.error("❌ Error wiping database:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the script
wipeDatabase();
