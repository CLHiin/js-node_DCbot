const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { generatePrizeEmbed } = require('../常用/獎池函數');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');
const fileManager = require('../常用/檔案管理');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池獎品')
    .setDescription('🎯 查看或管理獎池獎品')
    .addStringOption(opt => opt.setName('獎池').setDescription('選擇要設定哪個獎池').setRequired(true)
      .addChoices({ name: '常駐', value: '常駐' }, { name: '限定', value: '限定' }))
    .addIntegerOption(opt => opt.setName('操作').setDescription('(管理員限定)0:新增 | 1:刪除 | 2:修改'))
    .addStringOption(opt => opt.setName('稀有度').setDescription('SSR / SR / R')
      .addChoices({ name: 'SSR', value: 'SSR' }, { name: 'SR', value: 'SR' }, { name: 'R', value: 'R' }))
    .addStringOption(opt => opt.setName('名稱').setDescription('獎品名稱'))
    .addStringOption(opt => opt.setName('新名稱').setDescription('修改後的新名稱'))
    .addBooleanOption(opt => opt.setName('up').setDescription('SSR 是否為 UP'))
    .addStringOption(opt => opt.setName('描述').setDescription('獎品描述'))
    .addNumberOption(opt => opt.setName('占比').setDescription('固定概率或 -1 平分'))
    .addRoleOption(opt => opt.setName('身分組').setDescription('中獎給予身分組'))
    .addAttachmentOption(opt => opt.setName('檔案').setDescription('中獎傳送檔案'))
    .addStringOption(opt => opt.setName('特殊物件').setDescription('特殊物件名稱'))
    .addStringOption(opt => opt.setName('移除項目').setDescription('移除項目')
      .addChoices({ name: '身分組', value: '身分組' }, { name: '檔案', value: '檔案' }, { name: '特殊物件', value: '特殊物件' })),

  async execute(interaction) {
    const { guildId, member, options } = interaction;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    // 直接解構 options
    const poolType = options.getString('獎池');
    const 操作 = options.getInteger('操作');
    const 名稱 = options.getString('名稱');
    const 新名稱 = options.getString('新名稱');
    const UP = options.getBoolean('up');
    const 描述 = options.getString('描述');
    const 稀有度 = options.getString('稀有度');
    const 占比 = options.getNumber('占比');
    const 身分組 = options.getRole('身分組')?.id;
    const 檔案 = options.getAttachment('檔案');
    const 特殊物件 = options.getString('特殊物件');
    const 移除項目 = options.getString('移除項目');

    // 初始化
    const server = DataStore.get(guildId, 'serverSettings');
    let 獎品清單 = server[poolType+'獎池設定'].獎品清單;

    // 無操作 = 查詢
    if (操作 == null) {
      if (!獎品清單.length) return safeReply(interaction, { content: `尚未設定任何${poolType}獎池獎品。`, ephemeral: true });
      return safeReply(interaction, { embeds: generatePrizeEmbed(獎品清單, `📋 ${poolType}獎池獎品`, 稀有度) });
    }

    if (!isAdmin) return safeReply(interaction, { content: '❌ 僅限管理員可修改獎品資料。', ephemeral: true });

    let message = '';
    const target = 獎品清單.find(p => p.名稱 === 名稱);

    if (操作 === 0) { // 新增
      if (!名稱 || !稀有度) return safeReply(interaction, { content: '❌ 需提供名稱與稀有度', ephemeral: true });
      if (target) return safeReply(interaction, { content: `❌ 已存在「${名稱}」`, ephemeral: true });
      const newPrize = {
        名稱,
        描述: 描述 || '',
        稀有度,
        占比: 占比 ?? -1,
        身分組: 身分組 ?? null,
        檔案名稱: 檔案 ? await fileManager.saveFileFromUrl(guildId, 檔案.url, 檔案.name) : null,
        特殊物件: 特殊物件?.trim() || null,
        UP: UP ?? false
      };
      獎品清單.push(newPrize);
      message = `✅ 新增成功：${名稱}`;
    }   
    else if (操作 === 1) { // 刪除
      if (!target) return safeReply(interaction, { content: `❌ 找不到「${名稱}」`, ephemeral: true });
      if (target.檔案名稱) fileManager.moveFileToTrash(guildId, target.檔案名稱);
      獎品清單 = 獎品清單.filter(p => p !== target);
      message = `🗑️ 已刪除獎品「${名稱}」。`;
    }
    else if (操作 === 2) { // 修改
      if (!target) return safeReply(interaction, { content: `❌ 找不到「${名稱}」`, ephemeral: true });
      Object.assign(target, {
        名稱: 新名稱 ?? target.名稱,
        描述: 描述 ?? target.描述,
        稀有度: 稀有度 ?? target.稀有度,
        占比: 占比 ?? target.占比,
        身分組: 身分組 ?? target.身分組,
        特殊物件: 特殊物件?.trim() ?? target.特殊物件,
        UP: typeof UP === 'boolean' ? UP : target.UP
      });

      if (移除項目 === '身分組') target.身分組 = null;
      else if (移除項目 === '檔案' && target.檔案名稱) { fileManager.moveFileToTrash(guildId, target.檔案名稱); target.檔案名稱 = null; }
      else if (移除項目 === '特殊物件') target.特殊物件 = null;

      if (檔案) target.檔案名稱 = await fileManager.saveFileFromUrl(guildId, 檔案.url, 檔案.name, target.檔案名稱);
      message = `✅ 已修改「${target.名稱}」。`;
    }
    else return safeReply(interaction, { content: '❌ 未知操作', ephemeral: true });

    // 更新存檔
    server[poolType+'獎池設定'].獎品清單 = 獎品清單;
    DataStore.update(guildId, 'serverSettings', server);

    // 回覆
    const embeds = generatePrizeEmbed(獎品清單, `📋 操作完成，${poolType}獎池獎品：`, 稀有度);
    return safeReply(interaction, embeds.length ? { content: message, embeds } : { content: message });
  }
};
