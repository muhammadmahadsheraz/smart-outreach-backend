const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://mahad7132_db_user:OuZimY4ga1986odz@smartoutreach.kbw53jp.mongodb.net/?appName=smartoutreach";

async function clearInbox() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    
    // We need to access the collection directly or define a temp model 
    // since we are running outside the app context
    const InboxMessage = mongoose.model('InboxMessage', new mongoose.Schema({}, { strict: false }));
    
    console.log("Deleting all messages from 'inboxmessages' collection...");
    const result = await InboxMessage.deleteMany({});
    
    console.log(`Successfully deleted ${result.deletedCount} messages.`);
    process.exit(0);
  } catch (error) {
    console.error("Error clearing inbox:", error);
    process.exit(1);
  }
}

clearInbox();
