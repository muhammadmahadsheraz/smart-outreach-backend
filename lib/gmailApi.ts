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
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );
}

export function getAuthUrl(userId: string): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: userId,
  });
}

export async function handleOAuthCallback(code: string, userId: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const gmailEmail = userInfo.data.email || "";

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

  // Persist refreshed Google tokens so Gmail access survives access-token rotation.
  oauth2Client.on("tokens", async (tokens) => {
    const update: any = {};
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.expiry_date) update.expiryDate = tokens.expiry_date;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;

    await GmailToken.findOneAndUpdate({ userId }, update);
  });

  return { oauth2Client, gmailEmail: tokenDoc.gmailEmail };
}

export async function getGmailStatus(userId: string) {
  const tokenDoc = await GmailToken.findOne({ userId });
  if (!tokenDoc) {
    return { connected: false, email: null };
  }

  const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const tokenAge = Date.now() - new Date(tokenDoc.createdAt).getTime();
  if (tokenAge > TOKEN_MAX_AGE_MS) {
    console.log(`⚠️ [gmail] Token for user ${userId} is older than 7 days — deleting and requiring re-auth.`);
    await GmailToken.deleteOne({ userId });
    return { connected: false, email: null, reason: "token_expired" };
  }

  return { connected: true, email: tokenDoc.gmailEmail };
}

export async function disconnectGmail(userId: string) {
  await GmailToken.deleteOne({ userId });
}

export async function syncGmailMessages(userId: string): Promise<{ synced: number; error?: string }> {
  const authResult = await getAuthenticatedClient(userId);
  if (!authResult) {
    return { synced: 0, error: "Gmail not connected. Please connect your Gmail account first." };
  }

  const { oauth2Client, gmailEmail } = authResult;
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
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

    // Gmail is scanned broadly, then narrowed to known campaign prospects before saving locally.
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      labelIds: ["INBOX"],
    });

    const messages = listResponse.data.messages || [];
    if (messages.length === 0) {
      await GmailToken.findOneAndUpdate({ userId }, { lastSyncAt: new Date() });
      return { synced: 0 };
    }

    let syncedCount = 0;

    for (const msgRef of messages) {
      try {
        const gmailMessageId = msgRef.id!;

        const existing = await InboxMessage.findOne({ gmailMessageId, userId });
        if (existing) continue;

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

        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
        const senderName = fromMatch ? fromMatch[1].replace(/"/g, "").trim() : from.split("@")[0];
        const senderEmail = fromMatch ? fromMatch[2] : from;

        if (senderEmail.toLowerCase() === gmailEmail.toLowerCase()) continue;

        if (!prospectEmails.has(senderEmail.toLowerCase())) {
          console.log(`⏭️ [gmail] Skipping email from ${senderEmail} (not a campaign prospect)`);
          continue;
        }

        const body = extractBodyFromPayload(msgDetail.data.payload);
        
        const attributionMatch = body.match(/attribution-id:smart-outreach-cid-([a-f\d]{24})/i);
        const specificCampaignId = attributionMatch ? attributionMatch[1] : null;

        console.log(`[Gmail Sync] Scanned body of length ${body.length} for ${senderEmail}`);
        console.log(`[Gmail Sync] Attribution Match found? ${!!attributionMatch}`);
        console.log(`[Gmail Sync] specificCampaignId resolved to: ${specificCampaignId}`);

        // Require campaign attribution to avoid mis-attributing inbound mail.
        if (!specificCampaignId) {
          console.log(`⏭️ [gmail] Skipping email from ${senderEmail} (no campaign attribution ID found)`);
          continue;
        }

        const campaignBelongsToUser = userCampaigns.some(c => c._id.toString() === specificCampaignId);
        if (!campaignBelongsToUser) {
          console.log(`⏭️ [gmail] Skipping email from ${senderEmail} (campaign ${specificCampaignId} doesn't belong to user)`);
          continue;
        }

        const preview = body.substring(0, 150);

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

        let threadId: string | undefined;
        if (specificCampaignId) {
          // Threads are scoped by sender and campaign so repeated replies stay grouped correctly.
          const existingThread = await InboxMessage.findOne({
            userId,
            senderEmail: senderEmail.toLowerCase(),
            campaignId: specificCampaignId,
          }).sort({ receivedAt: 1 });

          if (existingThread) {
            threadId = existingThread.threadId || existingThread._id.toString();
            console.log(`[Gmail Sync] Found existing thread: ${threadId} for ${senderEmail} in campaign ${specificCampaignId}`);
          } else {
            console.log(`[Gmail Sync] New thread will be created for ${senderEmail} in campaign ${specificCampaignId}`);
          }
        }

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
          campaignId: specificCampaignId,
          threadId,
        });

        await message.save();

        if (!threadId && specificCampaignId) {
          message.threadId = message._id.toString();
          await message.save();
          console.log(`[Gmail Sync] Created new thread: ${message.threadId}`);
        }

        syncedCount++;

        try {
          if (specificCampaignId) {
            await Campaign.findByIdAndUpdate(specificCampaignId, { $inc: { replied: 1 } });
            console.log(`✅ [gmail] Precise attribution for Campaign ${specificCampaignId}`);
          } else {
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
        console.error(`Error processing message ${msgRef.id}:`, err.message);
      }
    }

    await GmailToken.findOneAndUpdate({ userId }, {
      lastSyncAt: new Date(),
      historyId: listResponse.data.resultSizeEstimate?.toString(),
    });

    return { synced: syncedCount };
  } catch (error: any) {
    console.error("Gmail sync error:", error.message);

    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      await GmailToken.deleteOne({ userId });
      return { synced: 0, error: "Gmail authorization expired. Please reconnect your Gmail account." };
    }

    return { synced: 0, error: error.message };
  }
}

export async function sendViaGmail(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string,
  headers?: Record<string, string>
): Promise<void> {
  const authResult = await getAuthenticatedClient(userId);
  if (!authResult) {
    throw new Error("Gmail not connected for this user.");
  }

  const { oauth2Client, gmailEmail } = authResult;
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const headerLines = [
    `From: ${gmailEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ...(headers
      ? Object.entries(headers).map(([k, v]) => `${k}: ${v}`)
      : []),
  ];

  const rawMessage = [
    ...headerLines,
    "",
    htmlBody,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  }).catch(async (err: any) => {
    // Clear invalid tokens so the client can re-auth cleanly.
    if (err?.message?.includes("invalid_grant") || err?.code === 401) {
      console.warn(`⚠️ [gmail] invalid_grant for user ${userId} — deleting token, re-auth required.`);
      await GmailToken.deleteOne({ userId });
      throw new Error("Gmail authorization expired. Please reconnect your Gmail account.");
    }
    throw err;
  });
}

export async function canSendViaGmail(userId: string): Promise<boolean> {
  const tokenDoc = await GmailToken.findOne({ userId });
  return !!tokenDoc?.refreshToken;
}


function extractBodyFromPayload(payload: any): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }

    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
        return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
    }

    for (const part of payload.parts) {
      const result = extractBodyFromPayload(part);
      if (result) return result;
    }
  }

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  return "";
}
