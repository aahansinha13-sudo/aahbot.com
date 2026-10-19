require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const https = require("https");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "users.json");
const PASSES_FILE = path.join(__dirname, "premium_passes.json");

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(PASSES_FILE)) {
    const defaultPasses = [
        { code: "AAHBOT-PREMIUM-2026", used: false, usedBy: null },
        { code: "VIP-ACCESS-001", used: false, usedBy: null },
        { code: "PREMIUM-PASS-XYZ", used: false, usedBy: null }
    ];
    fs.writeFileSync(PASSES_FILE, JSON.stringify(defaultPasses, null, 2));
}

function readUsers() {
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    return JSON.parse(data);
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function readPasses() {
    const data = fs.readFileSync(PASSES_FILE, "utf-8");
    return JSON.parse(data);
}

function writePasses(passes) {
    fs.writeFileSync(PASSES_FILE, JSON.stringify(passes, null, 2));
}

app.use(cors());
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "aahbot-secret-key-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax"
    }
}));

function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    const username = req.body?.username || req.headers["x-username"];
    if (username) {
        const users = readUsers();
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (user) {
            req.session = req.session || {};
            req.session.user = { username: user.username, premium: user.premium || false };
            return next();
        }
    }
    if (req.accepts("html")) {
        return res.redirect("/login.html");
    }
    return res.status(401).json({ error: "Not authenticated" });
}

app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

    const users = readUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({ error: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword, premium: false, createdAt: new Date().toISOString() });
    writeUsers(users);

    req.session.user = { username, premium: false };
    res.json({ message: "Account created successfully", username, premium: false });
});

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    let isMatch = user.password.startsWith("$2") ? await bcrypt.compare(password, user.password) : (user.password === password);
    if (!isMatch) return res.status(401).json({ error: "Invalid username or password" });

    req.session.user = { username: user.username, premium: user.premium || false };
    res.json({ message: "Login successful", username: user.username, premium: user.premium || false });
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => res.json({ message: "Logged out" }));
});

app.get("/api/auth-check", (req, res) => {
    if (req.session.user) {
        const users = readUsers();
        const user = users.find(u => u.username.toLowerCase() === req.session.user.username.toLowerCase());
        const premium = user ? (user.premium || false) : false;
        req.session.user.premium = premium;
        res.json({ loggedIn: true, username: req.session.user.username, premium });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post("/api/activate-premium", requireAuth, (req, res) => {
    const { passCode } = req.body;
    if (!passCode) return res.status(400).json({ error: "Pass code is required" });

    const passes = readPasses();
    const pass = passes.find(p => p.code === passCode.trim());

    if (!pass) return res.status(404).json({ error: "Invalid premium pass code" });
    if (pass.used) return res.status(409).json({ error: "This pass code has already been used" });

    pass.used = true;
    pass.usedBy = req.session.user.username;
    pass.usedAt = new Date().toISOString();
    writePasses(passes);

    const users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === req.session.user.username.toLowerCase());
    if (user) {
        user.premium = true;
        writeUsers(users);
    }

    req.session.user.premium = true;
    res.json({ message: "Premium activated!", premium: true });
});

app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/logo.png", (req, res) => res.sendFile(path.join(__dirname, "logo.png")));
app.get("/", requireAuth, (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html", requireAuth, (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/payment.html", requireAuth, (req, res) => res.sendFile(path.join(__dirname, "payment.html")));

app.use(express.static(path.join(__dirname)));

const BACKEND_GEMINI_KEY = process.env.GEMINI_API_KEY;

async function callGoogleGemini(prompt, preferredModel) {
    const modelsToTry = [preferredModel, "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];
    let lastError = null;

    for (const model of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${BACKEND_GEMINI_KEY}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                return data;
            }
            if (data.error && (data.error.code === 404 || data.error.status === "NOT_FOUND")) {
                lastError = data.error;
                continue;
            }
            return data;
        } catch (e) {
            lastError = e;
        }
    }
    return { error: { message: lastError ? lastError.message : "Failed to reach Gemini API" } };
}

app.post("/api/gemini", requireAuth, async (req, res) => {
    const { prompt, model } = req.body;
    if (!prompt) return res.status(400).json({ error: { message: "Prompt is required" } });
    if (!BACKEND_GEMINI_KEY) {
        return res.status(503).json({ error: { message: "Gemini API is not configured on the server" } });
    }

    const selectedModel = model || "gemini-1.5-flash";
    const isThinkingModel = selectedModel.includes("lite") || selectedModel.includes("thinking") || selectedModel.includes("pro");

    const username = req.session?.user?.username || req.body.username || req.headers["x-username"];
    const users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username?.toLowerCase());
    const isPremium = user ? (user.premium || false) : (req.session?.user?.premium || false);

    if (isThinkingModel && !isPremium) {
        return res.status(403).json({ 
            error: { message: "🔒 The thinking model is exclusively available for premium pass holders. Please redeem a premium pass on the payment page!" } 
        });
    }

    try {
        const data = await callGoogleGemini(prompt, selectedModel);
        res.json(data);
    } catch (error) {
        console.error("Gemini API error:", error);
        res.status(500).json({ error: { message: "Failed to reach Gemini API" } });
    }
});

app.listen(PORT, () => {
    console.log(`✨ Aahbot server running at http://localhost:${PORT}`);
});