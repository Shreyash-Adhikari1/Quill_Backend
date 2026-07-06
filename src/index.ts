import dotenv from "dotenv";
import connectDB from "./database/db";
import app from "./app";
import fs from "fs";
import https from "https";
import path from "path";
dotenv.config();

// const app: Application = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const DISPLAY_HOST = process.env.SERVER_HOST || process.env.SERVER_URL?.replace(/^https?:\/\//, "") || `localhost:${PORT}`;
const LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL || `https://localhost:${PORT}`;
const VM_SERVER_URL = process.env.VM_SERVER_URL || process.env.SERVER_URL;

//database connection
connectDB();

const httpsOptions = {
  // Reads the private TLS key generated for local HTTPS so JWT cookies are not sent over plaintext.
  key: fs.readFileSync(path.join(__dirname, "../certs/server.key")),
  // Reads the matching TLS certificate so browsers/clients can establish an encrypted HTTPS session.
  cert: fs.readFileSync(path.join(__dirname, "../certs/server.crt")),
};

// Start HTTPS Server
https.createServer(httpsOptions, app).listen(Number(PORT), HOST, () => {
  // HTTPS protects credentials and cookies against network interception during development.
  console.log(`Server running securely at: https://${DISPLAY_HOST}`);
  console.log(`Local URL: ${LOCAL_SERVER_URL}`);
  if (VM_SERVER_URL) console.log(`VM/LAN URL: ${VM_SERVER_URL}`);
  console.log(`Listening on ${HOST}:${PORT} so VMs and LAN clients can reach the API.`);
});
