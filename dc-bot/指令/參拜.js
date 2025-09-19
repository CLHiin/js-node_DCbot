const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, updateUser } = require('../常用/儲存檔');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('參拜')
    .setDescription('🛐 每日參拜獲得功德(看剩餘功德)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const today = new Date().toISOString().split('T')[0];
    let user = getUser(guildId, userId, 'user');
    let sset = getUser(guildId, null, 'set');

    if (sset.參拜功德 < 0) {
      const embed = new EmbedBuilder()
        .setTitle('該伺服器沒有設定參拜功德點')
        .setDescription('請伺服器管理員使用 `/功德調整` 指令來設定每日可獲得的功德點數。')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed] });
    }
    let 參拜 = user.最後參拜日期 !== today;
    if (參拜) {
      user.參拜次數 += 1;
      user.剩餘功德 += sset.參拜功德;
      user.累積功德 += sset.參拜功德;
      user.最後參拜日期 = today;
      updateUser(guildId, userId, user);
    }
    const embed = new EmbedBuilder()
      .setTitle(參拜 ? '🔯感謝您的參拜！' : '🔯你已參拜過了！')
      .setDescription([
        `🪔 參拜功德： **${sset.參拜功德}**`,
        `📿 參拜次數： **${user.參拜次數}**`,
        `🙏 剩餘功德： **${user.剩餘功德}**`,
        `🛐 累積功德： **${user.累積功德}**`,
      ].join('\n'))
      .setFooter({ text: `最後參拜日: ${user.最後參拜日期}` })
      .setColor(0x00FF00);
    await interaction.reply({ embeds: [embed] });
  },
};
