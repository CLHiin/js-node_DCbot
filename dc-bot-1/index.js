require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Collection, InteractionResponseFlags } = require('discord.js');
const { DataStore } = require('./常用/儲存檔'); 
const { gitPullOnStartup } = require('./gitSync');

gitPullOnStartup(); // 同步最新資料

// ======================
// 🌐 Express Web
// ======================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const logs = [];

// ======================
// 🤖 Discord Bot 狀態
// ======================
let botStatus = 'offline'; // offline | connecting | online
let lastError = null;

// ======================
// 📜 日誌工具
// ======================
function addLog(guildId, guildName, userId, username, command, type) {
  logs.push({
    time: new Date().toISOString(),
    guildId,
    guildName: guildName || '-',
    userId,
    username: username || '-',
    command: command || '-',
    type: type || '-'
  });
}

// ======================
// 🔐 Express API
// ======================
app.post('/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) res.json({ status: 'ok' });
  else res.status(401).json({ status: 'error', message: '密碼錯誤' });
});

app.get('/data', (req, res) => {
  try {
    res.json(DataStore.getAll());
  } catch {
    res.status(500).json({ status: 'error', message: '讀取 JSON 失敗' });
  }
});

app.get('/logs', (req, res) => res.json(logs));

// ======================
// 🤖 Discord Bot
// ======================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// 載入指令
const commandsPath = path.join(__dirname, '指令');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// ======================
// 🔄 連線判斷與登入
// ======================
function isBotConnected() {
  return client?.isReady() === true;
}

async function loginBot() {
  if (isBotConnected()) return;

  botStatus = 'connecting';
  console.log('🔄 嘗試連線 Discord...');

  try {
    console.log('➡️ 呼叫 client.login()');
    await client.login(process.env.DISCORD_TOKEN);
    console.log('✅ client.login 完成');
  } catch (err) {
    botStatus = 'offline';
    lastError = err?.message || err;
    console.error('❌ Discord 登入失敗 (loginBot):', err);
  }
}

// ======================
// 監聽狀態與錯誤
// ======================
client.once('ready', () => {
  botStatus = 'online';
  lastError = null;
  console.log(`✅ 已登入為 ${client.user.tag}`);
});

client.on('error', err => {
  botStatus = 'offline';
  lastError = err.message;
  console.error('❌ Discord client error:', err);
});

client.on('invalidated', () => {
  botStatus = 'offline';
  console.error('❌ Discord session invalidated');
});


// ======================
// 🧠 Discord Interaction
// ======================
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({
      content: '⚠️ 不支援的指令名稱。',
      flags: InteractionResponseFlags.Ephemeral
    }).catch(err => {
      console.warn('⚠️ 無法回覆未知指令:', err.message);
    });
  }

  try {
    await command.execute(interaction);

    addLog(
      interaction.guildId || 'DM',
      interaction.guild ? interaction.guild.name : 'DM',
      interaction.user.id,
      interaction.user.username,
      interaction.commandName,
      'command'
    );

  } catch (err) {
    console.error('❌ 指令錯誤:', err);
  }
});

// ======================
// 🌐 Bot 狀態 API
// ======================
app.get('/status', (req, res) => {
  res.json({
    status: isBotConnected() ? 'online' : 'offline',
    lastError,
    ready: isBotConnected()
  });
});

app.post('/reconnect', async (req, res) => {
  if (!isBotConnected()) loginBot();

  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (isBotConnected()) break;
    await new Promise(r => setTimeout(r, 300));
  }

  res.json({
    status: isBotConnected() ? 'online' : 'offline',
    lastError
  });
});
// 🚀 啟動 Discord Bot
loginBot();

const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app); 
const io = new Server(server);
require('./Heist/HeistOperation')(io);
server.listen(process.env.PORT || 3000, () => {
  console.log('🌐 網站已啟動');
});

