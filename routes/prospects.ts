import express, { Request, Response } from "express";
import { searchProspectsDatabase } from "../lib/prospectDatabase";

const router = express.Router();

interface SearchQuery {
  country?: string;
  jobTitles?: string[];
  industry?: string;
  keywords?: string;
  employees?: string;
}

router.post("/search", async (req: Request, res: Response) => {
  try {
    const body: SearchQuery = req.body;
    const { country, jobTitles, industry, keywords, employees } = body;

    // Search the prospect database
    const prospects = await searchProspectsDatabase({
      country: country || undefined,
      jobTitles: jobTitles || undefined,
      industry: industry || undefined,
      keywords: keywords || undefined,
      employees: employees || undefined,
    });

    return res.json({
      success: true,
      count: prospects.length,
      prospects: prospects,
    });
  } catch (error) {
    console.error("Prospect search error:", error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to search prospects",
    });
  }
});

export default router;
