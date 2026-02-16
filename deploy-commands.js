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
    .setDescription("Test lời chúc buổi sáng")
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
