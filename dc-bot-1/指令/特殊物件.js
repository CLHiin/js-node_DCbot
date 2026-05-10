const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('特殊物件')
    .setDescription('❇️ 查詢或增減玩家的特殊物件')
    .addUserOption(option => option.setName('目標').setDescription('指定目標玩家，預設自己').setRequired(false))
    .addStringOption(option => option.setName('物件名稱').setDescription('要修改的特殊物件名稱（不填表示只查詢）').setRequired(false))
    .addIntegerOption(option => option.setName('數量').setDescription('增加正數，減少負數（不填表示只查詢）').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const targetUser = interaction.options.getUser('目標') || interaction.user;
    const userId = targetUser.id;

    const 物件名稱 = interaction.options.getString('物件名稱');
    const 數量 = interaction.options.getInteger('數量');

    // 如果是要修改，則檢查權限
    if ((物件名稱 !== null && 物件名稱 !== undefined) && (數量 !== null && 數量 !== undefined)) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {      
        return safeReply(interaction, { content: '❌ 你沒有權限使用此指令來修改特殊物件。', ephemeral: true });
      }
    }

    // 取得用戶資料，初始化特殊物件為空物件
    const user = DataStore.get(guildId, userId);

    let 操作訊息 = '';

    if ((物件名稱 !== null && 物件名稱 !== undefined) && (數量 !== null && 數量 !== undefined)) {
      // 修改特殊物件數量
      const 現有數量 = user.特殊物件[物件名稱] || 0;
      const 新數量 = 現有數量 + 數量;

      if (新數量 > 0) {
        user.特殊物件[物件名稱] = 新數量;
        操作訊息 = `✅ 對【${物件名稱}】${數量 > 0 ? '增加' : '減少'}了 ${Math.abs(數量)}，目前數量：${新數量}`;
      } else {
        delete user.特殊物件[物件名稱];
        操作訊息 = `🗑️ 【${物件名稱}】數量減少了 ${Math.abs(數量)}，已被刪除（數量歸零或以下）`;
      }

      // 儲存回檔案
      DataStore.update(guildId, userId, user);
    } else {
      操作訊息 = '🔍 查詢特殊物件清單（無修改）';
    }

    // 準備要顯示的特殊物件列表
    const 特殊物件清單 = Object.entries(user.特殊物件);
    const 特殊物件描述 = 特殊物件清單.length > 0
      ? 特殊物件清單.map(([k, v]) => `${k} × ${v}`).join('\n') : '無';
    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.username} 的特殊物件`)
      .setColor(0x00AAFF)
      .setDescription(`${操作訊息}\n\n目前特殊物件：\n${特殊物件描述}`);
    safeReply(interaction, { embeds: [embed] });
  }
};
