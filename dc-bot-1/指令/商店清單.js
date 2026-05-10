// 指令/商店.js
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');
const fileManager = require('../常用/檔案管理');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('商店清單')
    .setDescription('🎁 查看商店或兌換商品')
    .addStringOption(opt => opt.setName('商品名稱').setDescription('不填則顯示商店清單').setRequired(false))
    .addUserOption  (opt => opt.setName('給予目標').setDescription('要幫誰兌換(預設自己)').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const serverData = DataStore.get(guildId, 'serverSettings');
    const 商品清單 = serverData?.商品清單 || [];

    const 商品名稱 = interaction.options.getString('商品名稱');
    const 指定用戶 = interaction.options.getUser('給予目標') || interaction.user;
    const 呼叫者ID = interaction.user.id;

    // === 沒輸入名稱 → 顯示清單 ===
    if (!商品名稱) {
      if (商品清單.length == 0) return safeReply(interaction, { content: '目前沒有任何商品喔！' });
      const fields = 商品清單.slice(0, 25).map(item => ({
        name: `🎁 ${item.名稱}`,
        value: [
          `📝 描述：**${item.描述 || '無'}**`,
          `💰 價格：**${item.價格} 功德**`,
          `📌 附帶：${item.身分組?`🏷️ <@&${item.身分組}> `:'' + 
            (item.檔案名稱?`📎 ${item.檔案名稱} `:'') +
            (item.特殊物件?`❇️ ${item.特殊物件}`:'')}`
        ].join('\n'),
        inline: true
      }));

      const embed = new EmbedBuilder()
        .setTitle('🎉 可兌換的商品清單')
        .addFields(fields)
        .setColor(0x00CC99)
        .setFooter({ text: '使用 /商店清單 名稱:<商品名稱> 來兌換' });
      return safeReply(interaction, { embeds: [embed] }); 
    }

    // === 有輸入名稱 → 執行兌換 ===
    const 商品 = 商品清單.find(i => i.名稱 === 商品名稱);
    if (!商品) return safeReply(interaction, { content: `❌ 找不到名稱為「${商品名稱}」的商品。`, ephemeral: true }); 

    const 付款者資料 = DataStore.get(guildId, 呼叫者ID);
    const 受贈者資料 = DataStore.get(guildId, 指定用戶.id);

    if (付款者資料.剩餘功德 < 商品.價格) return safeReply(interaction, {
        content: `⚠️ 功德不足，需 **${商品.價格}**，目前只有 **${付款者資料.剩餘功德}**。`,
        ephemeral: true
      });

    // 扣功德
    付款者資料.剩餘功德 -= 商品.價格;
    DataStore.update(guildId, 呼叫者ID, 付款者資料);

    // 特殊物件處理
    if (商品.特殊物件) {
      受贈者資料.特殊物件[商品.特殊物件] =
        (受贈者資料.特殊物件[商品.特殊物件] || 0) + 1;
      DataStore.update(guildId, 指定用戶.id, 受贈者資料);
    }

    // === Embed ===
    const embed = new EmbedBuilder()
      .setTitle('🎉 兌換成功')
      .setDescription([
        `🎁 名稱：**${商品.名稱}**`,
        `📝 描述：**${商品.描述 || '無'}**`,
        `💰 消耗：**${商品.價格} 功德（剩餘 ${付款者資料.剩餘功德}）**`,
        `👤 對象：**<@${指定用戶.id}>**`,
        `📌 附帶：${商品.身分組?`🏷️ <@&${商品.身分組}> `:'' + 
          (商品.檔案名稱?`📎 ${商品.檔案名稱} `:'') +
          (商品.特殊物件?`❇️ ${商品.特殊物件}`:'')}`
      ].join('\n'))
      .setColor(0x00CC99)
      .setFooter({ text: '感謝您的購買 🙏' });

    // === 發送 Embed ===
    safeReply(interaction, { embeds: [embed] });

    // === 檔案處理：若有則私訊發送 ===
    if (商品.檔案名稱) {
      const filePath = fileManager.getFilePath(guildId, 商品.檔案名稱);
      if (fs.existsSync(filePath)) {
        try {
          指定用戶.send({
            content: `📎 您收到商品 **${商品.名稱}** 的專屬檔案：`,
            files: [new AttachmentBuilder(filePath)]
          });
        } catch {
          console.warn(`⚠️ 無法傳送私訊給 ${指定用戶.tag}`);
        }
      }
    }

    // === 若有身分組則給予/移除 ===
    if (商品.身分組) {
      const member = await interaction.guild.members.fetch(指定用戶.id).catch(() => null);
      const role = interaction.guild.roles.cache.get(商品.身分組);
      if (member && role) member.roles.cache.has(role.id) 
        ? member.roles.remove(role).catch(console.error) 
        : member.roles.add(role).catch(console.error);
    }
  }
};
