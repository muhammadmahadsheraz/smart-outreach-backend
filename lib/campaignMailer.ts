import { sendViaGmail } from "./gmailApi";

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
}) => Promise<void>;

interface SendCampaignSequenceArgs {
  campaignId: string;
  campaignName: string;
  userId: string;
  recipients: CampaignRecipient[];
  emailSequence: CampaignEmailTemplate[];
  onProgress?: ProgressCallback;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function wrapLinksWithTracking(text: string, campaignId: string): string {
  const trackingBase =
    process.env.TRACKING_BASE_URL ||
    "http://localhost:4000/api/track";
  const urlRegex = /(?<!aria-label=")(https?:\/\/[^\s<"']+)/g;
  return text.replace(urlRegex, (url) => {
    if (url.includes("/api/track?")) return url;
    return `${trackingBase}?r=${encodeURIComponent(url)}&c=${campaignId}`;
  });
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeRecipients(recipients: CampaignRecipient[]): CampaignRecipient[] {
  const seen = new Set<string>();
  const normalized: CampaignRecipient[] = [];
  for (const recipient of recipients) {
    const email = recipient.email?.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email) || seen.has(email)) continue;
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

function sanitizeEmailSequence(
  sequence: CampaignEmailTemplate[]
): CampaignEmailTemplate[] {
  return sequence
    .map((template, index) => ({
      id: template.id || String(index + 1),
      subject: String(template.subject ?? "").trim(),
      body: String(template.body ?? "").trim(),
    }))
    .filter((t) => t.subject.length > 0 && t.body.length > 0);
}

function personalizeBody(body: string, recipient: CampaignRecipient): string {
  const firstName = recipient.name?.split(" ")[0] || "there";
  return body
    .replace(/\{\{\s*PROSPECT_NAME\s*\}\}/g, recipient.name || "there")
    .replace(/\{\{\s*COMPANY_NAME\s*\}\}/g, recipient.company || "your company")
    .replace(/\{\{\s*PROSPECT_ROLE\s*\}\}/g, recipient.role || "your role")
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
  console.log(`📧 [Campaign Mailer] Starting send for campaign ${args.campaignId}`);
  console.log(
    `📧 [Campaign Mailer] Recipients: ${args.recipients.length}, Templates: ${args.emailSequence.length}`
  );

  const realSendEnabled = parseBoolean(process.env.ENABLE_REAL_EMAIL_SEND, false);
  console.log(`📧 [Campaign Mailer] ENABLE_REAL_EMAIL_SEND = ${realSendEnabled}`);

  if (!realSendEnabled) {
    console.warn(`⚠️ [Campaign Mailer] Real send is DISABLED`);
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
  const total = attempted;
  const progressUpdateInterval = Math.max(5, Math.ceil(total / 20));

  const failures: CampaignSendFailure[] = [];
  let sent = 0;

  for (let i = 0; i < recipientBatch.length; i++) {
    const recipient = recipientBatch[i];
    for (let j = 0; j < emailSequence.length; j++) {
      const template = emailSequence[j];
      const subject = personalizeBody(template.subject, recipient);
      let bodyText = personalizeBody(template.body, recipient);

      // Tracking links are applied after personalization so generated URLs keep campaign context.
      bodyText = wrapLinksWithTracking(bodyText, args.campaignId);

      const trackingBase =
        process.env.TRACKING_BASE_URL || "http://localhost:4000/api/track";
      const openPixelUrl = `${trackingBase}/open?c=${args.campaignId}`;
      const attributionId = `smart-outreach-cid-${args.campaignId}`;

      // Hidden attribution lets Gmail reply sync connect responses to the exact campaign.
      const bodyHtml =
        bodyText.replace(/\n/g, "<br/>") +
        `<img src="${openPixelUrl}" width="1" height="1" style="display:none;" />` +
        `<div style="display:none; white-space:nowrap; font-size:1px; color:transparent; opacity:0;">attribution-id:${attributionId}</div>`;

      try {
        await sendViaGmail(args.userId, recipient.email, subject, bodyHtml, {
          "X-Campaign-Name": args.campaignName,
          "X-Campaign-Sequence-Id": template.id || "",
        });

        sent += 1;

        if (
          args.onProgress &&
          (sent % progressUpdateInterval === 0 || sent === total)
        ) {
          await args.onProgress({
            sent,
            failed: failures.length,
            total,
            percentComplete: Math.round((sent / total) * 100),
          });
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown send error";
        console.error(
          `❌ [Email Send] Failed to send to ${recipient.email}: ${errorMsg}`
        );
        failures.push({ recipientEmail: recipient.email, subject, error: errorMsg });

        if (args.onProgress && failures.length % progressUpdateInterval === 0) {
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
