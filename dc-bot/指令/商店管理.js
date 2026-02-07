const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');
const fileManager = require('../常用/檔案管理');

/* ========= 工具 ========= */

async function handleFileUpdate({ guildId, item, remove, attachment }) {
  if (!remove && !attachment) return;

  if (item.檔案名稱) {
    await fileManager.moveFileToTrash(guildId, item.檔案名稱);
  }

  item.檔案名稱 = attachment
    ? await fileManager.saveFileFromUrl(guildId, attachment.url, attachment.name)
    : null;
}

/* ========= 指令 ========= */

module.exports = {
  data: new SlashCommandBuilder()
    .setName('商店管理')
    .setDescription('🎁 新增、修改或刪除商品(管理員限定)')
    .addIntegerOption(o => o.setName('操作').setDescription('(管理員限定)0:新增 | 1:刪除 | 2:修改').setRequired(true))
    .addStringOption(o => o.setName('名稱').setDescription('(新增/修改/刪除必填)商品名稱').setRequired(true))
    .addStringOption(o => o.setName('描述').setDescription('(新增必填/修改用)商品描述').setRequired(false))
    .addNumberOption(o => o.setName('價格').setDescription('(新增必填/修改用)所需功德').setRequired(false))
    .addRoleOption(o => o.setName('身分組').setDescription('(新增/修改用)給身分組').setRequired(false))
    .addAttachmentOption(o => o.setName('檔案').setDescription('(新增/修改用)附加檔案').setRequired(false))
    .addStringOption(o => o.setName('特殊物件').setDescription('(新增/修改用)特殊物件名稱').setRequired(false))
    .addStringOption(o => o.setName('新名稱').setDescription('(修改用)修改後的新名稱').setRequired(false))
    .addStringOption(o => 
      o.setName('移除項目')
       .setDescription('(修改用)選擇要移除的項目（身分組、檔案、特殊物件）')
       .addChoices(
         { name: '身分組', value: '身分組' },
         { name: '檔案', value: '檔案' },
         { name: '特殊物件', value: '特殊物件' },
       )
       .setRequired(false)
    ),

  async execute(interaction) {
    /* ===== 權限 ===== */
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return safeReply(interaction, { content: '❌ 你沒有權限使用此指令。', ephemeral: true });
    }

    /* ===== 參數 ===== */
    const guildId = interaction.guildId;
    const opt = interaction.options;

    const 操作 = opt.getInteger('操作');
    const 名稱 = opt.getString('名稱');
    const 描述 = opt.getString('描述');
    const 價格 = opt.getNumber('價格');
    const 身分組 = opt.getRole('身分組')?.id || null;
    const 附檔案 = opt.getAttachment('檔案');
    const 特殊物件 = opt.getString('特殊物件') || null;
    const 新名稱 = opt.getString('新名稱');
    const 移除項目 = opt.getString('移除項目');

    const sset = DataStore.get(guildId, 'serverSettings');
    const list = sset.商品清單;
    const findItem = list.find(i => i.名稱 === 名稱);

    /* ===== 操作處理 ===== */

    const handlers = {
      /* === 新增 === */
      0: async () => {
        if (findItem)
          return safeReply(interaction, { content: '❌ 商品名稱已存在', ephemeral: true });
        if (!描述 || 價格 == null)
          return safeReply(interaction, { content: '❌ 新增需填寫：描述、價格', ephemeral: true });

        const newItem = { 名稱, 描述, 價格, 身分組, 特殊物件, 檔案名稱: null };
        if (附檔案) newItem.檔案名稱 = await fileManager.saveFileFromUrl(guildId, 附檔案.url, 附檔案.name);

        list.push(newItem);
        DataStore.update(guildId, 'serverSettings', sset);

        return safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setTitle('🎉 成功新增商品')
              .setColor(0x00cc99)
              .setDescription([
                `🎁 名稱：**${newItem.名稱}**`,
                `📝 描述：**${newItem.描述}**`,
                `💰 價格：**${newItem.價格}**`,
                `🏷️ 身分組：**${newItem.身分組 ? `<@&${newItem.身分組}>` : '無'}**`,
                `📎 檔案：**${newItem.檔案名稱 || '無'}**`,
                `📦 特殊物件：**${newItem.特殊物件 || '無'}**`,
              ].join('\n')),
          ],
        });
      },

      /* === 刪除 === */
      1: async () => {
        if (!findItem) return safeReply(interaction, { content: '❌ 找不到商品', ephemeral: true });
        if (findItem.檔案名稱) await fileManager.moveFileToTrash(guildId, findItem.檔案名稱);
        sset.商品清單 = list.filter(i => i !== findItem);
        DataStore.update(guildId, 'serverSettings', sset);
        return safeReply(interaction, { content: `🗑️ 已刪除「${名稱}」` });
      },

      /* === 修改 === */
      2: async () => {
        if (!findItem) return safeReply(interaction, { content: '❌ 找不到商品', ephemeral: true });
        if (新名稱 && list.some(i => i !== findItem && i.名稱 === 新名稱))
          return safeReply(interaction, { content: '❌ 新名稱已存在', ephemeral: true });

        /* 條件更新 */
        const updates = { 名稱: 新名稱, 描述, 價格, 身分組, 特殊物件 };

        for (const [key, value] of Object.entries(updates)) {
          if (value != null) findItem[key] = value;
        }

        /* 移除項目 */
        const removeMap = {
          身分組: () => (findItem.身分組 = null),
          特殊物件: () => (findItem.特殊物件 = null),
        };
        removeMap[移除項目]?.();

        /* 檔案 */
        await handleFileUpdate({
          guildId,
          item: findItem,
          remove: 移除項目 == '檔案',
          attachment: 附檔案,
        });

        DataStore.update(guildId, 'serverSettings', sset);

        return safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ 商品已更新')
              .setColor(0x3399ff)
              .setDescription([
                `🎁 名稱：**${findItem.名稱}**`,
                `📝 描述：**${findItem.描述 || '無'}**`,
                `💰 價格：**${findItem.價格}**`,
                `🏷️ 身分組：**${findItem.身分組 ? `<@&${findItem.身分組}>` : '無'}**`,
                `📎 檔案：**${findItem.檔案名稱 || '無'}**`,
                `📦 特殊物件：**${findItem.特殊物件 || '無'}**`,
              ].join('\n')),
          ],
        });
      },
    };

    const handler = handlers[操作];
    if (!handler) return safeReply(interaction, { content: '❌ 無效操作碼', ephemeral: true });
    try {
      await handler();
    } catch (err) {
      console.error(err);
      return safeReply(interaction, { content: '❌ 發生錯誤，請稍後再試。', ephemeral: true });
    }
  },
};
