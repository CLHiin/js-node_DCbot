const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, updateUser, loadData } = require('../常用/儲存檔'); // ⬅️ 確保有 getAllUsers 方法

module.exports = {
  data: new SlashCommandBuilder()
    .setName('限定獎池設定')
    .setDescription('🎯 查看或修改限定獎池設定(只有管理員可以修改)')
    .addNumberOption(option => option.setName('消耗功德').setDescription('單次抽獎所需功德').setRequired(false))
    .addNumberOption(option => option.setName('ssr概率').setDescription('SSR 機率 0~100').setRequired(false))
    .addNumberOption(option => option.setName('sr概率').setDescription('SR 機率 0~100').setRequired(false))
    .addNumberOption(option => option.setName('小保底起始').setDescription('連續n次未出金,則逐步提升SSR概率').setRequired(false))
    .addNumberOption(option => option.setName('小保底終點').setDescription('連續n次未出金,則此抽必出SSR').setRequired(false))
    .addNumberOption(option => option.setName('大保底').setDescription('大保底抽數(必出UP獎)').setRequired(false))
    .addBooleanOption(option => option.setName('召神值啟用').setDescription('是否啟用召神值(大保底機制修改為:超過大保底的下次SSR必中UP)').setRequired(false))
    .addBooleanOption(option => option.setName('開放').setDescription('是否開放限定獎池').setRequired(false))
    .addStringOption(option => option.setName('開始日期').setDescription('格式 YYYY-MM-DD').setRequired(false))
    .addStringOption(option => option.setName('結束日期').setDescription('格式 YYYY-MM-DD').setRequired(false))
    // 🆕 新增的重製保底選項
    .addBooleanOption(option => option.setName('重製保底').setDescription('是否重製本伺服器所有玩家的限定獎池保底紀錄').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const member = interaction.member;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    const serverData = getUser(guildId, null, 'set');
    const pool = serverData.限定獎池設定;

    const input = {
      消耗功德: interaction.options.getNumber('消耗功德'),
      SSR: interaction.options.getNumber('ssr概率'),
      SR: interaction.options.getNumber('sr概率'),
      小保底起始: interaction.options.getNumber('小保底起始'),
      小保底終點: interaction.options.getNumber('小保底終點'),
      大保底: interaction.options.getNumber('大保底'),
      召神值: interaction.options.getBoolean('召神值啟用'),
      開放: interaction.options.getBoolean('開放'),
      開始日期: interaction.options.getString('開始日期'),
      結束日期: interaction.options.getString('結束日期'),
      重製保底: interaction.options.getBoolean('重製保底'), // 🆕
    };

    const 有修改 = Object.values(input).some(val => val !== null);

    // 權限檢查
    if (!isAdmin && 有修改) {
      return interaction.reply({
        content: '❌ 只有管理員可以修改限定獎池設定。你仍可以使用此指令查看設定。',
        ephemeral: true
      });
    }

    // 管理員修改設定
    if (isAdmin && 有修改) {
      const SSR = input.SSR ?? pool.SSR ?? 0;
      const SR = input.SR ?? pool.SR ?? 0;

      if (SSR + SR > 100) {
        return interaction.reply({ content: '❌ SSR + SR 機率總和不可超過 100%。', ephemeral: true });
      }

      if (input.小保底起始 !== null && input.小保底終點 !== null) {
        if (input.小保底起始 >= input.小保底終點) {
          return interaction.reply({ content: '❌ 小保底起始抽數必須小於終點抽數。', ephemeral: true });
        }
      }

      if (input.小保底終點 !== null && input.大保底 !== null) {
        if (input.小保底終點 >= input.大保底) {
          return interaction.reply({ content: '❌ 小保底終點必須小於大保底抽數。', ephemeral: true });
        }
      }
      // 🆕 如果要重製保底
      if (input.重製保底) {
        const allData = loadData(); // 取得完整資料庫
        let count = 0;

        if (allData[guildId]) {
          for (const [id, data] of Object.entries(allData[guildId])) {
            if (id === '設定') continue; // 跳過伺服器設定
            if (data.限定獎池) {
              data.限定獎池.大保 = 0;
              data.限定獎池.小保 = 0;
              data.限定獎池.召神值 = 0;
              updateUser(guildId, id, data);
              count++;
            }
          }
        }
        await interaction.channel.send(`🔄 已重製 **${count}** 位玩家的「限定獎池」保底紀錄`);
      }
      if (input.消耗功德 !== null) pool.消耗功德 = input.消耗功德;
      if (input.SSR !== null) pool.SSR = input.SSR;
      if (input.SR !== null) pool.SR = input.SR;
      if (input.小保底起始 !== null) pool.小保底起始 = input.小保底起始;
      if (input.小保底終點 !== null) pool.小保底終點 = input.小保底終點;
      if (input.大保底 !== null) pool.大保底 = input.大保底;
      if (input.召神值 !== null) pool.召神值 = input.召神值;
      if (input.開放 !== null) pool.開放 = input.開放;
      if (input.開始日期 !== null) pool.開始日期 = input.開始日期;
      if (input.結束日期 !== null) pool.結束日期 = input.結束日期;

      updateUser(guildId, null, serverData);
    }
    // 判斷是否在開放期間
    const 現在是否在期間內 = pool.開始日期 && pool.結束日期 ? (new Date() >= new Date(pool.開始日期) && new Date() <= new Date(pool.結束日期)): false;
    const embed = new EmbedBuilder()
      .setTitle('🎯 當前限定獎池設定')
      .setColor(isAdmin && 有修改 ? 0x00CC66 : 0x3399FF)
      .setDescription([
        `💰 消耗功德：${pool.消耗功德 ?? '未設定'} / 抽`,
        `🎲 SSR 機率：${pool.SSR ?? '未設定'}%`,
        `🎲 SR 機率：${pool.SR ?? '未設定'}%`,
        `🎲 R 機率：${100 - ((pool.SSR ?? 0) + (pool.SR ?? 0))}%`,
        `📈 小保底起始：${pool.小保底起始 ?? '未設定'} 抽`,
        `📈 小保底終點：${pool.小保底終點 ?? '未設定'} 抽`,
        `🛡️ 大保底：${pool.大保底 ?? '未設定'} 抽`,
        `🌟 召神值模式：${pool.召神值 ? '✅ 是' : '❌ 否'}`,
        `🔔 自動開放模式：${pool.開放 ? '✅ 開啟中' : '❌ 關閉中'}`,
        `📆 獎池開放時間：${pool.開始日期 ?? '未設定'} ~ ${pool.結束日期 ?? '未設定'}`,
        `⏰ 現在是否在開放期間：${現在是否在期間內 ? '✅ 是' : '❌ 否'}`
      ].join('\n'))
      .setFooter({ text: isAdmin && 有修改 ? '✅ 限定獎池設定已更新' : '查詢結果' });

    return interaction.reply({ embeds: [embed], ephemeral: !有修改 });
  }
};
