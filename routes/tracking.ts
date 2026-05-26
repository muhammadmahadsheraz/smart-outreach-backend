import express from "express";
import Campaign from "../models/Campaign";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { r, c } = req.query;

    if (!r) {
      return res.status(400).send("Missing redirect URL");
    }

    const redirectUrl = decodeURIComponent(r as string);
    const campaignId = c as string;

    if (campaignId) {
      try {
        await Campaign.findByIdAndUpdate(campaignId, {
          $inc: { clicks: 1 }
        });
        console.log(`✅ Click logged for campaign ${campaignId}`);
      } catch (err) {
        console.error("❌ Error logging click:", err);
      }
    }

    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Tracking error:", error);
    res.status(500).send("Internal server error");
  }
});

router.get("/open", async (req, res) => {
  try {
    const { c } = req.query;
    const campaignId = c as string;

    if (campaignId) {
      try {
        await Campaign.findByIdAndUpdate(campaignId, {
          $inc: { opened: 1 }
        });
        console.log(`👁️ Open logged for campaign ${campaignId}`);
      } catch (err) {
        console.error("❌ Error logging open:", err);
      }
    }

    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64"
    );

    // Return a transparent pixel so email clients can load it without visible content.
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": pixel.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(pixel);
  } catch (error) {
    console.error("Open tracking error:", error);
    res.status(500).send("Internal server error");
  }
});

export default router;
