const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://mahad7132_db_user:OuZimY4ga1986odz@smartoutreach.kbw53jp.mongodb.net/?appName=smartoutreach";
const USER_ID = "69e7aab03f4b1d953854e2c2";

async function checkCampaigns() {
  try {
    await mongoose.connect(MONGO_URI);
    const Campaign = mongoose.model('Campaign', new mongoose.Schema({}, { strict: false }));
    
    console.log(`Checking campaigns for user: ${USER_ID}`);
    const campaigns = await Campaign.find({ userId: USER_ID });
    
    if (campaigns.length === 0) {
      console.log("No campaigns found for this user.");
    } else {
      campaigns.forEach((c, i) => {
        console.log(`Campaign ${i+1}: ${c.name}`);
        console.log(`Prospect IDs: ${JSON.stringify(c.selectedProspects)}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkCampaigns();
