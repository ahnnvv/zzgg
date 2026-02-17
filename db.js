const mongoose = require("mongoose");
const fs = require("fs").promises;
const path = require("path");

const EventSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  datetime: { type: Date, required: true }
});

const ConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed
});

const Event = mongoose.model("Event", EventSchema);
const Config = mongoose.model("Config", ConfigSchema);

const EVENTS_FILE = path.join(__dirname, "events.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

let connected = false;

async function connect() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Thiếu biến môi trường MONGODB_URI. Thêm vào file .env");
  }
  await mongoose.connect(uri);
  connected = true;
  console.log("Đã kết nối MongoDB.");
}

/** Import dữ liệu từ events.json / config.json nếu DB trống (chỉ chạy 1 lần sau khi chuyển sang MongoDB) */
async function migrateFromFiles() {
  const eventCount = await Event.countDocuments();
  if (eventCount === 0) {
    try {
      const data = await fs.readFile(EVENTS_FILE, "utf8");
      const events = JSON.parse(data);
      if (Object.keys(events).length > 0) {
        await Event.insertMany(
          Object.entries(events).map(([name, iso]) => ({ name, datetime: new Date(iso) }))
        );
        console.log("Đã import events từ events.json vào MongoDB.");
      }
    } catch (e) {
      if (e.code !== "ENOENT") console.error("Migration events:", e.message);
    }
  }

  const configDoc = await Config.findOne({ key: "morningEventName" });
  if (!configDoc) {
    try {
      const data = await fs.readFile(CONFIG_FILE, "utf8");
      const config = JSON.parse(data);
      if (config.morningEventName != null) {
        await Config.findOneAndUpdate(
          { key: "morningEventName" },
          { key: "morningEventName", value: config.morningEventName },
          { upsert: true }
        );
        console.log("Đã import config từ config.json vào MongoDB.");
      }
    } catch (e) {
      if (e.code !== "ENOENT") console.error("Migration config:", e.message);
    }
  }
}

async function loadEvents() {
  const docs = await Event.find().lean();
  const result = {};
  for (const doc of docs) result[doc.name] = new Date(doc.datetime).toISOString();
  return result;
}

async function saveEvents(events) {
  const names = Object.keys(events);
  await Event.deleteMany({ name: { $nin: names } });
  for (const [name, iso] of Object.entries(events)) {
    await Event.findOneAndUpdate(
      { name },
      { name, datetime: new Date(iso) },
      { upsert: true }
    );
  }
}

async function loadConfig() {
  const doc = await Config.findOne({ key: "morningEventName" }).lean();
  return { morningEventName: doc?.value ?? null };
}

async function saveConfig(config) {
  await Config.findOneAndUpdate(
    { key: "morningEventName" },
    { key: "morningEventName", value: config.morningEventName },
    { upsert: true }
  );
}

module.exports = {
  connect,
  migrateFromFiles,
  loadEvents,
  saveEvents,
  loadConfig,
  saveConfig
};
