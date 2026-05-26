import { Router } from "express";
import jwt from "jsonwebtoken";
import { InboxMessage } from "../models/InboxMessage";
import mongoose from "mongoose";
import { getSmtpConfig, getTransporter } from "../lib/smtp";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

const verifyToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    console.log("🔴 [verifyToken] No token");
    return res.status(401).json({ ok: false, error: "Missing token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    console.log("🔴 [verifyToken] Token verification failed");
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
};

router.get("/", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const messages = await InboxMessage.find({ userId }).sort({ receivedAt: -1 }).lean();

    // The UI expects thread summaries, while storage keeps individual inbound messages.
    const threadsMap = new Map<string, any[]>();
    
    for (const msg of messages) {
      const threadKey = msg.threadId || msg._id.toString();
      if (!threadsMap.has(threadKey)) {
        threadsMap.set(threadKey, []);
      }
      threadsMap.get(threadKey)!.push(msg);
    }

    const threads = Array.from(threadsMap.values()).map(threadMessages => {
      threadMessages.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
      
      const latestMessage = threadMessages[threadMessages.length - 1];
      
      return {
        id: latestMessage.threadId || latestMessage._id.toString(),
        threadId: latestMessage.threadId || latestMessage._id.toString(),
        senderName: latestMessage.senderName || "Unknown",
        senderEmail: latestMessage.senderEmail,
        subject: latestMessage.subject,
        preview: latestMessage.preview || latestMessage.body.substring(0, 100),
        date: new Date(latestMessage.receivedAt).toLocaleDateString(),
        tag: latestMessage.tag,
        isRead: threadMessages.every(m => m.isRead),
        messageCount: threadMessages.length,
        messages: threadMessages.map((m: any) => ({
          id: m._id.toString(),
          senderName: m.senderName || "Unknown",
          senderEmail: m.senderEmail,
          subject: m.subject,
          body: m.body,
          receivedAt: m.receivedAt,
          isRead: m.isRead,
          tag: m.tag,
        })),
        body: latestMessage.body,
        from: latestMessage.senderEmail,
        to: userId,
        timestamp: latestMessage.receivedAt?.toISOString(),
      };
    });

    threads.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      ok: true,
      messages: threads,
    });
  } catch (error: any) {
    console.error("🔴 Error fetching inbox:", error.message);
    res.status(500).json({ ok: false, error: "Failed to fetch inbox" });
  }
});

router.get("/:id", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const messageId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ ok: false, error: "Invalid message ID" });
    }

    const message = await InboxMessage.findOne({
      _id: messageId,
      userId,
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: "Message not found" });
    }

    res.json({ ok: true, message });
  } catch (error) {
    console.error("Error fetching message:", error);
    res.status(500).json({ ok: false, error: "Failed to fetch message" });
  }
});

router.patch("/:id/read", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const messageId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ ok: false, error: "Invalid message ID" });
    }

    const message = await InboxMessage.findOneAndUpdate(
      { _id: messageId, userId },
      { isRead: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ ok: false, error: "Message not found" });
    }

    res.json({ ok: true, message });
  } catch (error) {
    console.error("Error updating message:", error);
    res.status(500).json({ ok: false, error: "Failed to update message" });
  }
});

router.patch("/:id/tag", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const messageId = req.params.id;
    const { tag } = req.body;

    if (!["lead", "meeting_booked", "possible", "not_interested", "wrong_person"].includes(tag)) {
      return res.status(400).json({ ok: false, error: "Invalid tag" });
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ ok: false, error: "Invalid message ID" });
    }

    const message = await InboxMessage.findOneAndUpdate(
      { _id: messageId, userId },
      { tag },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ ok: false, error: "Message not found" });
    }

    res.json({ ok: true, message });
  } catch (error) {
    console.error("Error tagging message:", error);
    res.status(500).json({ ok: false, error: "Failed to tag message" });
  }
});

router.post("/:id/reply", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const messageId = req.params.id;
    const { body } = req.body;

    if (!body || body.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Reply body is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ ok: false, error: "Invalid message ID" });
    }

    const originalMessage = await InboxMessage.findOne({ _id: messageId, userId });

    if (!originalMessage) {
      return res.status(404).json({ ok: false, error: "Original message not found" });
    }

    const smtpConfig = getSmtpConfig();
    const transporter = await getTransporter();

    if (!smtpConfig || !transporter) {
      return res.status(500).json({ ok: false, error: "SMTP is not configured" });
    }

    const mailOptions = {
      from: smtpConfig.from,
      to: originalMessage.senderEmail,
      subject: originalMessage.subject.toLowerCase().startsWith("re:") 
        ? originalMessage.subject 
        : `Re: ${originalMessage.subject}`,
      text: body,
      headers: {
        // Preserve email-client threading when the original Gmail message id is available.
        "In-Reply-To": originalMessage.gmailMessageId || "",
        "References": originalMessage.gmailMessageId || "",
      },
    };

    await transporter.sendMail(mailOptions);
    
    res.json({ ok: true, message: "Reply sent successfully" });
  } catch (error: any) {
    console.error("Error sending reply:", error.message);
    res.status(500).json({ ok: false, error: error.message || "Failed to send reply" });
  }
});

export default router;
