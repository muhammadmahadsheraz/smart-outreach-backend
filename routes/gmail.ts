import { Router } from "express";
import jwt from "jsonwebtoken";
import { getAuthUrl, handleOAuthCallback, getGmailStatus, disconnectGmail, syncGmailMessages } from "../lib/gmailApi";

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

// Get OAuth2 consent URL
router.get("/auth-url", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const url = getAuthUrl(userId);
    console.log("🔵 [gmail] Auth URL generated for user:", userId);
    res.json({ ok: true, url });
  } catch (error: any) {
    console.error("🔴 [gmail] Auth URL error:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// OAuth2 callback — receives the authorization code from Google
router.get("/callback", async (req: any, res) => {
  try {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      return res.status(400).json({ ok: false, error: "Missing code or state" });
    }

    console.log("🔵 [gmail] OAuth callback for user:", userId);
    const result = await handleOAuthCallback(code as string, userId as string);
    console.log("✅ [gmail] Connected Gmail:", result.gmailEmail);

    // Redirect back to the inbox page with success
    res.redirect("/inbox?gmail=connected");
  } catch (error: any) {
    console.error("🔴 [gmail] Callback error:", error.message);
    res.redirect("/inbox?gmail=error&message=" + encodeURIComponent(error.message));
  }
});

// Get Gmail connection status
router.get("/status", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const status = await getGmailStatus(userId);
    res.json({ ok: true, ...status });
  } catch (error: any) {
    console.error("🔴 [gmail] Status error:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Sync emails from Gmail
router.get("/sync", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    console.log("🔵 [gmail] Syncing emails for user:", userId);

    const result = await syncGmailMessages(userId);

    if (result.error) {
      console.log("🔴 [gmail] Sync error:", result.error);
      return res.status(400).json({ ok: false, error: result.error });
    }

    console.log("✅ [gmail] Synced", result.synced, "messages");
    res.json({ ok: true, synced: result.synced });
  } catch (error: any) {
    console.error("🔴 [gmail] Sync error:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Disconnect Gmail
router.delete("/disconnect", verifyToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    await disconnectGmail(userId);
    console.log("✅ [gmail] Disconnected for user:", userId);
    res.json({ ok: true, message: "Gmail disconnected" });
  } catch (error: any) {
    console.error("🔴 [gmail] Disconnect error:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
