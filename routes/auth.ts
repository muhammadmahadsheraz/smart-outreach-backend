import { Router } from "express";
import { sign, verify } from "jsonwebtoken";
import { verifyUser, createUser, updateUser, findUserById, saveCompanyData, getCompanyData, saveClientData, getClientData, saveProductData, getProductData } from "../lib/userStore";
import { Settings } from "../models/Subscription";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const SPECIAL_CHARACTER_PATTERN = /[^A-Za-z0-9]/;

const isValidPassword = (password: string) =>
    password.length >= 8 && SPECIAL_CHARACTER_PATTERN.test(password);

const verifyToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        res.status(401).json({ ok: false, error: "Missing token" });
        return;
    }

    try {
        const decoded = verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ ok: false, error: "Invalid token" });
    }
};

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ ok: false, error: "Missing email or password" });
            return;
        }

        const user = await verifyUser(email, password);
        if (!user) {
            res.status(401).json({ ok: false, error: "Invalid email or password" });
            return;
        }

        const token = sign(
            { 
                userId: user._id.toString(),
                email: user.email, 
                firstName: user.firstName,
                lastName: user.lastName 
            },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({
            ok: true,
            token,
            user: { 
                userId: user._id.toString(),
                email: user.email, 
                firstName: user.firstName,
                lastName: user.lastName,
                company: user.company 
            },
        });
    } catch (error) {
        console.error("Login error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.post("/signup", async (req, res) => {
    try {
        const { firstName, lastName, email, company, password } = req.body;

        if (!email || !password || !firstName || !lastName || !company) {
            res.status(400).json({ ok: false, error: "Missing required fields" });
            return;
        }

        if (!isValidPassword(password)) {
            res.status(400).json({
                ok: false,
                error: "Password must be at least 8 characters and contain a special character",
            });
            return;
        }

        const user = await createUser({ 
            firstName,
            lastName,
            email, 
            company, 
            password 
        });

        await Settings.create({
            userId: user._id.toString(),
            personalInfo: {
                firstName,
                lastName,
                email,
            },
            billingDetails: {
                companyName: company,
            },
            subscription: {
                plan: "free",
                status: "inactive",
                amount: 0,
                currency: "USD",
            },
        });

        const token = sign(
            { 
                userId: user._id.toString(),
                email: user.email, 
                firstName: user.firstName,
                lastName: user.lastName 
            },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({ 
            ok: true, 
            token,
            user: { 
                userId: user._id.toString(),
                email: user.email, 
                firstName: user.firstName,
                lastName: user.lastName,
                company: user.company 
            } 
        });
    } catch (error: any) {
        console.error("Signup error", error);
        if (error.message === "User already exists") {
            res.status(400).json({ ok: false, error: "User already exists" });
            return;
        }
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.post("/company", verifyToken, async (req: any, res) => {
    try {
        const { companyName, website, description, brochureUrl } = req.body;
        const userId = req.user.userId;

        console.log("🔵 [company POST] userId:", userId);
        console.log("🔵 [company POST] data:", { companyName, website, description });

        if (!companyName || !website || !description) {
            res.status(400).json({ ok: false, error: "Missing required fields" });
            return;
        }

        const companyData = await saveCompanyData(userId, {
            companyName,
            website,
            description,
            brochureUrl,
        });

        console.log("✅ [company POST] saved:", companyData);
        res.json({ ok: true, data: companyData });
    } catch (error) {
        console.error("Company save error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.get("/company", verifyToken, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        console.log("🔵 [company GET] userId:", userId);

        const companyData = await getCompanyData(userId);
        console.log("✅ [company GET] result:", companyData);

        res.json({ ok: true, data: companyData });
    } catch (error) {
        console.error("Company fetch error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.post("/client", verifyToken, async (req: any, res) => {
    try {
        const { niches, location, decisionMakers, targetCompanies } = req.body;
        const userId = req.user.userId;

        console.log("🔵 [client POST] userId:", userId);
        console.log("🔵 [client POST] data:", { niches, location, decisionMakers, targetCompanies });

        if (!niches || !location) {
            res.status(400).json({ ok: false, error: "Missing required fields" });
            return;
        }

        const clientData = await saveClientData(userId, {
            niches: Array.isArray(niches) ? niches : [niches],
            location,
            decisionMakers: Array.isArray(decisionMakers) ? decisionMakers : [decisionMakers],
            targetCompanies: Array.isArray(targetCompanies) ? targetCompanies : [targetCompanies],
        });

        console.log("✅ [client POST] saved:", clientData);
        res.json({ ok: true, data: clientData });
    } catch (error) {
        console.error("Client save error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.get("/client", verifyToken, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        console.log("🔵 [client GET] userId:", userId);

        const clientData = await getClientData(userId);
        console.log("✅ [client GET] result:", clientData);

        res.json({ ok: true, data: clientData });
    } catch (error) {
        console.error("Client fetch error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.post("/product", verifyToken, async (req: any, res) => {
    try {
        const { product, edge, successStories } = req.body;
        const userId = req.user.userId;

        console.log("🔵 [product POST] userId:", userId);
        console.log("🔵 [product POST] data:", { product, edge, successStories });

        if (!product || !edge || !successStories) {
            res.status(400).json({ ok: false, error: "Missing required fields" });
            return;
        }

        const productData = await saveProductData(userId, {
            product,
            edge,
            successStories,
        });

        console.log("✅ [product POST] saved:", productData);
        res.json({ ok: true, data: productData });
    } catch (error) {
        console.error("Product save error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.get("/product", verifyToken, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        console.log("🔵 [product GET] userId:", userId);

        const productData = await getProductData(userId);
        console.log("✅ [product GET] result:", productData);

        res.json({ ok: true, data: productData });
    } catch (error) {
        console.error("Product fetch error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.get("/settings", verifyToken, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        const settings = await Settings.findOne({ userId });

        if (!settings) {
            res.status(404).json({ ok: false, error: "Settings not found" });
            return;
        }

        res.json({ ok: true, data: settings });
    } catch (error) {
        console.error("Settings fetch error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.post("/settings/personal-info", verifyToken, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        const { firstName, lastName, email, oldPassword, newPassword } = req.body;

        const settings = await Settings.findOne({ userId });
        if (!settings) {
            res.status(404).json({ ok: false, error: "Settings not found" });
            return;
        }

        if (newPassword && newPassword.trim() !== "") {
            if (!oldPassword || oldPassword.trim() === "") {
                res.status(400).json({ ok: false, error: "Old password is required to set a new password" });
                return;
            }

            // Password changes require the current password, even when profile fields update too.
            const currentEmail = email || settings.personalInfo.email;
            const user = await verifyUser(currentEmail, oldPassword);
            if (!user) {
                res.status(401).json({ ok: false, error: "Old password is incorrect" });
                return;
            }

            await updateUser(userId, { password: newPassword });
        }

        const userUpdates: { firstName?: string; lastName?: string; email?: string } = {};
        if (firstName && firstName.trim()) {
            settings.personalInfo.firstName = firstName;
            userUpdates.firstName = firstName;
        }
        if (lastName && lastName.trim()) {
            settings.personalInfo.lastName = lastName;
            userUpdates.lastName = lastName;
        }
        if (email && email.trim()) {
            settings.personalInfo.email = email;
            userUpdates.email = email;
        }

        await settings.save();

        // Profile data is mirrored to User for auth/session responses and Settings for the UI.
        if (Object.keys(userUpdates).length > 0) {
            await updateUser(userId, userUpdates);
        }

        res.json({ ok: true, data: settings });
    } catch (error) {
        console.error("Settings personal info update error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

router.post("/settings/billing", verifyToken, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        const { companyName, address, city, zipCode, country, companyNumber } = req.body;

        const settings = await Settings.findOne({ userId });
        if (!settings) {
            res.status(404).json({ ok: false, error: "Settings not found" });
            return;
        }

        if (companyName !== undefined) settings.billingDetails.companyName = companyName;
        if (address !== undefined) settings.billingDetails.address = address;
        if (city !== undefined) settings.billingDetails.city = city;
        if (zipCode !== undefined) settings.billingDetails.zipCode = zipCode;
        if (country !== undefined) settings.billingDetails.country = country;
        if (companyNumber !== undefined) settings.billingDetails.companyNumber = companyNumber;

        await settings.save();

        if (companyName && companyName.trim()) {
            await updateUser(userId, { company: companyName });
        }

        res.json({ ok: true, data: settings });
    } catch (error) {
        console.error("Settings billing update error", error);
        res.status(500).json({ ok: false, error: "Internal server error" });
    }
});

export default router;
