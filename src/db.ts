import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../client/.env") });

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not defined in the environment.");
    return;
  }

  try {
    await mongoose.connect(uri, {
      dbName: "materio_chat",
    });
    console.log("✅ Connected to MongoDB.");
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
  }
}

const ConversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, default: "New Chat" },
  userId: { type: String, index: true },
  anonymousId: { type: String, index: true },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  messageCount: { type: Number, default: 0 },
});

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  conversationId: { type: String, required: true, index: true },
  userId: { type: String, index: true },
  anonymousId: { type: String, index: true },
  role: { type: String, required: true },
  content: { type: String, default: "" },
  timestamp: { type: Number, default: Date.now },
  isStreaming: { type: Boolean, default: false },
  toolCalls: { type: mongoose.Schema.Types.Mixed, default: [] },
  error: { type: String },
  result: { type: String },
  rating: { type: String, enum: ["like", "dislike", null], default: null },
  modelUsed: { type: String },
  parentId: { type: String, index: true },
});

export const Conversation = mongoose.model("Conversation", ConversationSchema);
export const Message = mongoose.model("Message", MessageSchema);
