const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { generatePoolEmbed } = require('../常用/獎池函數');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池設定')
    .setDescription('🎯 查看或修改獎池(管理員限定)')
    .addStringOption(option =>option.setName('獎池').setDescription('選擇要設定哪個獎池')
      .setRequired(true).addChoices({ name: '常駐', value: '常駐' }, { name: '限定', value: '限定' }))
    .addNumberOption(option => option.setName('消耗功德').setDescription('單次抽獎所需功德'))
    .addNumberOption(option => option.setName('ssr概率').setDescription('SSR 機率 0~100'))
    .addNumberOption(option => option.setName('sr概率').setDescription('SR 機率 0~100'))
    .addNumberOption(option => option.setName('小保底起始').setDescription('該抽開始逐步提升下次SSR概率(輸入0則無此功能)'))
    .addNumberOption(option => option.setName('小保底終點').setDescription('該抽必出SSR'))
    .addNumberOption(option => option.setName('大保底').setDescription('該抽必出UP金獎'))
    .addBooleanOption(option => option.setName('召神值').setDescription('啟用召神值模式(大保底機制修改為:超過大保底的下次SSR必中UP)'))
    .addBooleanOption(option => option.setName('開放').setDescription('開放獎池'))
    .addBooleanOption(option => option.setName('重製').setDescription('重製本伺服器所有玩家該獎池的保底紀錄')),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const member = interaction.member;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isAdmin) return interaction.reply({ content: '❌ 只有管理員可以修改獎池設定', ephemeral: true });


    const poolType = interaction.options.getString('獎池'); // 常駐 / 限定
    const serverData = DataStore.get(guildId, 'serverSettings');
    const pool = serverData[poolType + '獎池設定'];

    // 取得所有輸入選項
    const input = {
      消耗功德: interaction.options.getNumber('消耗功德'),
      SSR: interaction.options.getNumber('ssr概率'),
      SR: interaction.options.getNumber('sr概率'),
      小保底起始: interaction.options.getNumber('小保底起始'),
      小保底終點: interaction.options.getNumber('小保底終點'),
      大保底: interaction.options.getNumber('大保底'),
      召神值: interaction.options.getBoolean('召神值'),
      開放: interaction.options.getBoolean('開放'),
      重製保底: interaction.options.getBoolean('重製'),
    };

    const 有修改 = Object.values(input).some(val => val !== null);

    // 如果沒有修改，只回傳當前狀態
    if (!有修改) return interaction.reply({ embeds: [generatePoolEmbed(pool, `${poolType}獎池設定`, 0x3399FF)]});

    // 檢查概率總和
    const SSR = input.SSR ?? pool.SSR ?? 0;
    const SR = input.SR ?? pool.SR ?? 0;
    if (SSR + SR > 100) return interaction.reply({ content: '❌ SSR + SR 機率總和不可超過 100%', ephemeral: true });

    // 小保底邏輯檢查
    if (input.小保底起始 != null && input.小保底終點 != null && input.小保底起始 >= input.小保底終點)
      return interaction.reply({ content: '❌ 小保底起始必須小於小保底終點', ephemeral: true });
    if (input.小保底終點 != null && input.大保底 != null && input.小保底終點 >= input.大保底)
      return interaction.reply({ content: '❌ 小保底終點必須小於大保底', ephemeral: true });

    // 重製保底
    if (input.重製保底) {
      const allData = DataStore.get(guildId); // 全部伺服器資料
      let count = 0;
      for (const [id, data] of Object.entries(allData)) {
        if (id === 'serverSettings') continue;
        if (data[poolType + '獎池']) {
          data[poolType + '獎池'].小保 = 0;
          data[poolType + '獎池'].大保 = 0;
          DataStore.update(guildId, id, data);
          count++;
        }
      }
      await interaction.channel.send(`🔄 已重製 **${count}** 位玩家的「${poolType}獎池」保底紀錄`);
    }

    // 實際更新
    for (const key in input) {
      if (input[key] != null && key !== '重製保底') pool[key] = input[key];
    }

    DataStore.update(guildId, 'serverSettings', serverData);


    return interaction.reply({ embeds: [generatePoolEmbed(pool, `${poolType}獎池設定已更新`, 0x00CC66)]});

  }
};
