import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async (): Promise<void> => {
  const dbUri = process.env.MONGO_URI || process.env.MONGO_URL;

  if (!dbUri) {
    console.error("FATAL ERROR: MONGO_URI is not defined.");
    process.exit(1);
    return;
  }

  try {
    await mongoose.connect(dbUri);

    console.log("Connected to Database");
  } catch (error) {
    console.error("Database connection error:", error);
    process.exit(1);
    return;
  }
};

export default connectDB;
