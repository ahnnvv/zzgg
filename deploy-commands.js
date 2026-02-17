const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Hỏi AI bất cứ điều gì")
    .addStringOption(option =>
      option.setName("question")
        .setDescription("Câu hỏi của bạn")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("goodmorning")
    .setDescription("Test lời chúc buổi sáng"),

  new SlashCommandBuilder()
    .setName("addevent")
    .setDescription("[Admin] Thêm sự kiện mới (tên + thời gian)")
    .addStringOption(option =>
      option.setName("name")
        .setDescription("Tên sự kiện")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("datetime")
        .setDescription("Thời gian (VD: 31/12/2026 23:59 hoặc 2026-12-31 23:59)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Xem countdown còn bao lâu đến sự kiện")
    .addStringOption(option =>
      option.setName("name")
        .setDescription("Tên sự kiện cần xem (chọn từ list)")
        .setRequired(true)
        .setAutocomplete(true)
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("Deploy slash command thành công!");
  } catch (error) {
    console.error(error);
  }
})();
