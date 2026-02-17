require("dotenv").config();

const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");
const db = require("./db");

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

/** Trả về { text, full, short }. full: năm tháng ngày giờ phút; short: chỉ ngày và phút (trong ngoặc). */
function formatCountdown(obj) {
  if (obj.passed) {
    const t = "Sự kiện đã qua.";
    return { text: t, full: t, short: "" };
  }
  const parts = [];
  if (obj.years > 0) parts.push(`${obj.years} năm`);
  if (obj.months > 0) parts.push(`${obj.months} tháng`);
  if (obj.days > 0) parts.push(`${obj.days} ngày`);
  if (obj.hours > 0) parts.push(`${obj.hours} giờ`);
  if (obj.minutes > 0) parts.push(`${obj.minutes} phút`);
  if (parts.length === 0) parts.push("Sắp tới!");
  const full = parts.join(" ");
  const shortParts = [];
  if (obj.days > 0) shortParts.push(`${obj.days} ngày`);
  if (obj.minutes > 0) shortParts.push(`${obj.minutes} phút`);
  const short = shortParts.length ? shortParts.join(" ") : full;
  const text = short === full ? full : `${full} (${short})`;
  return { text, full, short };
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

client.once("clientReady", async () => {
  try {
    await db.connect();
    await db.migrateFromFiles();
    await db.testConnection(); // Test và hiển thị số events hiện có
  } catch (err) {
    console.error("Lỗi kết nối MongoDB:", err.message);
    process.exit(1);
  }
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

      const config = await db.loadConfig();
      const events = await db.loadEvents();
      const morningName = config.morningEventName;
      if (morningName && events[morningName]) {
        const target = new Date(events[morningName]);
        const countdown = getCountdown(target);
        const { text } = formatCountdown(countdown);
        const formatted = target.toLocaleString("vi-VN", { dateStyle: "long", timeStyle: "short" });
        await channel.send(`⏳ **${morningName}**\nThời gian: ${formatted}\nCòn lại: **${text}**`);
      }
    } catch (err) {
      console.error("Lỗi cron:", err);
    }

  }, {
    timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh"
  });

});

client.on("interactionCreate", async interaction => {
  if (interaction.isAutocomplete()) {
    const needEventList = ["event", "editevent", "deleteevent", "setmorningevent"].includes(interaction.commandName);
    if (needEventList) {
      try {
        const events = await db.loadEvents();
        const names = Object.keys(events);
        const focused = (interaction.options.getFocused() || "").toLowerCase();
        const filtered = names
          .filter(n => n.toLowerCase().includes(focused))
          .slice(0, interaction.commandName === "setmorningevent" ? 24 : 25)
          .map(name => ({ name, value: name }));
        if (interaction.commandName === "setmorningevent") {
          const clearChoice = { name: "— Tắt countdown 7h —", value: "__clear__" };
          const matchesClear = focused === "" || "tắt".includes(focused) || "clear".includes(focused);
          const list = matchesClear ? [clearChoice, ...filtered] : (filtered.length ? filtered : [clearChoice]);
          await interaction.respond(list);
        } else {
          await interaction.respond(filtered);
        }
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
      const events = await db.loadEvents();
      events[name] = date.toISOString();
      await db.saveEvents(events);
      const formatted = date.toLocaleString("vi-VN", { dateStyle: "long", timeStyle: "short" });
      await interaction.reply({
        content: `Đã thêm sự kiện **${name}** vào lúc ${formatted}. Dùng \`/event name: ${name}\` để xem countdown.`
      });
    } catch (e) {
      console.error("Lỗi khi lưu sự kiện:", e);
      await interaction.reply({ 
        content: `Lỗi khi lưu sự kiện: ${e.message}. Kiểm tra console để biết thêm chi tiết.`, 
        ephemeral: true 
      });
    }
  }

  if (interaction.commandName === "event") {
    const name = interaction.options.getString("name").trim();
    const events = await db.loadEvents();
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
    const { text } = formatCountdown(countdown);
    const formatted = target.toLocaleString("vi-VN", { dateStyle: "long", timeStyle: "short" });
    await interaction.reply({
      content: `⏳ **${matched}**\nThời gian: ${formatted}\nCòn lại: **${text}**`
    });
  }

  if (interaction.commandName === "editevent") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "Chỉ admin mới dùng được lệnh này.", ephemeral: true });
    }
    const name = interaction.options.getString("name").trim();
    const newName = interaction.options.getString("newname")?.trim();
    const newDatetimeStr = interaction.options.getString("newdatetime")?.trim();
    if (!newName && !newDatetimeStr) {
      return interaction.reply({
        content: "Cần điền ít nhất **newname** hoặc **newdatetime** để chỉnh sửa.",
        ephemeral: true
      });
    }
    const events = await db.loadEvents();
    const keys = Object.keys(events);
    const matched = keys.find(k => k.toLowerCase() === name.toLowerCase()) || keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
    if (!matched) {
      return interaction.reply({ content: `Không tìm thấy sự kiện **${name}**.`, ephemeral: true });
    }
    let date = new Date(events[matched]);
    if (newDatetimeStr) {
      const parsed = parseEventDateTime(newDatetimeStr);
      if (!parsed) {
        return interaction.reply({
          content: "Thời gian mới không hợp lệ. Dùng dạng: `31/12/2026 23:59` hoặc `2026-12-31 23:59`",
          ephemeral: true
        });
      }
      date = parsed;
    }
    const finalName = newName || matched;
    if (matched !== finalName && events[finalName]) {
      return interaction.reply({ content: `Đã tồn tại sự kiện **${finalName}**. Chọn tên khác.`, ephemeral: true });
    }
    delete events[matched];
    events[finalName] = date.toISOString();
    await db.saveEvents(events);
    const config = await db.loadConfig();
    if (config.morningEventName === matched) {
      config.morningEventName = finalName;
      await db.saveConfig(config);
    }
    const formatted = date.toLocaleString("vi-VN", { dateStyle: "long", timeStyle: "short" });
    await interaction.reply({ content: `Đã cập nhật sự kiện thành **${finalName}** — ${formatted}.` });
  }

  if (interaction.commandName === "deleteevent") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "Chỉ admin mới dùng được lệnh này.", ephemeral: true });
    }
    const name = interaction.options.getString("name").trim();
    const events = await db.loadEvents();
    const keys = Object.keys(events);
    const matched = keys.find(k => k.toLowerCase() === name.toLowerCase()) || keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
    if (!matched) {
      return interaction.reply({ content: `Không tìm thấy sự kiện **${name}**.`, ephemeral: true });
    }
    delete events[matched];
    await db.saveEvents(events);
    const config = await db.loadConfig();
    if (config.morningEventName === matched) {
      config.morningEventName = null;
      await db.saveConfig(config);
    }
    await interaction.reply({ content: `Đã xóa sự kiện **${matched}**.` });
  }

  if (interaction.commandName === "setmorningevent") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "Chỉ admin mới dùng được lệnh này.", ephemeral: true });
    }
    const eventName = interaction.options.getString("event")?.trim();
    const config = await db.loadConfig();
    if (!eventName || eventName === "__clear__") {
      config.morningEventName = null;
      await db.saveConfig(config);
      return interaction.reply({ content: "Đã tắt countdown sự kiện lúc 7h. Chỉ còn tin nhắn chúc buổi sáng." });
    }
    const events = await db.loadEvents();
    const keys = Object.keys(events);
    const matched = keys.find(k => k.toLowerCase() === eventName.toLowerCase()) || keys.find(k => k.toLowerCase().includes(eventName.toLowerCase()));
    if (!matched) {
      return interaction.reply({ content: `Không tìm thấy sự kiện **${eventName}**. Thêm sự kiện trước bằng \`/addevent\`.` , ephemeral: true });
    }
    config.morningEventName = matched;
    await db.saveConfig(config);
    await interaction.reply({ content: `Mỗi 7h sẽ gửi countdown **${matched}** cùng với chúc buổi sáng.` });
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
