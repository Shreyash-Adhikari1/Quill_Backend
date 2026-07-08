import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { PasswordPolicySchema } from "../features/user/dto/user.dto";
import { UserModel } from "../features/user/model/user.model";

dotenv.config();

const REQUIRED_ADMIN_ENV = [
  "ADMIN_EMAIL",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "ADMIN_FULL_NAME",
] as const;

function requiredEnv(name: (typeof REQUIRED_ADMIN_ENV)[number]) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to seed the admin account`);
  }
  return value;
}

async function connectForSeed() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!mongoUri) {
    throw new Error("MONGO_URI is required to seed the admin account");
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      // The seed script connects directly instead of starting the API server, so admin setup does not expose any bootstrap route.
      await mongoose.connect(mongoUri);
      return;
    } catch (error) {
      if (attempt === 20) throw error;
      // Docker may start the MongoDB container before it accepts connections, so retry instead of failing the seed.
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function seedAdmin() {
  const email = requiredEnv("ADMIN_EMAIL").toLowerCase();
  const username = requiredEnv("ADMIN_USERNAME");
  const password = requiredEnv("ADMIN_PASSWORD");
  const fullName = requiredEnv("ADMIN_FULL_NAME");

  // The seeded admin must pass the same password policy as normal users, avoiding a weaker privileged account.
  const passwordCheck = PasswordPolicySchema.safeParse(password);
  if (!passwordCheck.success) {
    throw new Error(passwordCheck.error.issues[0]?.message || "Admin password does not meet policy");
  }

  await connectForSeed();

  const passwordHash = await bcrypt.hash(password, 10);
  const existingUser = await UserModel.findOne({
    $or: [{ email }, { username }],
  })
    .select("+password +passwordHistory")
    .exec();

  if (existingUser) {
    // Promote or refresh the configured account instead of creating duplicate privileged users.
    existingUser.fullName = fullName;
    existingUser.username = username;
    existingUser.email = email;
    existingUser.password = passwordHash;
    existingUser.passwordHistory = [];
    existingUser.role = "admin";
    existingUser.isVerified = true;
    existingUser.failedLoginAttempts = 0;
    existingUser.lockUntil = null;
    existingUser.lastPasswordChange = new Date();
    existingUser.sessionVersion = (existingUser.sessionVersion || 0) + 1;
    await existingUser.save();
    console.log(`Admin account promoted/updated: ${email}`);
    return;
  }

  // The seed path is trusted operator setup, so the admin is created as verified and does not need email OTP bootstrap.
  await UserModel.create({
    fullName,
    username,
    email,
    password: passwordHash,
    passwordHistory: [],
    role: "admin",
    isVerified: true,
    failedLoginAttempts: 0,
    lockUntil: null,
    lastPasswordChange: new Date(),
    sessionVersion: 0,
  });

  console.log(`Admin account created: ${email}`);
}

seedAdmin()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
