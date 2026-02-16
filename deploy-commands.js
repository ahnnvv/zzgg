require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Hỏi AI điều gì đó")
    .addStringOption(option =>
      option.setName("question")
        .setDescription("Câu hỏi của bạn")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("goodmorning")
    .setDescription("Gửi chúc buổi sáng ngay (không cần đợi 7h)")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );
  console.log("Deploy slash command thành công!");
})();
