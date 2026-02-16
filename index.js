require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");

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
});

client.login(process.env.DISCORD_BOT_TOKEN);
