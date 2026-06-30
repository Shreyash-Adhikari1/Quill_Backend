import dotenv from "dotenv";
import connectDB from "./database/db";
import app from "./app";
import fs from "fs";
import https from "https";
import path from "path";
dotenv.config();

// const app: Application = express();
const PORT = process.env.PORT || 5000;

//database connection
connectDB();

const httpsOptions = {
  // Reads the private TLS key generated for local HTTPS so JWT cookies are not sent over plaintext.
  key: fs.readFileSync(path.join(__dirname, "../certs/server.key")),
  // Reads the matching TLS certificate so browsers/clients can establish an encrypted HTTPS session.
  cert: fs.readFileSync(path.join(__dirname, "../certs/server.crt")),
};

// Start HTTPS Server
https.createServer(httpsOptions, app).listen(PORT, () => {
  // HTTPS protects credentials and cookies against network interception during development.
  console.log(`Server running securely at: https://localhost:${PORT}`);
});
