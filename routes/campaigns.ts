import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import Campaign from "../models/Campaign";
import { InboxMessage } from "../models/InboxMessage";
import { PROSPECTS_DATABASE } from "../lib/prospectDatabase";
import {
  CampaignRecipient,
  sendCampaignSequence,
} from "../lib/campaignMailer";


const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Middleware to verify JWT token
const verifyToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        res.status(401).json({ ok: false, error: "Missing token" });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ ok: false, error: "Invalid token" });
    }
};

interface CreateCampaignBody {
  name: string;
  country?: string;
  jobTitles?: string[];
  industry?: string;
  keywords?: string;
  employees?: string;
  selectedProspects: number[];
  product: string;
  targetCustomer: string;
  successStories: string;
  competitorDifference: string;
  subject: string;
  messageBody: string;
  emailSequence?: Array<{ id: string; subject: string; body: string }>;
  selectedProspectContacts?: Array<{
    id?: number;
    email: string;
    name?: string;
    company?: string;
    role?: string;
  }>;
  autoSendOnCreate?: boolean;
  sendTime?: Date;
}

// Create new campaign
router.post("/create", verifyToken, async (req: any, res: Response) => {
  try {
    const body: CreateCampaignBody = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(body.selectedProspects) || body.selectedProspects.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please select at least one prospect",
      });
    }

    if (!body.product || !body.subject || !body.messageBody) {
      return res.status(400).json({
        success: false,
        error: "Missing required campaign fields",
      });
    }

    const selectedProspectContacts: CampaignRecipient[] = Array.isArray(body.selectedProspectContacts)
      ? body.selectedProspectContacts
          .filter((contact) => typeof contact?.email === "string" && contact.email.trim().length > 0)
          .map((contact) => ({
            email: contact.email,
            name: contact.name,
            company: contact.company,
            role: contact.role,
          }))
      : [];

    const shouldAutoSend = body.autoSendOnCreate ?? true;

    if (shouldAutoSend && selectedProspectContacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No recipient emails found for selected prospects",
      });
    }

    const emailSequence = Array.isArray(body.emailSequence) && body.emailSequence.length > 0
      ? body.emailSequence
      : [{ id: "1", subject: body.subject, body: body.messageBody }];

    const campaign = new Campaign({
      userId,
      name: body.name || `Campaign ${new Date().toLocaleDateString()}`,
      country: body.country,
      jobTitles: body.jobTitles,
      industry: body.industry,
      keywords: body.keywords,
      employees: body.employees,
      selectedProspects: body.selectedProspects,
      prospectEmails: selectedProspectContacts.map((c) => c.email.toLowerCase()),
      product: body.product,
      targetCustomer: body.targetCustomer,
      successStories: body.successStories,
      competitorDifference: body.competitorDifference,
      subject: body.subject,
      messageBody: body.messageBody,
      emailSequence,
      sendTime: body.sendTime,
      status: shouldAutoSend ? "sending" : body.sendTime ? "scheduled" : "draft",
      recipientCount:
        selectedProspectContacts.length > 0
          ? selectedProspectContacts.length
          : body.selectedProspects.length,
      sentCount: 0,
      clicks: 0,
      replied: 0,
      opportunities: 0,
    });

    await campaign.save();

    // Start background email sending if auto-send is enabled
    if (shouldAutoSend && selectedProspectContacts.length > 0) {
      // Don't await - just start the background job
      sendCampaignInBackground(
        campaign._id.toString(),
        campaign.name,
        selectedProspectContacts,
        emailSequence
      ).catch((error) => {
        console.error(`Background send error for campaign ${campaign._id}:`, error);
      });
    }

    return res.json({
      success: true,
      message: "Campaign created successfully. Emails are being sent in the background.",
      campaign: campaign,
    });
  } catch (error) {
    console.error("Campaign creation error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create campaign",
    });
  }
});

// Get all campaigns for the user
router.get("/list", verifyToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const campaigns = await Campaign.find({ userId }).sort({ createdAt: -1 });
    return res.json({
      success: true,
      campaigns: campaigns,
    });
  } catch (error) {
    console.error("Fetch campaigns error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch campaigns",
    });
  }
});

// Get aggregated stats for the user
router.get("/stats", verifyToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { campaignId } = req.query;
    
    console.log(`[Stats API] Fetching stats for user: ${userId}, campaignId: ${campaignId}`);

    let campaigns;
    if (campaignId && campaignId !== "all") {
      const campaign = await Campaign.findOne({ _id: campaignId, userId });
      console.log(`[Stats API] Specific campaign found:`, campaign ? campaign.name : 'null');
      campaigns = campaign ? [campaign] : [];
    } else {
      campaigns = await Campaign.find({ userId });
      console.log(`[Stats API] Found ${campaigns.length} total campaigns for user`);
    }

    const stats = {
      totalSent: 0,
      totalClicks: 0,
      totalOpened: 0,
      totalReplied: 0,
      totalOpportunities: 0,
      campaignCount: campaigns.length
    };

    campaigns.forEach(c => {
      stats.totalSent += (c.sentCount || 0);
      stats.totalClicks += (c.clicks || 0);
      stats.totalOpened += (c.opened || 0);
      stats.totalReplied += (c.replied || 0);
      stats.totalOpportunities += (c.opportunities || 0);
    });

    console.log(`[Stats API] Aggregated stats:`, stats);

    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error("[Stats API] Fetch stats error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch stats",
    });
  }
});

// Get business opportunities (replies) for campaigns
router.get("/opportunities", verifyToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { campaignId } = req.query;

    console.log(`[Opps API] Fetching opportunities for user: ${userId}, campaignId: ${campaignId}`);

    const query: any = { userId };
    if (campaignId && campaignId !== "all") {
      query.campaignId = campaignId;
    } else {
      query.campaignId = { $exists: true, $ne: null };
    }

    console.log(`[Opps API] Querying InboxMessage with:`, JSON.stringify(query));
    const replies = await InboxMessage.find(query).sort({ receivedAt: -1 }).lean();
    console.log(`[Opps API] Raw replies found in DB:`, JSON.stringify(replies, null, 2));

    const opportunities = replies.map((reply: any) => {
      const prospect = PROSPECTS_DATABASE.find(p => p.email.toLowerCase() === reply.senderEmail.toLowerCase());
      const mapped = {
        company: prospect?.company || "Unknown Company",
        website: prospect?.company ? `www.${prospect.company.toLowerCase().replace(/\s+/g, '')}.com` : "N/A",
        name: reply.senderName || prospect?.name || "Unknown Lead",
        role: prospect?.role || "Contact",
        email: reply.senderEmail,
        status: reply.tag || "Contacted",
        receivedAt: reply.receivedAt
      };
      return mapped;
    });

    console.log(`[Opps API] Fully mapped Opportunities array:`, JSON.stringify(opportunities, null, 2));

    return res.json({
      success: true,
      opportunities
    });
  } catch (error) {
    console.error("[Opps API] Fetch opportunities error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch opportunities",
    });
  }
});



// Get campaign by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }
    return res.json({
      success: true,
      campaign: campaign,
    });
  } catch (error) {
    console.error("Fetch campaign error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch campaign",
    });
  }
});

// Update campaign status
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    return res.json({
      success: true,
      campaign: campaign,
    });
  } catch (error) {
    console.error("Update campaign error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update campaign",
    });
  }
});

export default router;

/**
 * Background job to send campaign emails with progress tracking
 */
async function sendCampaignInBackground(
  campaignId: string,
  campaignName: string,
  recipients: CampaignRecipient[],
  emailSequence: Array<{ id: string; subject: string; body: string }>
) {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      console.error(`Campaign ${campaignId} not found`);
      return;
    }

    console.log(`🚀 Starting background send for campaign: ${campaignName} (ID: ${campaignId})`);

    const emailDelivery = await sendCampaignSequence({
      campaignId,
      campaignName,
      recipients,
      emailSequence,
      // Progress callback - update the database periodically
      onProgress: async (progress) => {
        try {
          await Campaign.findByIdAndUpdate(
            campaignId,
            {
              sentCount: progress.sent,
              // You could add failedCount field if needed
              updatedAt: new Date(),
            },
            { new: true }
          );
          console.log(
            `📧 Campaign ${campaignId}: ${progress.percentComplete}% complete (${progress.sent}/${progress.total} sent)`
          );
        } catch (updateError) {
          console.error(`Error updating campaign progress for ${campaignId}:`, updateError);
        }
      },
    });

    // Update final status
    if (emailDelivery.skipped) {
      campaign.status = "paused";
      campaign.failureReason = emailDelivery.reason;
    } else if (emailDelivery.sent > 0 && emailDelivery.failed === 0) {
      campaign.status = "sent";
    } else if (emailDelivery.sent > 0 && emailDelivery.failed > 0) {
      campaign.status = "active";
      campaign.failedCount = emailDelivery.failed;
      campaign.failureReason = `${emailDelivery.failed} emails failed to send. Details: ${emailDelivery.failures.map(f => f.error).join('; ')}`;
    } else {
      campaign.status = "paused";
      campaign.failureReason = "No emails were sent";
    }

    campaign.sentCount = emailDelivery.sent;
    await campaign.save();

    console.log(
      `✅ Campaign ${campaignId} complete: ${emailDelivery.sent} sent, ${emailDelivery.failed} failed`
    );
  } catch (error) {
    console.error(`❌ Background send failed for campaign ${campaignId}:`, error);
    try {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await Campaign.findByIdAndUpdate(campaignId, {
        status: "paused",
        failureReason: errorMessage,
        updatedAt: new Date(),
      });
    } catch (updateError) {
      console.error(`Error updating campaign status after error:`, updateError);
    }
  }
}
