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

      const prompt = `
Viết lời chúc buổi sáng ngắn gọn, tích cực.
Chủ đề hôm nay: ${topic}.
Truyền động lực mạnh mẽ.
`;

      const message = await askGemini(prompt);

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

    const prompt = `
Viết lời chúc buổi sáng ngắn gọn, tích cực.
Chủ đề hôm nay: ${topic}.
`;

    const message = await askGemini(prompt);

    await interaction.editReply(
      `🌞 Chào buổi sáng ${interaction.user}!\n\n${message}`
    );
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
