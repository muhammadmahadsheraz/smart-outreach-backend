import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import Prospect from "../models/Prospect";
import Campaign from "../models/Campaign";
import { CampaignRecipient, sendCampaignSequence } from "../lib/campaignMailer";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Configure multer for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(csv|xls|xlsx)$/)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV, XLS, and XLSX files are allowed"));
    }
  },
});

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

interface ProspectRow {
  name: string;
  company: string;
  email: string;
  role: string;
  url?: string;
  industry?: string;
  country?: string;
  employees?: string;
  keywords?: string;
}

// Get next available prospect ID
async function getNextProspectId(): Promise<number> {
  const lastProspect = await Prospect.findOne().sort({ id: -1 }).limit(1);
  return lastProspect ? lastProspect.id + 1 : 1000; // Start from 1000 for uploaded prospects
}

// Parse CSV data
function parseCSV(buffer: Buffer): Promise<ProspectRow[]> {
  return new Promise((resolve, reject) => {
    const results: ProspectRow[] = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(csv())
      .on("data", (data) => {
        // Normalize column names (case-insensitive)
        const normalized: any = {};
        Object.keys(data).forEach((key) => {
          normalized[key.toLowerCase().trim()] = data[key];
        });

        // Map to expected format
        const row: ProspectRow = {
          name: normalized.name || normalized.firstname || normalized["first name"] || "",
          company: normalized.company || normalized.organization || "",
          email: normalized.email || normalized["email address"] || "",
          role: normalized.role || normalized.title || normalized.position || "",
          url: normalized.url || normalized.website || normalized.company ? `${normalized.company.toLowerCase().replace(/\s+/g, "")}.com` : "",
          industry: normalized.industry || normalized.sector || "",
          country: normalized.country || normalized.location || "",
          employees: normalized.employees || normalized["company size"] || "",
          keywords: normalized.keywords || "",
        };

        // Only add if required fields are present
        if (row.name && row.email && row.company) {
          results.push(row);
        }
      })
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

// Upload prospects CSV and link to campaign
router.post("/upload", verifyToken, upload.single("file"), async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { campaignId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: "Campaign ID is required",
      });
    }

    // Verify campaign exists and belongs to user
    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Parse CSV
    let prospectRows: ProspectRow[];
    try {
      prospectRows = await parseCSV(req.file.buffer);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: "Failed to parse CSV file. Please ensure it's properly formatted.",
      });
    }

    if (prospectRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid prospects found in CSV. Required columns: name, email, company",
      });
    }

    // Get starting ID
    let nextId = await getNextProspectId();
    const newProspects: any[] = [];
    const newProspectIds: number[] = [];
    const newProspectEmails: string[] = [];

    // Create prospect documents
    for (const row of prospectRows) {
      // Check if prospect with this email already exists
      const existingProspect = await Prospect.findOne({ 
        email: row.email.toLowerCase() 
      });

      if (existingProspect) {
        // Use existing prospect
        newProspectIds.push(existingProspect.id);
        newProspectEmails.push(existingProspect.email.toLowerCase());
      } else {
        // Create new prospect
        const prospect = {
          id: nextId++,
          name: row.name,
          company: row.company,
          email: row.email.toLowerCase(),
          role: row.role,
          url: row.url || `${row.company.toLowerCase().replace(/\s+/g, "")}.com`,
          industry: row.industry || "",
          country: row.country || "",
          employees: row.employees || "",
          keywords: row.keywords ? row.keywords.split(",").map((k: string) => k.trim()) : [],
          userId,
        };

        newProspects.push(prospect);
        newProspectIds.push(prospect.id);
        newProspectEmails.push(prospect.email);
      }
    }

    // Bulk insert new prospects
    if (newProspects.length > 0) {
      await Prospect.insertMany(newProspects);
    }

    // Track which prospects are NEW to this campaign (not in campaign.selectedProspects before)
    const previousProspectIds = new Set(campaign.selectedProspects);
    const newToCampaignIds = newProspectIds.filter(id => !previousProspectIds.has(id));
    
    console.log(`📊 [Upload] Previous campaign prospects: ${previousProspectIds.size}`);
    console.log(`📊 [Upload] New prospect IDs being added: ${newProspectIds.length}`);
    console.log(`📊 [Upload] Prospects NEW to this campaign: ${newToCampaignIds.length}`);

    // Update campaign with new prospect IDs
    campaign.selectedProspects = [
      ...new Set([...campaign.selectedProspects, ...newProspectIds]),
    ];
    campaign.prospectEmails = [
      ...new Set([...(campaign.prospectEmails || []), ...newProspectEmails]),
    ];
    campaign.recipientCount = campaign.selectedProspects.length;

    // If campaign was completed/sent and we're adding prospects NEW to this campaign, reactivate it
    const shouldSendEmails = newToCampaignIds.length > 0 && 
      (campaign.status === "sent" || campaign.status === "active" || campaign.status === "paused");
    
    if (shouldSendEmails) {
      campaign.status = "sending";
      console.log(`📧 [Upload] Campaign ${campaignId} reactivated - will send to ${newToCampaignIds.length} prospects new to this campaign`);
    }

    await campaign.save();

    // Send emails to prospects that are NEW to this campaign
    if (shouldSendEmails && newToCampaignIds.length > 0) {
      console.log(`📧 [Upload] Preparing to send emails to ${newToCampaignIds.length} prospects new to this campaign`);
      
      // Get the full prospect data for prospects new to this campaign
      const newToCampaignProspects = await Prospect.find({ 
        id: { $in: newToCampaignIds } 
      }).lean();
      
      // Prepare recipient list
      const campaignNewRecipients: CampaignRecipient[] = newToCampaignProspects.map((p: any) => ({
        email: p.email,
        name: p.name,
        company: p.company,
        role: p.role,
      }));

      console.log(`📧 [Upload] Recipients for campaign:`, JSON.stringify(campaignNewRecipients, null, 2));

      console.log(`📧 [Upload] Recipients for campaign:`, JSON.stringify(campaignNewRecipients, null, 2));

      // Get email sequence from campaign
      const emailSequence = Array.isArray(campaign.emailSequence) && campaign.emailSequence.length > 0
        ? campaign.emailSequence
        : [{ id: "1", subject: campaign.subject, body: campaign.messageBody }];

      console.log(`📧 [Upload] Email sequence:`, JSON.stringify(emailSequence, null, 2));
      console.log(`📧 [Upload] Campaign ID: ${campaign._id.toString()}`);
      console.log(`📧 [Upload] Campaign Name: ${campaign.name}`);
      console.log(`📧 [Upload] User ID: ${userId}`);

      // Send emails in background
      sendEmailsToNewProspects(
        campaign._id.toString(),
        campaign.name,
        userId,
        campaignNewRecipients,
        emailSequence
      ).catch((error) => {
        console.error(`❌ [Upload] Background send error for new prospects in campaign ${campaign._id}:`, error);
        console.error(`❌ [Upload] Error stack:`, error.stack);
      });
    } else {
      console.log(`⏭️ [Upload] Skipping email send. shouldSendEmails: ${shouldSendEmails}, newToCampaignIds: ${newToCampaignIds.length}`);
    }

    return res.json({
      success: true,
      message: `Successfully added ${prospectRows.length} prospects to campaign${shouldSendEmails ? ' and started sending emails' : ''}`,
      data: {
        totalProcessed: prospectRows.length,
        newProspects: newProspects.length,
        existingProspects: prospectRows.length - newProspects.length,
        newToCampaign: newToCampaignIds.length,
        campaignProspectCount: campaign.selectedProspects.length,
        emailsSending: shouldSendEmails && newToCampaignIds.length > 0,
      },
    });
  } catch (error) {
    console.error("Prospect upload error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload prospects",
    });
  }
});

/**
 * Background job to send campaign emails to newly added prospects
 */
async function sendEmailsToNewProspects(
  campaignId: string,
  campaignName: string,
  userId: string,
  recipients: CampaignRecipient[],
  emailSequence: Array<{ id: string; subject: string; body: string }>
) {
  console.log(`\n🚀 [sendEmailsToNewProspects] ========== STARTING ==========`);
  console.log(`📧 [sendEmailsToNewProspects] Campaign ID: ${campaignId}`);
  console.log(`📧 [sendEmailsToNewProspects] Campaign Name: ${campaignName}`);
  console.log(`📧 [sendEmailsToNewProspects] User ID: ${userId}`);
  console.log(`📧 [sendEmailsToNewProspects] Recipients count: ${recipients.length}`);
  console.log(`📧 [sendEmailsToNewProspects] Email sequence count: ${emailSequence.length}`);
  
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      console.error(`❌ [sendEmailsToNewProspects] Campaign ${campaignId} not found in database`);
      return;
    }

    console.log(`✅ [sendEmailsToNewProspects] Campaign found: ${campaign.name}, status: ${campaign.status}`);
    console.log(`📧 [sendEmailsToNewProspects] Starting email send for ${recipients.length} new prospects`);

    const emailDelivery = await sendCampaignSequence({
      campaignId,
      campaignName,
      userId,
      recipients,
      emailSequence,
      // Progress callback - update the database periodically
      onProgress: async (progress) => {
        try {
          console.log(`📊 [sendEmailsToNewProspects] Progress: ${progress.sent}/${progress.total} sent (${progress.percentComplete}%)`);
          await Campaign.findByIdAndUpdate(
            campaignId,
            {
              sentCount: (campaign.sentCount || 0) + progress.sent,
              updatedAt: new Date(),
            },
            { new: true }
          );
        } catch (updateError) {
          console.error(`❌ [sendEmailsToNewProspects] Error updating campaign progress:`, updateError);
        }
      },
    });

    console.log(`📧 [sendEmailsToNewProspects] Email delivery result:`, JSON.stringify(emailDelivery, null, 2));

    // Update final status
    const updatedCampaign = await Campaign.findById(campaignId);
    if (updatedCampaign) {
      console.log(`📧 [sendEmailsToNewProspects] Updating campaign final status...`);
      
      if (emailDelivery.skipped) {
        console.warn(`⚠️ [sendEmailsToNewProspects] Email delivery was SKIPPED: ${emailDelivery.reason}`);
        updatedCampaign.status = "paused";
        updatedCampaign.failureReason = emailDelivery.reason;
      } else if (emailDelivery.sent > 0 && emailDelivery.failed === 0) {
        console.log(`✅ [sendEmailsToNewProspects] All emails sent successfully`);
        updatedCampaign.status = "sent";
      } else if (emailDelivery.sent > 0 && emailDelivery.failed > 0) {
        console.warn(`⚠️ [sendEmailsToNewProspects] Partial success: ${emailDelivery.sent} sent, ${emailDelivery.failed} failed`);
        updatedCampaign.status = "active";
        updatedCampaign.failedCount = (updatedCampaign.failedCount || 0) + emailDelivery.failed;
        updatedCampaign.failureReason = `${emailDelivery.failed} emails failed to send. Details: ${emailDelivery.failures.map(f => f.error).join('; ')}`;
      } else {
        console.error(`❌ [sendEmailsToNewProspects] No emails were sent`);
        updatedCampaign.status = "paused";
        updatedCampaign.failureReason = "No emails were sent";
      }

      updatedCampaign.sentCount = (campaign.sentCount || 0) + emailDelivery.sent;
      await updatedCampaign.save();
      
      console.log(`✅ [sendEmailsToNewProspects] Campaign updated: status=${updatedCampaign.status}, sentCount=${updatedCampaign.sentCount}`);
    }

    console.log(`✅ [sendEmailsToNewProspects] Complete: ${emailDelivery.sent} sent, ${emailDelivery.failed} failed`);
    console.log(`🚀 [sendEmailsToNewProspects] ========== FINISHED ==========\n`);
  } catch (error) {
    console.error(`❌ [sendEmailsToNewProspects] ========== ERROR ==========`);
    console.error(`❌ [sendEmailsToNewProspects] Campaign ${campaignId} failed:`, error);
    console.error(`❌ [sendEmailsToNewProspects] Error message:`, error instanceof Error ? error.message : String(error));
    console.error(`❌ [sendEmailsToNewProspects] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    try {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await Campaign.findByIdAndUpdate(campaignId, {
        status: "paused",
        failureReason: errorMessage,
        updatedAt: new Date(),
      });
      console.log(`✅ [sendEmailsToNewProspects] Campaign status updated to paused`);
    } catch (updateError) {
      console.error(`❌ [sendEmailsToNewProspects] Error updating campaign status after error:`, updateError);
    }
    console.error(`❌ [sendEmailsToNewProspects] ========== ERROR END ==========\n`);
  }
}

export default router;
