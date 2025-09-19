require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, '指令');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 載入所有指令並轉成 JSON 格式（SlashCommandBuilder 專用）
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
// 通過設定伺服器ID，決定只對特定伺服器增加指令
const guildIds = [
  process.env.GUILD_ID_1,
  process.env.GUILD_ID_2,
  process.env.GUILD_ID_3,
];
const validGuildIds = guildIds.filter(id => id && id.trim() !== '');

(async () => {
  for (const guildId of validGuildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands }
        // { body: [] }
      );
      console.log(`slash commands 註冊成功於 Guild ${guildId}！`);
    } catch (error) {
      console.error(`註冊 Guild ${guildId} 失敗：`, error);
    }
  }
  // 如果不想只有特定伺服器有，可以改運行下面這個。不過同步時間會慢一點，不適合測試階段使用。
  // 全域指令
  // try {
  //   await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID),{ body: commands });
  //   console.log(`slash commands 註冊成功於 Guild ${guildId}！`);
  // } catch (error) {
  //   console.error(`註冊全域指令 Guild 失敗：`, error);
  // }
})();