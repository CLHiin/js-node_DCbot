const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { generatePoolEmbed } = require('../常用/獎池函數');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池設定')
    .setDescription('🎯 查看或修改獎池(管理員限定)')
    .addStringOption(opt =>
      opt.setName('獎池')
        .setDescription('選擇要設定哪個獎池')
        .setRequired(true)
        .addChoices(
          { name: '常駐', value: '常駐' },
          { name: '限定', value: '限定' }
        ))
    .addNumberOption(opt => opt.setName('消耗功德').setDescription('單次抽獎所需功德'))
    .addNumberOption(opt => opt.setName('ssr概率').setDescription('SSR 機率 0~100'))
    .addNumberOption(opt => opt.setName('sr概率').setDescription('SR 機率 0~100'))
    .addNumberOption(opt => opt.setName('小保底起始').setDescription('逐步提升下次SSR機率'))
    .addNumberOption(opt => opt.setName('小保底終點').setDescription('該抽必出SSR'))
    .addNumberOption(opt => opt.setName('大保底').setDescription('該抽必出UP金獎'))
    .addBooleanOption(opt => opt.setName('召神值').setDescription('啟用召神值模式'))
    .addBooleanOption(opt => opt.setName('開放').setDescription('開放獎池'))
    .addBooleanOption(opt => opt.setName('重製').setDescription('重製該獎池保底紀錄')),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const member = interaction.member;
    const poolType = interaction.options.getString('獎池');
    const serverData = DataStore.get(guildId, 'serverSettings');
    const pool = serverData[`${poolType}獎池設定`];
    const input = {
      消耗功德: interaction.options.getNumber('消耗功德'),
      SSR: interaction.options.getNumber('ssr概率'),
      SR: interaction.options.getNumber('sr概率'),
      小保底起始: interaction.options.getNumber('小保底起始'),
      小保底終點: interaction.options.getNumber('小保底終點'),
      大保底: interaction.options.getNumber('大保底'),
      召神值: interaction.options.getBoolean('召神值'),
      開放: interaction.options.getBoolean('開放')
    };
    const 重製保底 = interaction.options.getBoolean('重製');
    // 若沒有修改，只回傳 embed
    if (!Object.values(input).some(v => v !== null) && !重製保底) {
      return safeReply(interaction, { embeds: [generatePoolEmbed(pool, `${poolType}獎池設定`, 0x3399FF)] });
    }
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return safeReply(interaction, { content: '❌ 只有管理員可以修改獎池設定', ephemeral: true });
    }

    for (const [k, v] of Object.entries(input)) if (v !== null) pool[k] = v;
    // 邏輯檢查
    if (pool.SSR + pool.SR > 100) 
      return safeReply(interaction, { content: '❌ SSR + SR 機率總和不可超過 100%', ephemeral: true });
    if (pool.小保底起始 != null && pool.小保底終點 != null && pool.小保底起始 >= pool.小保底終點)
      return safeReply(interaction, { content: '❌ 小保底起始必須小於小保底終點', ephemeral: true });
    if (pool.小保底終點 != null && pool.大保底 != null && pool.小保底終點 >= pool.大保底)
      return safeReply(interaction, { content: '❌ 小保底終點必須小於大保底', ephemeral: true });

    safeReply(interaction, { embeds: [generatePoolEmbed(pool, `${poolType}獎池設定`, 0x00CC66)] });

    // 重製保底
    if (重製保底) {
      const allData = DataStore.get(guildId);
      let count = 0, totalDraws = 0;
      for (const [id, data] of Object.entries(allData)) {
        if (id === 'serverSettings') continue;
        const userPool = data[`${poolType}獎池`];
        if (!userPool) continue;
        count++;
        totalDraws += userPool.該期抽數 || 0;
        userPool.該期抽數 = 0;
        userPool.小保 = 0;
        userPool.大保 = 0;
        DataStore.update(guildId, id, data);
      }
      safeReply(interaction, { content: `🔄 已重製 **${count}** 位玩家的「${poolType}獎池」保底紀錄，總抽數：**${totalDraws}**` });
    }
    DataStore.update(guildId, 'serverSettings', serverData);
  }
};