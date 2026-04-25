import Imap from "imap";
import { simpleParser } from "mailparser";
import { InboxMessage } from "../models/InboxMessage";

interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export async function syncGmailInbox(
  userId: string,
  config: ImapConfig
): Promise<{ synced: number; error?: string }> {
  return new Promise((resolve, reject) => {
    const imap = new Imap(config);
    let syncedCount = 0;
    let processedMessages = 0;

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err: any, box: any) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        // Search for recent/unseen emails (last 20)
        imap.search(["UNSEEN"], (err: any, results: number[]) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          if (results.length === 0) {
            imap.end();
            resolve({ synced: 0 });
            return;
          }

          // Limit to last 20 recent emails
          const toFetch = results.slice(-20);
          const f = imap.fetch(toFetch, { bodies: "" });

          f.on("message", (msg: any, seqno: number) => {
            simpleParser(msg, async (err: any, parsed: any) => {
              try {
                if (err) {
                  console.error("Error parsing email:", err);
                  processedMessages++;
                  return;
                }

                const gmailMessageId = parsed.messageId || `msg-${Date.now()}-${seqno}`;

                // Check if message already exists
                const existing = await InboxMessage.findOne({ gmailMessageId, userId });
                if (existing) {
                  console.log(`Message already synced: ${parsed.subject}`);
                  processedMessages++;
                  return;
                }

                // Determine tag based on subject/content
                let tag: "lead" | "meeting_booked" | "possible" | undefined;
                const subject = (parsed.subject || "").toLowerCase();
                const text = (parsed.text || "").toLowerCase();

                if (subject.includes("meeting") || subject.includes("schedule") || text.includes("confirmed")) {
                  tag = "meeting_booked";
                } else if (subject.includes("interested") || text.includes("interested")) {
                  tag = "lead";
                } else {
                  tag = "possible";
                }

                // Extract sender info
                const senderEmail = parsed.from?.email || "unknown@example.com";
                const senderName = parsed.from?.name || parsed.from?.email?.split("@")[0] || "Unknown";

                // Create inbox message
                const message = new InboxMessage({
                  userId,
                  senderName,
                  senderEmail,
                  subject: parsed.subject || "(no subject)",
                  body: parsed.text || parsed.html || "",
                  preview: (parsed.text || parsed.html || "").substring(0, 150),
                  receivedAt: parsed.date || new Date(),
                  isRead: false,
                  tag,
                  gmailMessageId,
                });

                await message.save();
                syncedCount++;
                console.log(`✓ Synced: ${parsed.subject}`);
              } catch (error: any) {
                console.error("Error processing message:", error.message);
              }

              processedMessages++;
              if (processedMessages === toFetch.length) {
                imap.end();
              }
            });
          });

          f.on("error", (err: any) => {
            imap.end();
            reject(err);
          });

          f.on("end", () => {
            // Wait for all messages to process
          });
        });
      });
    });

    imap.on("error", (err: any) => {
      reject(err);
    });

    imap.on("end", () => {
      resolve({ synced: syncedCount });
    });

    imap.connect();
  });
}
