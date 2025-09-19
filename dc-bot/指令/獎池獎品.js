const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, updateUser } = require('../常用/儲存檔');
const fileManager = require('../常用/檔案管理');

function createPrizeReply(interaction, 獎品清單, content, ephemeral = false, filterRarity = null) {
  const embed = new EmbedBuilder().setTitle('🎯 當前獎池獎品').setColor(0x3399FF);
  const RARITIES = ['SSR', 'SR', 'R'];
  const raritiesToShow = filterRarity && RARITIES.includes(filterRarity) ? [filterRarity] : RARITIES;

  for (const rarity of raritiesToShow) {
    const group = 獎品清單.filter(i => i.稀有度 === rarity);
    if (!group.length) continue;

    embed.addFields({
      name: `⭐ 【${rarity}】（${group.length} 個獎品）`,
      value: '⬇ 以下為此稀有度的獎品 ⬇',
      inline: false,
    });

    const 固定總 = group.reduce((sum, i) => sum + (i.占比 >= 0 ? i.占比 : 0), 0);
    const 平分數 = group.filter(i => i.占比 === -1).length;
    const 平分占比 = 平分數 ? Math.max(0, (100 - 固定總) / 平分數) : 0;

    for (const i of group) {
      const 占比文字 = i.占比 >= 0 ? i.占比.toFixed(2) + '%' : `${平分占比.toFixed(2)}%(平分)`;
      const 特殊物件文字 = i.特殊物件 || '無';

      embed.addFields({
        name: `🎁 ${i.名稱}`,
        value: [
          `📈 概率：${i.UP ? '【UP】' : ''}${占比文字}`,
          `📝 描述：${i.描述 || '無'}`,
          `🏷️ 身分：${i.身分組 ? `<@&${i.身分組}>` : '無'}`,
          `📎 檔案：${i.檔案名稱 || '無'}`,
          `✨ 特殊：${特殊物件文字}`,
        ].join('\n'),
        inline: true,
      });
    }
  }

  return { content, embeds: [embed], ephemeral };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池獎品')
    .setDescription('🎲 查看或管理獎池獎品')
    .addStringOption(o =>
      o.setName('稀有度')
        .setDescription('可篩選顯示 SSR / SR / R 的獎項')
        .addChoices(
          { name: 'SSR', value: 'SSR' },
          { name: 'SR', value: 'SR' },
          { name: 'R', value: 'R' }
        )
        .setRequired(false)
    )
    .addIntegerOption(o => o.setName('操作').setDescription('(管理員限定)0:新增 | 1:刪除 | 2:修改').setRequired(false))
    .addStringOption(o => o.setName('名稱').setDescription('(新增/修改/刪除必填)獎品名稱').setRequired(false))
    .addBooleanOption(o => o.setName('up').setDescription('(新增/修改用)設定SSR是否為up獎品').setRequired(false))
    .addStringOption(o => o.setName('描述').setDescription('(新增/修改用)獎品描述').setRequired(false))
    .addNumberOption(o => o.setName('占比').setDescription('(新增/修改用)-1為平分剩餘占比,或者填固定概率0~100').setRequired(false))
    .addRoleOption(o => o.setName('身分組').setDescription('(新增/修改用)中獎給予的身分組').setRequired(false))
    .addAttachmentOption(o => o.setName('檔案').setDescription('(新增/修改用)中獎傳送的檔案').setRequired(false))
    .addStringOption(o => o.setName('特殊物件').setDescription('(新增/修改用)自訂特殊物件名稱（純文字）').setRequired(false))
    .addStringOption(o =>
      o.setName('移除項目')
        .setDescription('(修改用)選擇要移除的項目（身分組、檔案、特殊物件）')
        .addChoices(
          { name: '身分組', value: '身分組' },
          { name: '檔案', value: '檔案' },
          { name: '特殊物件', value: '特殊物件' },
        )
        .setRequired(false)
    )
    .addStringOption(o => o.setName('新名稱').setDescription('(修改用)獎品的新名稱').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const member = interaction.member;
    const opt = {
      操作: interaction.options.getInteger('操作'),
      名稱: interaction.options.getString('名稱'),
      新名稱: interaction.options.getString('新名稱'),
      UP: interaction.options.getBoolean('up'),
      描述: interaction.options.getString('描述'),
      稀有度: interaction.options.getString('稀有度'),
      占比: interaction.options.getNumber('占比'),
      身分組: interaction.options.getRole('身分組'),
      檔案: interaction.options.getAttachment('檔案'),
      特殊物件: interaction.options.getString('特殊物件'),
      移除項目: interaction.options.getString('移除項目'),
    };

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const serverData = getUser(guildId, null, 'set');
    const 獎品清單 = serverData.獎池設定.獎品清單;

    let message = '';

    if (opt.操作 === null) {
      if (!獎品清單.length)
        return interaction.reply({ content: '尚未設定任何獎品。', ephemeral: true });

      const reply = createPrizeReply(interaction, 獎品清單, '📋 以下是目前獎池獎品：', true, opt.稀有度);
      return interaction.reply(reply);
    }

    if (!isAdmin) {
      return interaction.reply({ content: '❌ 僅限管理員可修改獎品資料。', ephemeral: true });
    }

    const 找到 = opt.名稱 ? 獎品清單.find(i => i.名稱 === opt.名稱) : null;
    const parsedSpecial = opt.特殊物件 ? opt.特殊物件.trim() : null;

    if (opt.操作 === 0) {
      if (!opt.名稱 || !opt.稀有度)
        return interaction.reply({ content: '❌ 需提供名稱與稀有度。', ephemeral: true });

      if (找到)
        return interaction.reply({ content: `❌ 已存在「${opt.名稱}」。請用修改操作。`, ephemeral: true });

      const newPrize = {
        名稱: opt.名稱,
        描述: opt.描述 || '',
        稀有度: opt.稀有度,
        占比: opt.占比 ?? -1,
        身分組: opt.身分組?.id ?? null,
        檔案名稱: null,
        特殊物件: parsedSpecial,
        UP: opt.UP ?? false,
      };

      if (opt.檔案) {
        try {
          const newFileName = await fileManager.saveFileFromUrl(guildId, opt.檔案.url, opt.檔案.name);
          newPrize.檔案名稱 = newFileName;
        } catch (error) {
          console.error('下載獎品檔案失敗:', error);
          return interaction.reply({ content: '❌ 下載獎品檔案失敗，請稍後再試。', ephemeral: true });
        }
      }

      獎品清單.push(newPrize);
      message = `✅ 新增成功：${opt.名稱}`;
    }

    else if (opt.操作 === 1) {
      if (!找到)
        return interaction.reply({ content: `❌ 找不到獎品「${opt.名稱}」。`, ephemeral: true });

      if (找到.檔案名稱) {
        fileManager.moveFileToTrash(guildId, 找到.檔案名稱);
      }

      serverData.獎池設定.獎品清單 = 獎品清單.filter(i => i.名稱 !== opt.名稱);
      message = `🗑️ 已移除獎品「${opt.名稱}」。`;
    }

    else if (opt.操作 === 2) {
      if (!找到)
        return interaction.reply({ content: `❌ 找不到獎品「${opt.名稱}」。`, ephemeral: true });

      if (opt.新名稱) 找到.名稱 = opt.新名稱;
      if (opt.描述 !== null) 找到.描述 = opt.描述;
      if (opt.稀有度 && ['SSR', 'SR', 'R'].includes(opt.稀有度)) 找到.稀有度 = opt.稀有度;
      if (opt.占比 !== null) 找到.占比 = opt.占比;
      if (opt.身分組) 找到.身分組 = opt.身分組.id;

      // 根據移除項目欄位移除對應資料
      if (opt.移除項目 === '身分組') {
        找到.身分組 = null;
      } else if (opt.移除項目 === '檔案') {
        if (找到.檔案名稱) {
          fileManager.moveFileToTrash(guildId, 找到.檔案名稱);
          找到.檔案名稱 = null;
        }
      } else if (opt.移除項目 === '特殊物件') {
        找到.特殊物件 = null;
      }

      if (opt.檔案) {
        try {
          const newFileName = await fileManager.saveFileFromUrl(
            guildId,
            opt.檔案.url,
            opt.檔案.name,
            找到.檔案名稱
          );
          找到.檔案名稱 = newFileName;
        } catch (error) {
          console.error('下載獎品檔案失敗:', error);
          return interaction.reply({ content: '❌ 下載獎品檔案失敗，請稍後再試。', ephemeral: true });
        }
      }

      if (parsedSpecial !== null) 找到.特殊物件 = parsedSpecial;
      if (typeof opt.UP === 'boolean') 找到.UP = opt.UP;

      message = `✅ 已修改獎品「${找到.名稱}」。`;
    }

    else {
      return interaction.reply({ content: '❌ 未知操作。', ephemeral: true });
    }

    updateUser(guildId, null, serverData);
    await interaction.reply({ content: message, ephemeral: false });

    if (serverData.獎池設定.獎品清單.length) {
      const reply = createPrizeReply(interaction, serverData.獎池設定.獎品清單, '📋 操作完成，以下是目前獎池獎品：', false, opt.稀有度);
      await interaction.followUp(reply);
    }
  },
};
