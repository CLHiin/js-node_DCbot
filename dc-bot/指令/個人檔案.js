const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('個人檔案')
    .setDescription('🫠 確認自己或他人的檔案')
    .addUserOption(option => option.setName('目標').setDescription('查看目標用戶，預設自己').setRequired(false))
    .addStringOption(option => option.setName('留言').setDescription('修改自己的留言，只能改自己的檔案').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const targetUser = interaction.options.getUser('目標') || interaction.user;
    const input留言 = interaction.options.getString('留言');
    const username = targetUser.username;
    const userId = targetUser.id;

    const user = DataStore.get(guildId, userId);

    // 修改留言（只能改自己的）
    if (targetUser.id === interaction.user.id && input留言) {
      user.留言 = input留言;
    }
    const 特殊物件清單 = Object.entries(user.特殊物件).sort((a, b) => {
      const len = str => [...str].reduce((acc, c) => c.charCodeAt(0) > 255 ? acc + 2 : acc + 1, 0);
      return len(b[0]) - len(a[0]);
    });
    user.特殊物件 = Object.fromEntries(特殊物件清單);
    DataStore.update(guildId, userId, user);

    const embed = new EmbedBuilder()
      .setTitle(`${username} 的個人檔案`)
      .setColor(0x00AAFF)
      .addFields(
        { 
          name: '📿 參拜與功德狀態',
          value:
            `參拜次數：${user.參拜次數}\n` +
            `剩餘功德：${user.剩餘功德}\n` +
            `累積功德：${user.累積功德}\n` +
            `最後參拜日期：${user.最後參拜日期}`,
          inline: false
        },
        { name: '💬 自訂留言', value: user.留言 || '無', inline: false },
        { 
          name: '特殊物件', 
          value: Object.entries(user.特殊物件).length > 0
            ? Object.entries(user.特殊物件).map(([k,v]) => `${k} × ${v}`).join('\n')
            : '無',
          inline: false
        },
        {
          name: '🏆 常駐獎池狀態',
          value: 
            `總抽數：${user.常駐獎池.總計抽數}\n` +
            `該期抽數：${user.限定獎池.該期抽數}\n` +
            `小保底：${user.常駐獎池.小保}\n` +
            `大保底：${user.常駐獎池.大保}`,
          inline: false
        },
        {
          name: '🎯 限定獎池狀態',
          value:
            `總抽數：${user.限定獎池.總計抽數}\n` +
            `該期抽數：${user.限定獎池.該期抽數}\n` +
            `小保底：${user.限定獎池.小保}\n` +
            `大保底：${user.限定獎池.大保}`,
          inline: false
        }
      );
    safeReply(interaction, { embeds: [embed] });
  }
};
