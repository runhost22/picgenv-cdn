const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

require("dotenv").config();

const app = express();
const port = 30009;
const upload = multer({ dest: "uploads/" });

const GITHUB_KEYS = [
    process.env.GITHUB_TOKEN, process.env.GITHUB_TOKEN1, process.env.GITHUB_TOKEN2,
    process.env.GITHUB_TOKEN3, process.env.GITHUB_TOKEN4, process.env.GITHUB_TOKEN5
];
let uploadCount = 0;

function getApiKey() {
    const key = GITHUB_KEYS[Math.floor(uploadCount / 3) % GITHUB_KEYS.length];
    uploadCount++;
    return key;
}

const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const BASE_FOLDER = "cdn";
const CUSTOM_FOLDER = "aura";
const BASE_URL = "https://picgenv.lykfile.me/picgenv/cdn";
const CUSTOM_URL = "https://cdn.prxy.us.kg/aura";

const axiosInstance = axios.create({ timeout: 15000 });

// **Queue to handle uploads sequentially**
let uploadQueue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing || uploadQueue.length === 0) return;
    
    isProcessing = true;
    const { req, res } = uploadQueue.shift(); // Get the first request from the queue

    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const githubToken = getApiKey();
        const { folder } = req.query;
        const randomId = Date.now();
        const fileExtension = path.extname(req.file.originalname);
        const newFileName = `${path.basename(req.file.originalname, fileExtension)}_${randomId}${fileExtension}`;

        let targetFolder = folder ? `${CUSTOM_FOLDER}/${folder}` : BASE_FOLDER;
        const filePath = path.join(__dirname, "uploads", newFileName);

        await fs.promises.rename(req.file.path, filePath);
        const fileContent = fs.readFileSync(filePath, { encoding: "base64" });

        const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${targetFolder}/${newFileName}?ref=${GITHUB_BRANCH}`;
        const imageUrl = folder ? `${CUSTOM_URL}/${folder}/${newFileName}` : `${BASE_URL}/${newFileName}`;

        let sha;
        try {
            const shaResponse = await axiosInstance.get(url, {
                headers: { Authorization: `token ${githubToken}` },
            });
            sha = shaResponse.data.sha;
        } catch (err) {
            sha = undefined;
        }

        await axiosInstance.put(
            url,
            {
                message: `Uploaded ${newFileName} ${imageUrl}`,
                content: fileContent,
                branch: GITHUB_BRANCH,
                sha: sha || undefined,
            },
            { headers: { Authorization: `token ${githubToken}` } }
        );

        await fs.promises.unlink(filePath);
        res.json({ success: true, url: imageUrl });

    } catch (error) {
        console.error("GitHub Upload Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to upload file" });
    }

    isProcessing = false;
    processQueue(); // Process the next request
}

// **Handle uploads but queue them**
app.post("/upload", upload.single("file"), async (req, res) => {
    uploadQueue.push({ req, res });
    processQueue();
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
