/**
 * Real Prospect Contact Database
 * Huge array of realistic business contacts organized by industry
 */

interface SearchCriteria {
  country?: string;
  jobTitles?: string[];
  industry?: string;
  keywords?: string;
  employees?: string;
}

interface Prospect {
  id: number;
  company: string;
  url: string;
  name: string;
  email: string;
  role: string;
  industry?: string;
  country?: string;
  employees?: string;
  keywords?: string[];
}

// Comprehensive prospect database
export const PROSPECTS_DATABASE: Prospect[] = [
  // Technology - 7 prospects
  {
    id: 1,
    company: "Conespiracy",
    url: "conespiracy.com",
    name: "Ali",
    email: "conespiracynut@gmail.com",
    role: "CEO",
    industry: "Technology",
    country: "United States",
    employees: "201–500",
    keywords: ["payments", "fintech", "SaaS"],
  }, {
    id: 2,
    company: "The Factsavant",
    url: "thefactsavant.com",
    name: "Collison",
    email: "thefactsavant@gmail.com",
    role: "CEO",
    industry: "Technology",
    country: "United States",
    employees: "201–500",
    keywords: ["payments", "fintech", "SaaS"],
  }, {
    id: 3,
    company: "Pleb Stories",
    url: "plebstories.com",
    name: "Pleb Stories",
    email: "plebstories@gmail.com",
    role: "CEO",
    industry: "Technology",
    country: "United States",
    employees: "201–500",
    keywords: ["payments", "fintech", "SaaS"],
  }, {
    id: 4,
    company: "Rize",
    url: "rize.com",
    name: "Mahad Collison",
    email: "thesheraztoosy@gmail.com",
    role: "CEO",
    industry: "Technology",
    country: "United States",
    employees: "201–500",
    keywords: ["payments", "fintech", "SaaS"],
  }, {
    id: 5,
    company: "denjify",
    url: "denjify.com",
    name: "denji",
    email: "mahad7132@gmail.com",
    role: "CEO",
    industry: "Technology",
    country: "United States",
    employees: "201–500",
    keywords: ["payments", "fintech", "SaaS"],
  }, {
    id: 6,
    company: "gabimaru",
    url: "gabimaru.com",
    name: "gabimaru",
    email: "mahadtoosey@gmail.com",
    role: "CEO",
    industry: "Technology",
    country: "United States",
    employees: "201–500",
    keywords: ["payments", "fintech", "SaaS"],
  }, {
    id: 7,
    company: "shivocare",
    url: "shivocare.com",
    name: "sheraz",
    email: "dr.sheraz00@gmail.com",
    role: "CEO",
    industry: "Technology",
    country: "United States",
    employees: "201–500",
    keywords: ["payments", "fintech", "SaaS"],
  },



];

export async function searchProspectsDatabase(
  criteria: SearchCriteria
): Promise<Prospect[]> {
  try {
    console.log("Searching prospects database with criteria:", criteria);

    let results = [...PROSPECTS_DATABASE];

    // Filter by country
    if (criteria.country && criteria.country.trim()) {
      const countryLower = criteria.country.toLowerCase();
      results = results.filter((p) =>
        p.country?.toLowerCase().includes(countryLower)
      );
    }

    // Filter by job titles
    if (criteria.jobTitles && criteria.jobTitles.length > 0) {
      results = results.filter((p) =>
        criteria.jobTitles!.some((title) =>
          p.role.toLowerCase().includes(title.toLowerCase())
        )
      );
    }

    // Filter by industry
    if (criteria.industry && criteria.industry.trim()) {
      const industryLower = criteria.industry.toLowerCase();
      results = results.filter((p) =>
        p.industry?.toLowerCase().includes(industryLower)
      );
    }

    // Filter by keywords
    if (criteria.keywords && criteria.keywords.trim()) {
      const keywordArray = criteria.keywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k);
      results = results.filter((p) =>
        keywordArray.some(
          (kw) =>
            p.keywords?.some((pk) => pk.toLowerCase().includes(kw)) ||
            p.company.toLowerCase().includes(kw)
        )
      );
    }

    // Filter by employees
    if (criteria.employees && criteria.employees.trim()) {
      results = results.filter((p) => p.employees === criteria.employees);
    }

    console.log(`Found ${results.length} prospects matching criteria`);
    return results; // Return all matching results (pagination handled on frontend)
  } catch (error) {
    console.error("Error searching prospects:", error);
    throw error;
  }
}
