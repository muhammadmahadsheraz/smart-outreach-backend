import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();
import Campaign from './models/Campaign';
import { InboxMessage } from './models/InboxMessage';

async function clearDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/smart-outreach";
  await mongoose.connect(uri);
  
  const campaignResult = await Campaign.deleteMany({});
  const inboxResult = await InboxMessage.deleteMany({});
  
  console.log(`Deleted ${campaignResult.deletedCount} campaigns.`);
  console.log(`Deleted ${inboxResult.deletedCount} inbox messages.`);
  
  await mongoose.disconnect();
}

clearDB().catch(console.error);
