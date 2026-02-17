require("dotenv").config();

const fs = require("fs").promises;
const path = require("path");

const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");

const EVENTS_FILE = path.join(__dirname, "events.json");

async function loadEvents() {
  try {
    const data = await fs.readFile(EVENTS_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

async function saveEvents(events) {
  await fs.writeFile(EVENTS_FILE, JSON.stringify(events, null, 2), "utf8");
}

/** Parse chuỗi ngày giờ: 31/12/2026 23:59, 2026-12-31 23:59, 2026-12-31 */
function parseEventDateTime(str) {
  const s = (str || "").trim();
  let datePart, timePart = "00:00";
  if (s.includes(" ")) {
    const [d, t] = s.split(/\s+/, 2);
    datePart = d;
    timePart = t || "00:00";
  } else {
    datePart = s;
  }
  let day, month, year;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(datePart)) {
    const [y, m, d] = datePart.split("-").map(Number);
    year = y; month = m; day = d;
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(datePart)) {
    const parts = datePart.split("/").map(Number);
    day = parts[0]; month = parts[1]; year = parts[2];
  } else {
    return null;
  }
  const [h = 0, min = 0] = (timePart.match(/\d+/g) || []).map(Number);
  const d = new Date(year, month - 1, day, h, min, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Trả về { years, months, days, hours, minutes } còn lại đến target */
function getCountdown(targetDate) {
  const now = new Date();
  if (targetDate <= now) {
    return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, passed: true };
  }
  let cur = new Date(now.getTime());
  let years = 0, months = 0, days = 0, hours = 0, minutes = 0;

  while (true) {
    const next = new Date(cur.getFullYear() + 1, cur.getMonth(), cur.getDate(), cur.getHours(), cur.getMinutes());
    if (next > targetDate) break;
    cur = next;
    years++;
  }
  while (true) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate(), cur.getHours(), cur.getMinutes());
    if (next > targetDate) break;
    cur = next;
    months++;
  }
  while (true) {
    const next = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    if (next > targetDate) break;
    cur = next;
    days++;
  }
  const ms = targetDate - cur;
  hours = Math.floor(ms / (60 * 60 * 1000));
  minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  return { years, months, days, hours, minutes, passed: false };
}

function formatCountdown(obj) {
  if (obj.passed) return "Sự kiện đã qua.";
  const parts = [];
  if (obj.years > 0) parts.push(`${obj.years} năm`);
  if (obj.months > 0) parts.push(`${obj.months} tháng`);
  if (obj.days > 0) parts.push(`${obj.days} ngày`);
  if (obj.hours > 0) parts.push(`${obj.hours} giờ`);
  if (obj.minutes > 0) parts.push(`${obj.minutes} phút`);
  if (parts.length === 0) parts.push("Sắp tới!");
  return parts.join(" ");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_PRIORITY = [
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

const topics = [
  "động lực làm việc",
  "yêu bản thân",
  "kỷ luật",
  "biết ơn",
  "sức khỏe",
  "học tập",
  "tập trung mục tiêu"
];

function getRandomTopic() {
  return topics[Math.floor(Math.random() * topics.length)];
}

/** Nếu AI trả về nhiều câu (list), chỉ lấy 1 câu ngẫu nhiên */
function pickOneLine(text) {
  const lines = text
    .split(/\n+/)
    .map(s => s.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(s => s.length > 15 && !s.startsWith("http"));
  if (lines.length === 0) return text.trim();
  if (lines.length === 1) return lines[0];
  return lines[Math.floor(Math.random() * lines.length)];
}

async function askGemini(prompt) {

  for (const modelName of MODEL_PRIORITY) {
    try {
      console.log("Thử model:", modelName);

      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);

      console.log("Dùng thành công:", modelName);
      return result.response.text();

    } catch (error) {
      console.error("Model lỗi:", modelName);
      console.error(error.message);
      continue;
    }
  }

  return "⚠ AI hiện không khả dụng. Thử lại sau nhé!";
}

client.once("ready", () => {
  console.log(`Bot online: ${client.user.tag}`);

  cron.schedule(process.env.CRON_SCHEDULE || "0 7 * * *", async () => {
    console.log("Chạy cron job...");

    try {
      const channel = await client.channels.fetch(process.env.CHANNEL_ID);
      const topic = getRandomTopic();

      const prompt = `Viết ĐÚNG MỘT câu chúc buổi sáng ngắn gọn, tích cực, truyền động lực. Chủ đề: ${topic}. Chỉ trả lời bằng một câu duy nhất, không đánh số, không liệt kê.`;

      const raw = await askGemini(prompt);
      const message = pickOneLine(raw);

      await channel.send(`🌞 **Chào buổi sáng mọi người!**\n\n${message}`);

    } catch (err) {
      console.error("Lỗi cron:", err);
    }

  }, {
    timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh"
  });

});

client.on("interactionCreate", async interaction => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "event") {
      try {
        const events = await loadEvents();
        const names = Object.keys(events);
        const focused = (interaction.options.getFocused() || "").toLowerCase();
        const filtered = names
          .filter(n => n.toLowerCase().includes(focused))
          .slice(0, 25)
          .map(name => ({ name, value: name }));
        await interaction.respond(filtered);
      } catch (e) {
        await interaction.respond([]);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ask") {

    await interaction.deferReply();

    const question = interaction.options.getString("question");

    const answer = await askGemini(question);

    await interaction.editReply(answer);
  }

  if (interaction.commandName === "goodmorning") {

    await interaction.deferReply();

    const topic = getRandomTopic();

    const prompt = `Viết ĐÚNG MỘT câu chúc buổi sáng ngắn gọn, tích cực, truyền động lực. Chủ đề: ${topic}. Chỉ trả lời bằng một câu duy nhất, không đánh số, không liệt kê.`;

    const raw = await askGemini(prompt);
    const message = pickOneLine(raw);

    await interaction.editReply(
      `🌞 Chào buổi sáng ${interaction.user}!\n\n${message}`
    );
  }

  if (interaction.commandName === "addevent") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "Chỉ admin mới dùng được lệnh này.", ephemeral: true });
    }
    const name = interaction.options.getString("name").trim();
    const datetimeStr = interaction.options.getString("datetime");
    const date = parseEventDateTime(datetimeStr);
    if (!date) {
      return interaction.reply({
        content: "Thời gian không hợp lệ. Dùng dạng: `31/12/2026 23:59` hoặc `2026-12-31 23:59`",
        ephemeral: true
      });
    }
    try {
      const events = await loadEvents();
      events[name] = date.toISOString();
      await saveEvents(events);
      const formatted = date.toLocaleString("vi-VN", { dateStyle: "long", timeStyle: "short" });
      await interaction.reply({
        content: `Đã thêm sự kiện **${name}** vào lúc ${formatted}. Dùng \`/event name: ${name}\` để xem countdown.`
      });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: "Lỗi khi lưu sự kiện.", ephemeral: true });
    }
  }

  if (interaction.commandName === "event") {
    const name = interaction.options.getString("name").trim();
    const events = await loadEvents();
    const keys = Object.keys(events);
    const matched = keys.find(k => k.toLowerCase() === name.toLowerCase()) || keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
    if (!matched) {
      const list = keys.length ? keys.join("`, `") : "(chưa có sự kiện)";
      return interaction.reply({
        content: `Không tìm thấy sự kiện **${name}**. Các sự kiện hiện có: \`${list}\``,
        ephemeral: true
      });
    }
    const target = new Date(events[matched]);
    const countdown = getCountdown(target);
    const text = formatCountdown(countdown);
    const formatted = target.toLocaleString("vi-VN", { dateStyle: "long", timeStyle: "short" });
    await interaction.reply({
      content: `⏳ **${matched}**\nThời gian: ${formatted}\nCòn lại: **${text}**`
    });
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
