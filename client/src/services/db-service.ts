import { MongoClient, Db } from "mongodb";

try {
  const dns = await import("node:dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

const DEFAULT_URI = "mongodb+srv://jinansh:admin132@cluster0.ckjs3v9.mongodb.net/?appName=Cluster0";
const DB_NAME = "materio_chat";

let cachedDb: Db | null = null;
let connectingPromise: Promise<Db> | null = null;

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;
  if (connectingPromise) return connectingPromise;

  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 8000,
    retryWrites: true,
    retryReads: true,
  });

  connectingPromise = client.connect().then((c) => {
    cachedDb = c.db(DB_NAME);
    return cachedDb;
  }).catch((err) => {
    connectingPromise = null;
    cachedDb = null;
    throw err;
  });

  return connectingPromise;
}

export function buildOwnershipFilter(userId?: string | null, anonymousId?: string | null, id?: string) {
  const conditions: any[] = [];
  if (userId) conditions.push({ userId });
  if (anonymousId) conditions.push({ anonymousId });

  if (conditions.length === 0) return null;

  const query: any = {};
  if (id) query.id = id;

  if (conditions.length === 1) {
    Object.assign(query, conditions[0]);
  } else {
    query.$or = conditions;
  }
  return query;
}

// ── Conversations ──
export async function listConversations(userId?: string | null, anonymousId?: string | null) {
  const db = await getDb();
  const filter = buildOwnershipFilter(userId, anonymousId);
  if (!filter) return [];
  return db.collection("conversations").find(filter).sort({ updatedAt: -1 }).toArray();
}

export async function getConversation(id: string, userId?: string | null, anonymousId?: string | null) {
  const db = await getDb();
  const idQuery = { $or: [{ id }, { shareId: id }] };
  const ownership = buildOwnershipFilter(userId, anonymousId);

  let convo = null;
  if (ownership) {
    convo = await db.collection("conversations").findOne({ $and: [idQuery, ownership] });
  }
  if (!convo) {
    convo = await db.collection("conversations").findOne({ ...idQuery, visibility: "public" });
  }
  return convo;
}

export async function upsertConversation(conv: any, userId?: string | null, anonymousId?: string | null) {
  const db = await getDb();
  if (userId) conv.userId = userId;
  else if (anonymousId) conv.anonymousId = anonymousId;

  conv.updatedAt = Date.now();
  if (!conv.createdAt) conv.createdAt = Date.now();

  const filter = buildOwnershipFilter(userId, anonymousId, conv.id);
  if (!filter) throw new Error("Unauthorized");

  const result = await db.collection("conversations").findOneAndUpdate(
    filter,
    { $set: conv },
    { upsert: true, returnDocument: "after" }
  );
  return result;
}

export async function deleteConversation(id: string, userId?: string | null, anonymousId?: string | null) {
  const db = await getDb();
  const filter = buildOwnershipFilter(userId, anonymousId, id);
  if (!filter) throw new Error("Unauthorized");

  const res = await db.collection("conversations").deleteOne(filter);
  if (res.deletedCount === 0) throw new Error("Conversation not found or unauthorized");

  await db.collection("messages").deleteMany({ conversationId: id });
  return { success: true };
}

// ── Messages ──
export async function listMessages(conversationId: string, userId?: string | null, anonymousId?: string | null) {
  const convo = await getConversation(conversationId, userId, anonymousId);
  if (!convo) throw new Error("Not found or unauthorized");

  const db = await getDb();
  return db.collection("messages").find({ conversationId: convo.id }).sort({ timestamp: 1 }).toArray();
}

export async function saveMessage(msg: any, userId?: string | null, anonymousId?: string | null, isPlusUser?: boolean, hasAdminPrivileges?: boolean) {
  const db = await getDb();
  if (userId) msg.userId = userId;
  else if (anonymousId) msg.anonymousId = anonymousId;

  if (!msg.timestamp) msg.timestamp = Date.now();

  // Rate limiting check for new user messages
  if (msg.role === "user" && !msg._id) {
    const existing = await db.collection("messages").findOne({ id: msg.id });
    if (!existing) {
      if (userId) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const count = await db.collection("messages").countDocuments({
          userId,
          timestamp: { $gte: startOfDay.getTime() },
          role: "user",
        });

        let limit = 20;
        if (hasAdminPrivileges) limit = 70;
        else if (isPlusUser) limit = 35;

        if (count >= limit) {
          const err: any = new Error("Daily message limit reached");
          err.status = 429;
          throw err;
        }
      } else if (anonymousId) {
        const count = await db.collection("messages").countDocuments({
          anonymousId,
          role: "user",
        });
        if (count >= 3) {
          const err: any = new Error("Free trial limit reached. Please log in to continue.");
          err.status = 429;
          throw err;
        }
      }
    }
  }

  const filter = buildOwnershipFilter(userId, anonymousId, msg.id);
  if (!filter) throw new Error("Unauthorized");

  const result = await db.collection("messages").findOneAndUpdate(
    filter,
    { $set: msg },
    { upsert: true, returnDocument: "after" }
  );
  return result;
}

export async function deleteMessage(id: string, userId?: string | null, anonymousId?: string | null) {
  const db = await getDb();
  const filter = buildOwnershipFilter(userId, anonymousId, id);
  if (!filter) throw new Error("Unauthorized");

  const res = await db.collection("messages").deleteOne(filter);
  if (res.deletedCount === 0) throw new Error("Message not found or unauthorized");
  return { success: true };
}

// ── Custom Connectors ──
export async function listCustomConnectors(userId: string) {
  const db = await getDb();
  return db.collection("customconnectors").find({ userId }).sort({ createdAt: 1 }).toArray();
}

export async function upsertCustomConnector(conn: any, userId: string) {
  const db = await getDb();
  conn.userId = userId;
  if (!conn.createdAt) conn.createdAt = Date.now();

  const result = await db.collection("customconnectors").findOneAndUpdate(
    { id: conn.id, userId },
    { $set: conn },
    { upsert: true, returnDocument: "after" }
  );
  return result;
}

export async function deleteCustomConnector(id: string, userId: string) {
  const db = await getDb();
  const res = await db.collection("customconnectors").deleteOne({ id, userId });
  if (res.deletedCount === 0) throw new Error("Connector not found");
  return { success: true };
}

// ── Skills ──
export async function listSkills(userId: string) {
  const db = await getDb();
  return db.collection("skills").find({ userId }).toArray();
}

export async function upsertSkill(skill: any, userId: string) {
  const db = await getDb();
  skill.userId = userId;

  const result = await db.collection("skills").findOneAndUpdate(
    { id: skill.id, userId },
    { $set: skill },
    { upsert: true, returnDocument: "after" }
  );
  return result;
}

export async function deleteSkill(id: string, userId: string) {
  const db = await getDb();
  const res = await db.collection("skills").deleteOne({ id, userId });
  if (res.deletedCount === 0) throw new Error("Skill not found");
  return { success: true };
}

// ── API Keys ──
export async function listApiKeys(userId: string) {
  const db = await getDb();
  return db.collection("apikeys").find({ userId }).toArray();
}

export async function upsertApiKey(providerId: string, apiKey: string, userId: string) {
  const db = await getDb();
  const result = await db.collection("apikeys").findOneAndUpdate(
    { providerId, userId },
    { $set: { providerId, apiKey, userId, updatedAt: Date.now() } },
    { upsert: true, returnDocument: "after" }
  );
  return result;
}
