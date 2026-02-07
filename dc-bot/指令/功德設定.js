const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('功德設定')
    .setDescription('🙏 調整玩家功德或參拜功德(管理員限定)')
    .addUserOption  (option => option.setName('目標').setDescription('要調整功德的對象'))
    .addNumberOption(option => option.setName('剩餘功德').setDescription('對剩餘功德的增減'))
    .addNumberOption(option => option.setName('累積功德').setDescription('對累積功德的增減'))
    .addNumberOption(option => option.setName('伺服器參拜功德').setDescription('設定伺服器參拜可得功德（-1 表示禁用）')),

  async execute(interaction) {
    // 權限檢查
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return safeReply(interaction, { content: '❌ 你沒有權限使用此指令。', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const 目標 = interaction.options.getUser('目標');
    const 剩餘功德 = interaction.options.getNumber('剩餘功德');
    const 累積功德 = interaction.options.getNumber('累積功德');
    const 伺服器參拜功德 = interaction.options.getNumber('伺服器參拜功德');

    const embeds = [];

    // ===== 調整玩家功德 =====
    if (目標 && (剩餘功德 != null || 累積功德 != null)) {
      const userId = 目標.id;
      const user = DataStore.get(guildId, userId);

      const 原剩餘功德 = user.剩餘功德;
      const 原累積功德 = user.累積功德;

      if (剩餘功德 != null) user.剩餘功德 += 剩餘功德;
      if (累積功德 != null) user.累積功德 += 累積功德;

      DataStore.update(guildId, userId, user);

      embeds.push(new EmbedBuilder()
        .setTitle('🧘 功德調整結果')
        .setDescription([
          `👤 對象：${目標}`,
          `💠 剩餘功德：${原剩餘功德} → ${user.剩餘功德}`,
          `🔷 累積功德：${原累積功德} → ${user.累積功德}`,
        ].join('\n'))
        .setFooter({ text: `📅 最後參拜日：${user.最後參拜日期 || '無'}` })
        .setColor(0x00FF00)
      );
    }

    // ===== 設定伺服器參拜功德 =====
    if (伺服器參拜功德 != null) {
      const config = DataStore.get(guildId, 'serverSettings');
      const 原設定 = config.參拜功德;

      config.參拜功德 = 伺服器參拜功德;
      DataStore.update(guildId, 'serverSettings', config);

      embeds.push(new EmbedBuilder()
        .setTitle('⚙️ 伺服器設定更新')
        .setDescription(`🪔 參拜功德：${原設定} → ${config.參拜功德}`)
        .setColor(0xFFD700)
      );
    }

    // ===== 如果沒提供任何參數，顯示伺服器設定 =====
    if (embeds.length === 0) {
      const config = DataStore.get(guildId, 'serverSettings');

      embeds.push(new EmbedBuilder()
        .setTitle('📊 伺服器功德設定')
        .setDescription(`🪔 目前參拜功德：${config.參拜功德}`)
        .setColor(0x3399FF)
      );
    }

    safeReply(interaction, { embeds });
  },
};
