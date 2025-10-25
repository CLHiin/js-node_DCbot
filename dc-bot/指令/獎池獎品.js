const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const fileManager = require('../常用/檔案管理');
const { generatePrizeEmbed } = require('../常用/獎池函數');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池獎品')
    .setDescription('🎯 查看或管理獎池獎品')
    .addStringOption(option => option.setName('獎池').setDescription('選擇要設定哪個獎池')
      .setRequired(true).addChoices({ name: '常駐', value: '常駐' },{ name: '限定', value: '限定' }))
    .addIntegerOption(o => o.setName('操作').setDescription('(管理員限定)0:新增 | 1:刪除 | 2:修改'))
    .addStringOption(o => o.setName('稀有度').setDescription('可篩選顯示 SSR / SR / R 的獎項')
      .addChoices(
        { name: 'SSR', value: 'SSR' },
        { name: 'SR', value: 'SR' },
        { name: 'R', value: 'R' }
      )
    )
    .addStringOption(o => o.setName('名稱').setDescription('(新增/修改/刪除必填)獎品名稱'))
    .addBooleanOption(o => o.setName('up').setDescription('(新增/修改用)設定SSR是否為up獎品'))
    .addStringOption(o => o.setName('描述').setDescription('(新增/修改用)獎品描述'))
    .addNumberOption(o => o.setName('占比').setDescription('(新增/修改用)-1為平分剩餘占比,或者填固定概率0~100'))
    .addRoleOption(o => o.setName('身分組').setDescription('(新增/修改用)中獎給予的身分組'))
    .addAttachmentOption(o => o.setName('檔案').setDescription('(新增/修改用)中獎傳送的檔案'))
    .addStringOption(o => o.setName('特殊物件').setDescription('(新增/修改用)自訂特殊物件名稱（純文字）'))
    .addStringOption(o => o.setName('移除項目').setDescription('(修改用)選擇要移除的項目（身分組、檔案、特殊物件）')
      .addChoices(
        { name: '身分組', value: '身分組' },
        { name: '檔案', value: '檔案' },
        { name: '特殊物件', value: '特殊物件' }
      )
    )
    .addStringOption(o => o.setName('新名稱').setDescription('(修改用)獎品的新名稱')),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const member = interaction.member;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    const poolType = interaction.options.getString('獎池'); // '常駐' 或 '限定'
    const serverSettings = DataStore.get(guildId, 'serverSettings');
    serverSettings.限定獎池設定 ||= { 獎品清單: [] };
    serverSettings.常駐獎池設定 ||= { 獎品清單: [] };

    let 獎品清單 = poolType === '限定'
      ? serverSettings.限定獎池設定.獎品清單
      : serverSettings.常駐獎池設定.獎品清單;

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

    const findPrize = name => 獎品清單.find(p => p.名稱 === name);

    // 新增獎品
    async function addPrize() {
      if (!opt.名稱 || !opt.稀有度) throw '❌ 需提供名稱與稀有度。';
      if (findPrize(opt.名稱)) throw `❌ 已存在「${opt.名稱}」。請用修改操作。`;

      const newPrize = {
        名稱: opt.名稱,
        描述: opt.描述 || '',
        稀有度: opt.稀有度,
        占比: opt.占比 ?? -1,
        身分組: opt.身分組?.id ?? null,
        檔案名稱: null,
        特殊物件: opt.特殊物件?.trim() || null,
        UP: opt.UP ?? false,
      };

      if (opt.檔案) {
        try {
          const newFileName = await fileManager.saveFileFromUrl(guildId, opt.檔案.url, opt.檔案.name);
          newPrize.檔案名稱 = newFileName;
        } catch {
          throw '❌ 下載檔案失敗';
        }
      }

      獎品清單.push(newPrize);
      return `✅ 新增成功：${opt.名稱}`;
    }

    // 刪除獎品
    async function removePrize() {
      const target = findPrize(opt.名稱);
      if (!target) throw `❌ 找不到獎品「${opt.名稱}」。`;
      if (target.檔案名稱) fileManager.moveFileToTrash(guildId, target.檔案名稱);

      獎品清單 = 獎品清單.filter(p => p.名稱 !== opt.名稱);
      return `🗑️ 已移除獎品「${opt.名稱}」。`;
    }

    // 修改獎品
    async function modifyPrize() {
      const target = findPrize(opt.名稱);
      if (!target) throw `❌ 找不到獎品「${opt.名稱}」。`;

      const updateFields = {
        名稱: opt.新名稱,
        描述: opt.描述,
        稀有度: opt.稀有度,
        占比: opt.占比,
        身分組: opt.身分組?.id,
        特殊物件: opt.特殊物件?.trim(),
        UP: typeof opt.UP === 'boolean' ? opt.UP : undefined,
      };

      for (const key in updateFields) {
        if (updateFields[key] != null) target[key] = updateFields[key];
      }

      if (opt.移除項目 === '身分組') target.身分組 = null;
      else if (opt.移除項目 === '檔案') {
        if (target.檔案名稱) {
          fileManager.moveFileToTrash(guildId, target.檔案名稱);
          target.檔案名稱 = null;
        }
      } else if (opt.移除項目 === '特殊物件') target.特殊物件 = null;

      if (opt.檔案) {
        try {
          const newFileName = await fileManager.saveFileFromUrl(
            guildId,
            opt.檔案.url,
            opt.檔案.name,
            target.檔案名稱
          );
          target.檔案名稱 = newFileName;
        } catch {
          throw '❌ 下載檔案失敗';
        }
      }

      return `✅ 已修改獎品「${target.名稱}」。`;
    }

    // 主流程
    try {
      let message = '';
      if (opt.操作 === null) {
        if (!獎品清單.length) return interaction.reply({ content: `尚未設定任何${poolType}獎池獎品。`, ephemeral: true });
        const embeds = generatePrizeEmbed(獎品清單, `📋 以下是目前${poolType}獎池獎品：`, opt.稀有度);
        return interaction.reply({ embeds });
      }

      if (!isAdmin) return interaction.reply({ content: '❌ 僅限管理員可修改獎品資料。', ephemeral: true });

      if (opt.操作 === 0) message = await addPrize();
      else if (opt.操作 === 1) message = await removePrize();
      else if (opt.操作 === 2) message = await modifyPrize();
      else return interaction.reply({ content: '❌ 未知操作', ephemeral: true });

      // 更新存檔
      if (poolType === '限定') serverSettings.限定獎池設定.獎品清單 = 獎品清單;
      else serverSettings.常駐獎池設定.獎品清單 = 獎品清單;
      DataStore.update(guildId, 'serverSettings', serverSettings);

      // 回覆操作訊息
      const embeds = generatePrizeEmbed(獎品清單, `📋 操作完成，以下是目前${poolType}獎池獎品：`, opt.稀有度);
      if (embeds.length) {
        await interaction.reply({ content: message, embeds });
      } else {
        await interaction.reply({ content: message });
      }
    } catch (err) {
      await interaction.reply({ content: err.toString(), ephemeral: true });
    }
  },
};
