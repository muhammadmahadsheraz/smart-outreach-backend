import express from "express";
import cors from "cors";
import path from "path";
import bodyParser from "body-parser";
import mongoose from "mongoose";

try {
  require("dotenv").config();
} catch (e) {
  console.warn("dotenv not installed, using environment variables from system");
}

import authRoutes from "./routes/auth";
import prospectsRoutes from "./routes/prospects";
import prospectUploadRoutes from "./routes/prospectUpload";
import campaignsRoutes from "./routes/campaigns";
import inboxRoutes from "./routes/inbox";
import demoRoutes from "./routes/demo";
import gmailRoutes from "./routes/gmail";
import trackingRoutes from "./routes/tracking";

const app = express();
const PORT = process.env.PORT || 4000;

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smart-outreach";

console.log("MongoDB URI:", MONGODB_URI.substring(0, 50) + "...");

app.use(cors());
app.use(bodyParser.json());


app.use("/api", authRoutes);
app.use("/api/prospects", prospectsRoutes);
app.use("/api/prospects", prospectUploadRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/inbox", inboxRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/api/track", trackingRoutes);

app.get("/", (req, res) => {
    res.send("Backend is running");
});

mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log("✓ Connected to MongoDB successfully");
    app.listen(PORT, () => {
      console.log(`✓ Backend server is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("✗ MongoDB connection error:", error.message);
    process.exit(1);
  });
