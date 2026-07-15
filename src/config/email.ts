import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { promises as dns } from "dns";

dotenv.config();

const EMAIL_PASS = process.env.EMAIL_PASS as string | undefined;
const EMAIL_USER = process.env.EMAIL_USER as string | undefined;
const EMAIL_FROM = process.env.EMAIL_FROM as string | undefined;
const normalizedEmailPass = EMAIL_PASS?.replace(/\s+/g, "");

async function createTransporter() {
  // Node's c-ares resolver can hang in some Windows/dev-network setups even
  // while the operating-system resolver works. dns.lookup uses the OS resolver,
  // preventing registration and reset requests from freezing before SMTP starts.
  const { address } = await dns.lookup("smtp.gmail.com", { family: 4 });

  return nodemailer.createTransport({
    host: address,
    port: 587,
    secure: false,
    requireTLS: true,
    // Preserve Gmail's hostname for SNI and certificate verification even though
    // the TCP connection uses the address returned by the trusted OS resolver.
    tls: { servername: "smtp.gmail.com" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: {
      user: EMAIL_USER,
      // Gmail displays app passwords with spaces, but SMTP auth expects the 16-character token without whitespace.
      pass: normalizedEmailPass,
    },
  });
}

export const sendEmail = async (to: string, subject: string, html: string) => {
  if (!EMAIL_USER || !normalizedEmailPass) {
    throw new Error("Email service is not configured");
  }

  const mailOptions = {
    // For Gmail SMTP, the authenticated Gmail address must be the real sender unless EMAIL_FROM is a verified Gmail alias.
    // This avoids sender-address failures while still allowing replies to go to EMAIL_FROM when configured.
    from: `Quill <${EMAIL_USER}>`,
    replyTo: EMAIL_FROM,
    to,
    subject,
    html,
  };

  const transporter = await createTransporter();
  try {
    await transporter.sendMail(mailOptions);
  } finally {
    transporter.close();
  }
};
