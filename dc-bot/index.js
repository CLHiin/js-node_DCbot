require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

// 讀取指令檔案並放進 Collection
const commandsPath = path.join(__dirname, '指令');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`已登入為 ${client.user.tag}`);
  console.log('Bot 所在的伺服器列表:');
  client.guilds.cache.forEach(guild => {
    console.log(`- ${guild.name} (ID: ${guild.id})`);
  });
  const exitGuildId = "1345399181082103848";
  client.guilds.cache.forEach(async guild => {
    if (guild.id === exitGuildId) {
      await guild.leave();
      console.log(`已自動退出舊伺服器：${guild.name}`);
    }
  });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {await command.execute(interaction);}
  catch (error) {
    console.error(error);
    await interaction.reply({ content: '執行指令時發生錯誤！', ephemeral: true });
  }
});

client.on('guildCreate', async guild => {
  console.log(`Bot 被邀請加入了伺服器：${guild.name}（ID: ${guild.id}）`);
});

client.login(process.env.DISCORD_TOKEN);
