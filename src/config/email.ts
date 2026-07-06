import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const EMAIL_PASS = process.env.EMAIL_PASS as string | undefined;
const EMAIL_USER = process.env.EMAIL_USER as string | undefined;
const EMAIL_FROM = process.env.EMAIL_FROM as string | undefined;
const normalizedEmailPass = EMAIL_PASS?.replace(/\s+/g, "");

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    // Gmail displays app passwords with spaces, but SMTP auth expects the 16-character token without whitespace.
    pass: normalizedEmailPass,
  },
});

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

  await transporter.sendMail(mailOptions);
};
