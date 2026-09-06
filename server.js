require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const APPLICATIONS_FILE = path.join(DATA_DIR, "applications.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]");
}

if (!fs.existsSync(APPLICATIONS_FILE)) {
    fs.writeFileSync(APPLICATIONS_FILE, "[]");
}

function readJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "magyar-honvedseg-rp-secret-change-this",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

// ==============================
// FELHASZNÁLÓ - REGISZTRÁCIÓ
// ==============================

app.post("/api/register", async (req, res) => {
    try {
        const {
            username,
            robloxName,
            password,
            passwordAgain
        } = req.body;

        if (!username || !robloxName || !password || !passwordAgain) {
            return res.status(400).json({
                success: false,
                message: "Minden mezőt ki kell tölteni!"
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                success: false,
                message: "A felhasználónév legalább 3 karakter legyen!"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "A jelszó legalább 6 karakter legyen!"
            });
        }

        if (password !== passwordAgain) {
            return res.status(400).json({
                success: false,
                message: "A két jelszó nem egyezik!"
            });
        }

        const users = readJSON(USERS_FILE);

        const exists = users.find(
            user =>
                user.username.toLowerCase() === username.toLowerCase()
        );

        if (exists) {
            return res.status(400).json({
                success: false,
                message: "Ez a felhasználónév már foglalt!"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = {
            id: Date.now().toString(),
            username,
            robloxName,
            password: hashedPassword,

            // Automatikus kezdő rendfokozat
            rank: "OR-0",

            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        writeJSON(USERS_FILE, users);

        res.json({
            success: true,
            message: "Sikeres regisztráció!"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Szerverhiba történt."
        });
    }
});

// ==============================
// BEJELENTKEZÉS
// ==============================

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Add meg a felhasználónevet és a jelszót!"
            });
        }

        const users = readJSON(USERS_FILE);

        const user = users.find(
            u => u.username.toLowerCase() === username.toLowerCase()
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Hibás felhasználónév vagy jelszó!"
            });
        }

        const passwordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Hibás felhasználónév vagy jelszó!"
            });
        }

        req.session.userId = user.id;

        res.json({
            success: true,
            message: "Sikeres bejelentkezés!"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Szerverhiba történt."
        });
    }
});

// ==============================
// BEJELENTKEZETT FELHASZNÁLÓ
// ==============================

function requireUser(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Nincs bejelentkezve."
        });
    }

    next();
}

function getCurrentUser(req) {
    const users = readJSON(USERS_FILE);

    return users.find(
        user => user.id === req.session.userId
    );
}

app.get("/api/me", (req, res) => {
    const user = getCurrentUser(req);

    if (!user) {
        return res.json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        user: {
            id: user.id,
            username: user.username,
            robloxName: user.robloxName,
            rank: user.rank,
            createdAt: user.createdAt
        }
    });
});

// ==============================
// KIJELENTKEZÉS
// ==============================

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({
            success: true
        });
    });
});

// ==============================
// JELENTKEZÉS BEKÜLDÉSE
// ==============================

app.post("/api/applications", requireUser, (req, res) => {
    try {
        const user = getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Felhasználó nem található."
            });
        }

        const applications = readJSON(APPLICATIONS_FILE);

        const alreadyApplied = applications.find(
            application =>
                application.userId === user.id &&
                application.status === "Feldolgozás alatt"
        );

        if (alreadyApplied) {
            return res.status(400).json({
                success: false,
                message: "Már van feldolgozás alatt lévő jelentkezésed."
            });
        }

        const application = {
            id: Date.now().toString(),

            userId: user.id,
            username: user.username,
            robloxName: user.robloxName,
            rank: user.rank,

            age: req.body.age || "",
            motivation: req.body.motivation || "",
            experience: req.body.experience || "",
            rules: req.body.rules || "",
            chainOfCommand: req.body.chainOfCommand || "",
            teamwork: req.body.teamwork || "",
            roleplay: req.body.roleplay || "",
            activity: req.body.activity || "",
            conflict: req.body.conflict || "",

            status: "Feldolgozás alatt",

            createdAt: new Date().toISOString()
        };

        applications.push(application);

        writeJSON(APPLICATIONS_FILE, applications);

        res.json({
            success: true,
            message: "A jelentkezés sikeresen elküldve!"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Nem sikerült elküldni a jelentkezést."
        });
    }
});

// ==============================
// VEZETŐSÉGI BELÉPÉS
// ==============================

function requireAdmin(req, res, next) {
    if (
        !req.session.admin ||
        req.session.admin !== true
    ) {
        return res.status(401).json({
            success: false,
            message: "Nincs vezetőségi jogosultságod."
        });
    }

    next();
}

app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD
    ) {
        req.session.admin = true;

        return res.json({
            success: true
        });
    }

    res.status(401).json({
        success: false,
        message: "Hibás vezetőségi belépési adatok!"
    });
});


// ==============================
// ADMIN BEJELENTKEZÉS ELLENŐRZÉSE
// ==============================

app.get("/api/admin/me", (req, res) => {
    if (req.session.admin === true) {
        return res.json({
            loggedIn: true,
            username: process.env.ADMIN_USERNAME
        });
    }

    res.status(401).json({
        loggedIn: false
    });
});

// ==============================
// JELENTKEZÉSEK LEKÉRÉSE
// ==============================

app.get(
    "/api/applications",
    requireAdmin,
    (req, res) => {
        const applications = readJSON(APPLICATIONS_FILE);

        res.json(applications);
    }
);

// ==============================
// JELENTKEZÉS STÁTUSZ
// ==============================

app.patch(
    "/api/applications/:id",
    requireAdmin,
    (req, res) => {
        const applications = readJSON(APPLICATIONS_FILE);

        const application = applications.find(
            a => a.id === req.params.id
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Jelentkezés nem található."
            });
        }

        const allowedStatuses = [
            "Feldolgozás alatt",
            "Elfogadva",
            "Elutasítva"
        ];

        if (!allowedStatuses.includes(req.body.status)) {
            return res.status(400).json({
                success: false,
                message: "Érvénytelen státusz."
            });
        }

        application.status = req.body.status;

        writeJSON(APPLICATIONS_FILE, applications);

        res.json({
            success: true
        });
    }
);

// ==============================
// OLDALAK
// ==============================

app.get("/fiokom", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "fiokom.html")
    );
});

app.get("/jelentkezes", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "jelentkezes.html")
    );
});

app.get("/vezetoseg", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "vezetoseg.html")
    );
});

app.get("/dashboard", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "dashboard.html")
    );
});

// ==============================
// SZERVER INDÍTÁSA
// ==============================

app.listen(PORT, () => {
    console.log("");
    console.log("======================================");
    console.log("   MAGYAR HONVÉDSÉG RP SZERVER");
    console.log("======================================");
    console.log("");
    console.log(`Szerver: http://localhost:${PORT}`);
    console.log("");
});
