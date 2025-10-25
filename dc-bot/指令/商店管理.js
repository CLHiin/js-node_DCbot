const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const fileManager = require('../常用/檔案管理'); // 僅檔案用

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
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ 你沒有權限使用此指令。', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const 操作 = interaction.options.getInteger('操作');
    const 名稱 = interaction.options.getString('名稱');
    const 描述 = interaction.options.getString('描述');
    const 價格 = interaction.options.getNumber('價格');
    const 身分組 = interaction.options.getRole('身分組');
    const 附檔案 = interaction.options.getAttachment('檔案');
    const 特殊物件 = interaction.options.getString('特殊物件');
    const 新名稱 = interaction.options.getString('新名稱');
    const 移除項目 = interaction.options.getString('移除項目');

    const sset = DataStore.get(guildId, 'serverSettings');
    const list = sset.商品清單;
    const findItem = list.find(p => p.名稱 === 名稱);

    try {
      if (操作 === 0) {
        // 新增
        if (!描述 || 價格 === undefined || 價格 === null) 
          return interaction.reply({ content: '❌ 新增時必填：描述、價格', ephemeral: true });

        let 新品名稱 = 名稱;
        const 重複數 = list.filter(item => item.名稱.startsWith(名稱)).length;
        if (重複數 > 0) 新品名稱 += ` (${重複數 + 1})`;

        const newItem = {
          名稱: 新品名稱,
          描述,
          價格,
          身分組: 身分組 ? 身分組.id : null,
          檔案名稱: null,
          特殊物件: 特殊物件 || null,
        };

        if (附檔案) {
          newItem.檔案名稱 = await fileManager.saveFileFromUrl(guildId, 附檔案.url, 附檔案.name);
        }

        list.push(newItem);
        DataStore.update(guildId, null, sset);

        const embed = new EmbedBuilder()
          .setTitle('🎉 成功新增商品')
          .setDescription([
            `🎁 名稱：**${新品名稱}**`,
            `📝 描述：**${描述}**`,
            `💰 功德：**${價格}**`,
            `🏷️ 身分組：**${身分組 ? `<@&${身分組.id}>` : '無'}**`,
            `📎 檔案：**${newItem.檔案名稱 || '無'}**`,
            `📦 特殊物件：**${newItem.特殊物件 || '無'}**`
          ].join('\n'))
          .setColor(0x00CC99);

        return interaction.reply({ embeds: [embed] });
      }

      if (!findItem) {
        return interaction.reply({ content: `❌ 找不到名稱為「${名稱}」的商品。`, ephemeral: true });
      }

      if (操作 === 1) {
        // 刪除
        if (findItem.檔案名稱) await fileManager.moveFileToTrash(guildId, findItem.檔案名稱);
        sset.商品清單 = list.filter(item => item !== findItem);
        DataStore.update(guildId, null, sset);
        return interaction.reply({ content: `🗑️ 已刪除「${名稱}」` });
      }

      if (操作 === 2) {
        // 修改
        if (新名稱 && list.some(p => p !== findItem && p.名稱 === 新名稱)) {
          return interaction.reply({ content: `❌ 已存在名稱「${新名稱}」`, ephemeral: true });
        }

        if (新名稱) findItem.名稱 = 新名稱;
        if (描述) findItem.描述 = 描述;
        if (價格 !== undefined && 價格 !== null) findItem.價格 = 價格;
        if (身分組) findItem.身分組 = 身分組.id;

        // 處理移除項目
        if (移除項目 === '身分組') findItem.身分組 = null;
        if (移除項目 === '檔案' && findItem.檔案名稱) {
          await fileManager.moveFileToTrash(guildId, findItem.檔案名稱);
          findItem.檔案名稱 = null;
        }
        if (移除項目 === '特殊物件') findItem.特殊物件 = null;

        // 更新檔案
        if (附檔案) {
          if (findItem.檔案名稱) await fileManager.moveFileToTrash(guildId, findItem.檔案名稱);
          findItem.檔案名稱 = await fileManager.saveFileFromUrl(guildId, 附檔案.url, 附檔案.name);
        }
        // 特殊物件直接更新欄位，不操作檔案
        if (特殊物件) findItem.特殊物件 = 特殊物件;

        DataStore.update(guildId, null, sset);

        const embed = new EmbedBuilder()
          .setTitle('✅ 商品已更新')
          .setDescription([
            `🎁 名稱：**${findItem.名稱}**`,
            `📝 描述：**${findItem.描述 || '無'}**`,
            `💰 價格：**${findItem.價格}**`,
            `🏷️ 身分組：**${findItem.身分組 ? `<@&${findItem.身分組}>` : '無'}**`,
            `📎 檔案：**${findItem.檔案名稱 || '無'}**`,
            `📦 特殊物件：**${findItem.特殊物件 || '無'}**`
          ].join('\n'))
          .setColor(0x3399FF);

        return interaction.reply({ embeds: [embed] });
      }

      return interaction.reply({ content: '❌ 無效操作碼 (0:新增,1:刪除,2:修改)', ephemeral: true });

    } catch (err) {
      console.error(err);
      return interaction.reply({ content: '❌ 發生錯誤，請稍後再試。', ephemeral: true });
    }
  },
};
