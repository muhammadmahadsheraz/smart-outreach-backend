const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://mahad7132_db_user:OuZimY4ga1986odz@smartoutreach.kbw53jp.mongodb.net/?appName=smartoutreach";
const EMAIL_ID = "mahad7132@gmail.com"; // Your login email
const INTERNAL_ID = "69e7aab03f4b1d953854e2c2"; // Your internal DB ID

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    const Campaign = mongoose.model('Campaign', new mongoose.Schema({}, { strict: false }));
    const InboxMessage = mongoose.model('InboxMessage', new mongoose.Schema({}, { strict: false }));

    console.log(`Migrating campaigns from ${EMAIL_ID} to ${INTERNAL_ID}...`);
    const cResult = await Campaign.updateMany({ userId: EMAIL_ID }, { userId: INTERNAL_ID });
    console.log(`Updated ${cResult.modifiedCount} campaigns.`);

    console.log(`Migrating inbox messages from ${EMAIL_ID} to ${INTERNAL_ID}...`);
    const iResult = await InboxMessage.updateMany({ userId: EMAIL_ID }, { userId: INTERNAL_ID });
    console.log(`Updated ${iResult.modifiedCount} messages.`);

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
