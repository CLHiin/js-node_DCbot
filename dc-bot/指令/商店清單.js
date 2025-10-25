const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('商店清單')
    .setDescription('🎁 顯示目前所有可兌換的商品'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sset = DataStore.get(guildId, 'serverSettings');
    const 商品清單 = sset.商品清單;
    if (!商品清單 || 商品清單.length === 0) 
      return interaction.reply('目前沒有任何商品喔！');

    // 將商品轉成欄位
    const fields = 商品清單.map(item => {
      return {
        name: `🎁 名稱：**${item.名稱}**`,
        value: [
          `📝 描述：**${item.描述 || '無'}**`,
          `💰 功德：**${item.價格} 功德**`,
          `🏷️ 身分：**${item.身分組 ? `<@&${item.身分組}>` : '無'}**`,
          `📎 檔案：**${item.檔案名稱 || '無'}**`,
          `📦 特殊物件：**${item.特殊物件 || '無'}**`
        ].join('\n'),
        inline: true
      };
    });

    const limitedFields = fields.slice(0, 25); // Discord embed 最多 25 個欄位
    const embed = new EmbedBuilder()
      .setTitle('🎉 可兌換的商品清單')
      .addFields(limitedFields)
      .setColor(0x00CC99)
      .setFooter({ text: '使用 /商店兌換 來兌換商品' });

    await interaction.reply({ embeds: [embed] });
  }
};
