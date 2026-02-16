require("dotenv").config();

// Múi giờ cho cron (7h chúc buổi sáng). Ví dụ: Asia/Ho_Chi_Minh (VN), UTC, America/New_York
process.env.TZ = process.env.CRON_TZ || process.env.TZ || "Asia/Ho_Chi_Minh";

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== Gemini Setup =====
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// ===== Giới hạn miễn phí =====
let dailyCount = 0;
const DAILY_LIMIT = 10;

// Reset mỗi ngày lúc 00:00
cron.schedule("0 0 * * *", () => {
  dailyCount = 0;
});

const MODEL_PRIORITY = [
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];
// ===== AI function =====
async function askGemini(prompt) {
  for (const modelName of MODEL_PRIORITY) {
    try {
      console.log("Đang thử model:", modelName);

      const model = genAI.getGenerativeModel({
        model: modelName
      });

      const result = await model.generateContent(prompt);

      console.log("Dùng thành công model:", modelName);

      return result.response.text();

    } catch (error) {
      console.error("Model lỗi:", modelName);
      console.error(error.message);

      // Nếu là lỗi quota hoặc permission → thử model tiếp theo
      continue;
    }
  }

  return "⚠ AI hiện không khả dụng. Thử lại sau nhé!";
}

// ===== Gửi chúc buổi sáng (dùng cho cron + slash command) =====
async function sendGoodMorning() {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);
  if (!channel) return null;

  const message = await askGemini(
    "Viết một lời chúc buổi sáng tích cực, ngắn gọn, truyền động lực bằng tiếng Việt."
  );

  const embed = new EmbedBuilder()
    .setColor(0xffcc00)
    .setTitle("🌅 Good Morning!")
    .setDescription(`<@${process.env.USER_ID}>\n\n${message}`)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  return true;
}

// ===== Cron chúc buổi sáng 7h (T2–CN, mỗi ngày) =====
cron.schedule("0 7 * * *", async () => {
  await sendGoodMorning();
});

client.once("ready", () => {
  console.log(`Bot online: ${client.user.tag}`);
  console.log(`Cron "chúc buổi sáng": 7h hàng ngày (múi giờ: ${process.env.TZ})`);
});

// ===== Slash command =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ask") {
    const question = interaction.options.getString("question");

    await interaction.deferReply();

    try {
      const response = await askGemini(question);
      await interaction.editReply(response);
    } catch (err) {
      console.error(err);
      await interaction.editReply("⚠ AI đang bận, thử lại sau nhé!");
    }
    return;
  }

  if (interaction.commandName === "goodmorning") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const sent = await sendGoodMorning();
      if (sent) {
        await interaction.editReply("✅ Đã gửi chúc buổi sáng vào channel!");
      } else {
        await interaction.editReply("⚠ Không tìm thấy channel, kiểm tra CHANNEL_ID.");
      }
    } catch (err) {
      console.error(err);
      await interaction.editReply("⚠ Gửi thất bại, thử lại sau nhé!");
    }
  }
});

const token = process.env.TOKEN?.trim();
if (!token) {
  console.error(
    "TOKEN không tồn tại hoặc rỗng. Kiểm tra biến môi trường (Railway: Variables → Deploy lại sau khi sửa)."
  );
  process.exit(1);
}
client.login(token);
