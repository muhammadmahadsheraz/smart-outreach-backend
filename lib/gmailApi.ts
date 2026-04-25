import { google } from "googleapis";
import { GmailToken } from "../models/GmailToken";
import { InboxMessage } from "../models/InboxMessage";
import Campaign from "../models/Campaign";
import { PROSPECTS_DATABASE } from "./prospectDatabase";

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || "";
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "";
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/gmail/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Create an OAuth2 client
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );
}

/**
 * Generate the consent URL for Gmail OAuth2
 */
export function getAuthUrl(userId: string): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent to always get refresh_token
    state: userId, // Pass userId in state to identify user in callback
  });
}

/**
 * Exchange authorization code for tokens and save them
 */
export async function handleOAuthCallback(code: string, userId: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);

  // Get the user's Gmail email address
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const gmailEmail = userInfo.data.email || "";

  // Save or update tokens in DB
  await GmailToken.findOneAndUpdate(
    { userId },
    {
      userId,
      gmailEmail,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiryDate: tokens.expiry_date || 0,
    },
    { upsert: true, new: true }
  );

  return { gmailEmail };
}

/**
 * Get an authenticated OAuth2 client for a user
 */
async function getAuthenticatedClient(userId: string) {
  const tokenDoc = await GmailToken.findOne({ userId });
  if (!tokenDoc) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenDoc.accessToken,
    refresh_token: tokenDoc.refreshToken,
    expiry_date: tokenDoc.expiryDate,
  });

  // Listen for token refresh events to update DB
  oauth2Client.on("tokens", async (tokens) => {
    const update: any = {};
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.expiry_date) update.expiryDate = tokens.expiry_date;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;

    await GmailToken.findOneAndUpdate({ userId }, update);
  });

  return { oauth2Client, gmailEmail: tokenDoc.gmailEmail };
}

/**
 * Check if a user has Gmail connected
 */
export async function getGmailStatus(userId: string) {
  const tokenDoc = await GmailToken.findOne({ userId });
  if (!tokenDoc) {
    return { connected: false, email: null };
  }
  return { connected: true, email: tokenDoc.gmailEmail };
}

/**
 * Disconnect Gmail (remove tokens)
 */
export async function disconnectGmail(userId: string) {
  await GmailToken.deleteOne({ userId });
}

/**
 * Sync emails from Gmail — fetches recent emails and stores them as InboxMessages.
 * Uses the Gmail API to search for replies to outreach campaigns.
 */
export async function syncGmailMessages(userId: string): Promise<{ synced: number; error?: string }> {
  const authResult = await getAuthenticatedClient(userId);
  if (!authResult) {
    return { synced: 0, error: "Gmail not connected. Please connect your Gmail account first." };
  }

  const { oauth2Client, gmailEmail } = authResult;
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    // 1. Get all prospect emails for THIS user's campaigns
    const userCampaigns = await Campaign.find({ userId });
    const prospectIds = new Set<number>();
    userCampaigns.forEach((c) => {
      if (Array.isArray(c.selectedProspects)) {
        c.selectedProspects.forEach((id) => prospectIds.add(id));
      }
    });

    const prospectEmails = new Set<string>();
    PROSPECTS_DATABASE.forEach((p) => {
      if (prospectIds.has(p.id)) {
        prospectEmails.add(p.email.toLowerCase());
      }
    });

    console.log(`🔵 [gmail] Filtering for ${prospectEmails.size} unique prospect emails`);

    // 2. Fetch recent emails from INBOX (last 50 messages)
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      labelIds: ["INBOX"],
    });

    const messages = listResponse.data.messages || [];
    if (messages.length === 0) {
      // Update last sync time
      await GmailToken.findOneAndUpdate({ userId }, { lastSyncAt: new Date() });
      return { synced: 0 };
    }

    let syncedCount = 0;

    for (const msgRef of messages) {
      try {
        const gmailMessageId = msgRef.id!;

        // Skip if already synced
        const existing = await InboxMessage.findOne({ gmailMessageId, userId });
        if (existing) continue;

        // Fetch full message
        const msgDetail = await gmail.users.messages.get({
          userId: "me",
          id: gmailMessageId,
          format: "full",
        });

        const headers = msgDetail.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

        const from = getHeader("From");
        const subject = getHeader("Subject");
        const date = getHeader("Date");

        // Extract sender name and email from "Name <email>" format
        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
        const senderName = fromMatch ? fromMatch[1].replace(/"/g, "").trim() : from.split("@")[0];
        const senderEmail = fromMatch ? fromMatch[2] : from;

        // Skip emails sent by the user themselves
        if (senderEmail.toLowerCase() === gmailEmail.toLowerCase()) continue;

        // ONLY sync if the sender is one of the user's campaign prospects
        if (!prospectEmails.has(senderEmail.toLowerCase())) {
          console.log(`⏭️ [gmail] Skipping email from ${senderEmail} (not a campaign prospect)`);
          continue;
        }

        // Extract body text
        const body = extractBodyFromPayload(msgDetail.data.payload);
        const preview = body.substring(0, 150);

        // Auto-tag based on content
        let tag: "lead" | "meeting_booked" | "possible" | undefined;
        const subjectLower = subject.toLowerCase();
        const bodyLower = body.toLowerCase();

        if (subjectLower.includes("meeting") || subjectLower.includes("schedule") || bodyLower.includes("confirmed") || bodyLower.includes("calendar")) {
          tag = "meeting_booked";
        } else if (subjectLower.includes("interested") || bodyLower.includes("interested") || bodyLower.includes("demo") || bodyLower.includes("learn more")) {
          tag = "lead";
        } else {
          tag = "possible";
        }

        // 3. Attribute to exact campaign using the hidden ID
        const attributionMatch = body.match(/attribution-id:smart-outreach-cid-([a-f\d]{24})/i);
        const specificCampaignId = attributionMatch ? attributionMatch[1] : null;

        console.log(`[Gmail Sync] Scanned body of length ${body.length} for ${senderEmail}`);
        console.log(`[Gmail Sync] Attribution Match found? ${!!attributionMatch}`);
        console.log(`[Gmail Sync] specificCampaignId resolved to: ${specificCampaignId}`);

        // Save to DB
        const message = new InboxMessage({
          userId,
          senderName,
          senderEmail,
          subject: subject || "(no subject)",
          body: body || "",
          preview,
          receivedAt: date ? new Date(date) : new Date(),
          isRead: false,
          tag,
          gmailMessageId,
          campaignId: specificCampaignId, // Link this message to the campaign!
        });

        await message.save();
        syncedCount++;

        // 4. Update Campaign Reply Count
        try {
          if (specificCampaignId) {
            // HIGH CERTAINTY: Attribution ID found
            await Campaign.findByIdAndUpdate(specificCampaignId, { $inc: { replied: 1 } });
            console.log(`✅ [gmail] Precise attribution for Campaign ${specificCampaignId}`);
          } else {
            // FALLBACK: Attribute to all active campaigns for this prospect for this user
            const updateResult = await Campaign.updateMany(
              { 
                userId, 
                status: { $in: ["active", "sent", "sending"] },
                prospectEmails: senderEmail.toLowerCase()
              },
              { $inc: { replied: 1 } }
            );
            if (updateResult.modifiedCount > 0) {
              console.log(`📈 [gmail] Fallback attribution to ${updateResult.modifiedCount} campaign(s) for ${senderEmail}`);
            }
          }
        } catch (campaignErr) {
          console.error("Error updating campaign reply count:", campaignErr);
        }

      } catch (err: any) {
        // Skip individual message errors (e.g. deleted messages)
        console.error(`Error processing message ${msgRef.id}:`, err.message);
      }
    }

    // Update last sync time and historyId
    await GmailToken.findOneAndUpdate({ userId }, {
      lastSyncAt: new Date(),
      historyId: listResponse.data.resultSizeEstimate?.toString(),
    });

    return { synced: syncedCount };
  } catch (error: any) {
    console.error("Gmail sync error:", error.message);

    // If token is invalid/expired and can't be refreshed, clear it
    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      await GmailToken.deleteOne({ userId });
      return { synced: 0, error: "Gmail authorization expired. Please reconnect your Gmail account." };
    }

    return { synced: 0, error: error.message };
  }
}

/**
 * Extract plain text body from Gmail message payload
 */
function extractBodyFromPayload(payload: any): string {
  if (!payload) return "";

  // If this part has a body with data, decode it
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // If this is multipart, recurse into parts
  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }

    // Fallback: try text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
        // Strip HTML tags for plain text
        return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
    }

    // Recurse into nested multipart
    for (const part of payload.parts) {
      const result = extractBodyFromPayload(part);
      if (result) return result;
    }
  }

  // Fallback: try body.data directly
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  return "";
}
