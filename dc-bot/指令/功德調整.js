const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, updateUser } = require('../常用/儲存檔');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('功德調整')
    .setDescription('🙏 (管理員限定) 調整玩家功德或參拜功德')
    .addUserOption(option =>
      option.setName('目標')
        .setDescription('要調整功德的對象')
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('剩餘功德')
        .setDescription('要調整的剩餘功德')
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('累積功德')
        .setDescription('要調整的累積功德')
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('伺服器參拜功德')
        .setDescription('設定伺服器參拜可得功德（-1 表示禁用）')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const 目標 = interaction.options.getUser('目標');
    const 剩餘功德 = interaction.options.getNumber('剩餘功德');
    const 累積功德 = interaction.options.getNumber('累積功德');
    const 伺服器參拜功德 = interaction.options.getNumber('伺服器參拜功德');

    if (!isAdmin) {
      return interaction.reply({ content: '❌ 你沒有權限使用此指令。', ephemeral: true });
    }

    const embeds = [];

    // 調整玩家功德
    if (目標 && (剩餘功德 !== null || 累積功德 !== null)) {
      let user = getUser(guildId, 目標.id, 'user');

      const 原剩餘功德 = user.剩餘功德;
      const 原累積功德 = user.累積功德;

      if (剩餘功德 !== null) user.剩餘功德 += 剩餘功德;
      if (累積功德 !== null) user.累積功德 += 累積功德;

      updateUser(guildId, 目標.id, user);

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

    // 設定伺服器參拜功德
    if (伺服器參拜功德 !== null) {
      let config = getUser(guildId, null, 'set');
      const 原設定 = config.參拜功德;
      config.參拜功德 = 伺服器參拜功德;
      updateUser(guildId, null, config);

      embeds.push(new EmbedBuilder()
        .setTitle('⚙️ 伺服器設定更新')
        .setDescription(`🪔 參拜功德：${原設定} → ${config.參拜功德}`)
        .setColor(0xFFD700));
    }

    // 如果沒做任何事
    if (embeds.length === 0) {
      return interaction.reply({ content: 'ℹ️ 請至少提供一個修改參數（玩家或伺服器設定）。', ephemeral: true });
    }

    return interaction.reply({ embeds });
  },
};
