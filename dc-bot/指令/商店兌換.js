const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const fileManager = require('../常用/檔案管理');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('商店兌換')
    .setDescription('🎁 兌換一項商品(可兌換給別人)')
    .addStringOption(option => option.setName('名稱').setDescription('欲兌換的商品名稱').setRequired(true))
    .addUserOption(option => option.setName('目標').setDescription('要幫誰兌換（預設是自己）').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const 呼叫者ID = interaction.user.id;
    const 指定用戶 = interaction.options.getUser('目標') || interaction.user;

    const 商品名稱 = interaction.options.getString('名稱');
    const serverData = DataStore.get(guildId, 'serverSettings');
    const 付款者資料 = DataStore.get(guildId, 呼叫者ID);
    const 商品 = serverData.商品清單.find(item => item.名稱 === 商品名稱);

    if (!商品)
      return interaction.reply({ content: `❌ 找不到名稱為「${商品名稱}」的商品。`, ephemeral: true });
    if (付款者資料.剩餘功德 < 商品.價格) 
      return interaction.reply({
        content: `⚠️ 你的功德不足，需 **${商品.價格}**，目前只有 **${付款者資料.剩餘功德}**。`,
        ephemeral: true
      });

    // 扣除呼叫者的功德
    付款者資料.剩餘功德 -= 商品.價格;
    DataStore.update(guildId, 呼叫者ID, 付款者資料);

    // 準備 embed
    const embed = new EmbedBuilder()
      .setTitle('🎉 兌換成功')
      .setDescription([
        `🎁 名稱：**${商品.名稱}**`,
        `📝 描述：**${商品.描述 || '無'}**`,
        `💰 消耗：**${商品.價格} 功德（剩餘 ${付款者資料.剩餘功德}）**`,
        `👤 對象：**<@${指定用戶.id}>**`,
        `🏷️ 身分：**${商品.身分組 ? `<@&${商品.身分組}>` : '無'}**`,
        `📎 檔案：**${商品.檔案名稱 || '無'}**`,
        `❇️ 特殊物件：**${商品.特殊物件 || '無'}**`,
      ].join('\n'))
      .setColor(0x00CC99)
      .setFooter({ text: '感謝您的購買 🙏' });

    // 附件（若有）
    let files = [];
    if (商品.檔案名稱) {
      const filePath = fileManager.getFilePath(guildId, 商品.檔案名稱);
      if (fs.existsSync(filePath)) {
        files.push(new AttachmentBuilder(filePath));
      }
    }

    // 特殊物件處理
    if (商品.特殊物件) {
      const 受贈者資料 = DataStore.get(guildId, 指定用戶.id);
      const 現有數量 = 受贈者資料.特殊物件[商品.特殊物件] || 0;
      受贈者資料.特殊物件[商品.特殊物件] = 現有數量 + 1;
      DataStore.update(guildId, 指定用戶.id, 受贈者資料);
    }

    // 判斷自己 or 別人
    if (指定用戶.id === 呼叫者ID) {
      // 自己 → 公開顯示
      await interaction.reply({ embeds: [embed], files });
    } else {
      // 別人 → 私訊對方 (embed+檔案一起送一次)
      try {
        await 指定用戶.send({ embeds: [embed], files });
        await interaction.reply({ content: `✅ 已成功將商品送給 <@${指定用戶.id}> (已透過私訊通知)`, ephemeral: true });
      } catch {
        await interaction.reply({ content: `⚠️ 無法傳送私訊給 <@${指定用戶.id}>。`, ephemeral: true });
      }
    }

    // 給身分組
    if (商品.身分組) {
      const member = await interaction.guild.members.fetch(指定用戶.id).catch(() => null);
      const role = interaction.guild.roles.cache.get(商品.身分組);
      if (member && role) {
        await member.roles.add(role).catch(console.error);
      }
    }
  }
};
