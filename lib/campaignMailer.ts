import nodemailer from "nodemailer";

export interface CampaignRecipient {
  email: string;
  name?: string;
  company?: string;
  role?: string;
}

export interface CampaignEmailTemplate {
  id?: string;
  subject: string;
  body: string;
}

export interface CampaignSendFailure {
  recipientEmail: string;
  subject: string;
  error: string;
}

export interface CampaignSendSummary {
  skipped: boolean;
  reason?: string;
  attempted: number;
  sent: number;
  failed: number;
  failures: CampaignSendFailure[];
}

export type ProgressCallback = (progress: {
  sent: number;
  failed: number;
  total: number;
  percentComplete: number;
}) => Promise<void>

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

interface SendCampaignSequenceArgs {
  campaignId: string;
  campaignName: string;
  recipients: CampaignRecipient[];
  emailSequence: CampaignEmailTemplate[];
  onProgress?: ProgressCallback;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * Wraps all links in the text with the tracking URL
 */
function wrapLinksWithTracking(text: string, campaignId: string): string {
  const trackingBase = process.env.TRACKING_BASE_URL || "http://localhost:4000/api/track";
  
  // Regex to find http/https/www links
  // This avoids wrapping email addresses or already-wrapped links
  const urlRegex = /(?<!aria-label=")(https?:\/\/[^\s<"']+)/g;
  
  return text.replace(urlRegex, (url) => {
    // Avoid double wrapping
    if (url.includes("/api/track?")) return url;
    
    const encodedUrl = encodeURIComponent(url);
    return `${trackingBase}?r=${encodedUrl}&c=${campaignId}`;
  });
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  const parsedPort = Number(process.env.SMTP_PORT ?? 587);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const from = process.env.SMTP_FROM?.trim() || user;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

function normalizeRecipients(recipients: CampaignRecipient[]): CampaignRecipient[] {
  const seen = new Set<string>();
  const normalized: CampaignRecipient[] = [];

  for (const recipient of recipients) {
    const email = recipient.email?.trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(email) || seen.has(email)) {
      continue;
    }

    seen.add(email);
    normalized.push({
      ...recipient,
      email,
      name: recipient.name?.trim(),
      company: recipient.company?.trim(),
      role: recipient.role?.trim(),
    });
  }

  return normalized;
}

function sanitizeEmailSequence(sequence: CampaignEmailTemplate[]): CampaignEmailTemplate[] {
  return sequence
    .map((template, index) => ({
      id: template.id || String(index + 1),
      subject: String(template.subject ?? "").trim(),
      body: String(template.body ?? "").trim(),
    }))
    .filter((template) => template.subject.length > 0 && template.body.length > 0);
}

function personalizeBody(body: string, recipient: CampaignRecipient): string {
  const firstName = recipient.name?.split(" ")[0] || "there";

  return body
    // Frontend format placeholders
    .replace(/\{\{\s*PROSPECT_NAME\s*\}\}/g, recipient.name || "there")
    .replace(/\{\{\s*COMPANY_NAME\s*\}\}/g, recipient.company || "your company")
    .replace(/\{\{\s*PROSPECT_ROLE\s*\}\}/g, recipient.role || "your role")
    // Legacy format placeholders (for backward compatibility)
    .replace(/\{\{\s*name\s*\}\}/gi, recipient.name || "there")
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*company\s*\}\}/gi, recipient.company || "your company")
    .replace(/\{\{\s*role\s*\}\}/gi, recipient.role || "your role");
}

function getMaxRecipientsLimit(): number {
  const parsed = Number(process.env.CAMPAIGN_MAX_RECIPIENTS_PER_SEND ?? 50);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

export async function sendCampaignSequence(
  args: SendCampaignSequenceArgs
): Promise<CampaignSendSummary> {
  const realSendEnabled = parseBoolean(process.env.ENABLE_REAL_EMAIL_SEND, false);

  if (!realSendEnabled) {
    return {
      skipped: true,
      reason:
        "Real send is disabled. Set ENABLE_REAL_EMAIL_SEND=true in backend/.env to enable sending.",
      attempted: 0,
      sent: 0,
      failed: 0,
      failures: [],
    };
  }

  const smtp = getSmtpConfig();
  if (!smtp) {
    return {
      skipped: true,
      reason:
        "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and SMTP_FROM in backend/.env.",
      attempted: 0,
      sent: 0,
      failed: 0,
      failures: [],
    };
  }

  const recipients = normalizeRecipients(args.recipients);
  const emailSequence = sanitizeEmailSequence(args.emailSequence);

  if (recipients.length === 0) {
    return {
      skipped: true,
      reason: "No valid recipient emails were provided.",
      attempted: 0,
      sent: 0,
      failed: 0,
      failures: [],
    };
  }

  if (emailSequence.length === 0) {
    return {
      skipped: true,
      reason: "No valid email templates were provided.",
      attempted: 0,
      sent: 0,
      failed: 0,
      failures: [],
    };
  }

  const maxRecipients = getMaxRecipientsLimit();
  const recipientBatch = recipients.slice(0, maxRecipients);
  const attempted = recipientBatch.length * emailSequence.length;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  try {
    await transporter.verify();
  } catch (error) {
    return {
      skipped: false,
      attempted,
      sent: 0,
      failed: attempted,
      failures: [
        {
          recipientEmail: recipientBatch[0]?.email || "",
          subject: emailSequence[0]?.subject || "",
          error:
            error instanceof Error
              ? `SMTP connection verification failed: ${error.message}`
              : "SMTP connection verification failed",
        },
      ],
      reason: "Unable to connect to SMTP server with current credentials/settings.",
    };
  }

  const failures: CampaignSendFailure[] = [];
  let sent = 0;
  const total = recipientBatch.length * emailSequence.length;
  const progressUpdateInterval = Math.max(5, Math.ceil(total / 20)); // Update every ~5% or every 5 emails

  for (let i = 0; i < recipientBatch.length; i++) {
    const recipient = recipientBatch[i];
    for (let j = 0; j < emailSequence.length; j++) {
      const template = emailSequence[j];
      const subject = personalizeBody(template.subject, recipient);
      let bodyText = personalizeBody(template.body, recipient);
      
      // Wrap links for tracking
      bodyText = wrapLinksWithTracking(bodyText, args.campaignId);

      const trackingBase = process.env.TRACKING_BASE_URL || "http://localhost:4000/api/track";
      const openPixelUrl = `${trackingBase}/open?c=${args.campaignId}`;
      const attributionId = `smart-outreach-cid-${args.campaignId}`;
      const bodyHtml = bodyText.replace(/\n/g, "<br/>") + 
        `<img src="${openPixelUrl}" width="1" height="1" style="display:none;" />` +
        `<div style="display:none; white-space:nowrap; font-size:1px; color:transparent; opacity:0;">attribution-id:${attributionId}</div>`;


      try {
        await transporter.sendMail({
          from: smtp.from,
          to: recipient.email,
          subject,
          html: bodyHtml,
          headers: {
            "X-Campaign-Name": args.campaignName,
            "X-Campaign-Sequence-Id": template.id || "",
          },
        });


        sent += 1;

        // Report progress every N emails
        if (args.onProgress && (sent % progressUpdateInterval === 0 || sent === total)) {
          await args.onProgress({
            sent,
            failed: failures.length,
            total,
            percentComplete: Math.round((sent / total) * 100),
          });
        }
      } catch (error) {
        failures.push({
          recipientEmail: recipient.email,
          subject,
          error: error instanceof Error ? error.message : "Unknown send error",
        });

        // Report progress on failures too
        if (args.onProgress && (failures.length % progressUpdateInterval === 0)) {
          await args.onProgress({
            sent,
            failed: failures.length,
            total,
            percentComplete: Math.round((sent / total) * 100),
          });
        }
      }
    }
  }

  return {
    skipped: false,
    attempted,
    sent,
    failed: failures.length,
    failures,
    reason:
      recipients.length > maxRecipients
        ? `Recipient list trimmed to ${maxRecipients} based on CAMPAIGN_MAX_RECIPIENTS_PER_SEND.`
        : undefined,
  };
}
