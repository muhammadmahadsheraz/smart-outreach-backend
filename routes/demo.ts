import { Router } from "express";
import jwt from "jsonwebtoken";
import { InboxMessage } from "../models/InboxMessage";
import { syncGmailInbox } from "../lib/emailSync";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Middleware to verify JWT token
const verifyToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
};

// Create demo data
router.get("/demo-data", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    // Delete old demo data
    await InboxMessage.deleteMany({ userId, tag: { $in: ["lead", "meeting_booked", "possible"] } });

    // Create sample messages
    const demoMessages = [
      {
        userId,
        senderName: "John Smith",
        senderEmail: "john.smith@example.com",
        subject: "Re: Demo product interest",
        body: "Thanks for reaching out! I'm very interested in learning more about your product. Can we schedule a call this week?",
        preview: "Thanks for reaching out! I'm very interested in learning more...",
        receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        isRead: false,
        tag: "lead",
        gmailMessageId: "demo-1",
      },
      {
        userId,
        senderName: "Sarah Johnson",
        senderEmail: "sarah.j@company.com",
        subject: "Meeting confirmed - Thursday 2pm",
        body: "Perfect! Thursday at 2pm works great for us. I'll send over the Zoom link tomorrow morning. Looking forward to it!",
        preview: "Perfect! Thursday at 2pm works great for us...",
        receivedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        isRead: false,
        tag: "meeting_booked",
        gmailMessageId: "demo-2",
      },
      {
        userId,
        senderName: "Mike Chen",
        senderEmail: "m.chen@startup.io",
        subject: "Interested in partnership",
        body: "Hi there, we might be a good fit for what you're offering. Would love to explore potential synergies.",
        preview: "Hi there, we might be a good fit for what you're...",
        receivedAt: new Date(Date.now() - 30 * 60 * 1000),
        isRead: true,
        tag: "possible",
        gmailMessageId: "demo-3",
      },
    ];

    await InboxMessage.insertMany(demoMessages);

    res.json({
      ok: true,
      message: "Demo data created",
      count: demoMessages.length,
    });
  } catch (error: any) {
    console.error("❌ [demo-data]", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Sync mail from Gmail
router.get("/sync-mail", verifyToken, async (req: any, res) => {
  try {
    const gmailUser = process.env.GMAIL_USER || "mahad7132@gmail.com";
    const gmailPassword = process.env.GMAIL_PASSWORD || "fqvi zrzy vqpj kzoi";

    const config = {
      user: gmailUser,
      password: gmailPassword,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
    };

    const result = await syncGmailInbox("shared", config);

    res.json({
      ok: true,
      message: "Mail sync completed",
      synced: result.synced,
    });
  } catch (error: any) {
    console.error("❌ [sync-mail]", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
