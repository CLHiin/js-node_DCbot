const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, updateUser } = require('../常用/儲存檔');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池設定')
    .setDescription('🎲 查看或修改獎池設定（只有管理員可以修改）')
    .addNumberOption(option => option.setName('消耗功德').setDescription('單次抽獎所需功德').setRequired(false))
    .addNumberOption(option => option.setName('ssr概率').setDescription('SSR 機率 0~100').setRequired(false))
    .addNumberOption(option => option.setName('sr概率').setDescription('SR 機率 0~100').setRequired(false))
    .addNumberOption(option => option.setName('小保底起始').setDescription('連續n次未出金,則逐步提升SSR概率').setRequired(false))
    .addNumberOption(option => option.setName('小保底終點').setDescription('連續n次未出金,則此抽必出SSR').setRequired(false))
    .addNumberOption(option => option.setName('大保底').setDescription('大保底抽數(必出UP獎)').setRequired(false))
    .addBooleanOption(option => option.setName('招神值啟用').setDescription('是否啟用招神值(大保底機制修改為:超過大保底的下次SSR必中UP)').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const member = interaction.member;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    // 讀取伺服器設定
    const serverData = getUser(guildId, null, 'set');
    const pool = serverData.獎池設定;

    // 收集輸入參數
    const input = {
      消耗功德: interaction.options.getNumber('消耗功德'),
      SSR: interaction.options.getNumber('ssr概率'),
      SR: interaction.options.getNumber('sr概率'),
      小保底起始: interaction.options.getNumber('小保底起始'),
      小保底終點: interaction.options.getNumber('小保底終點'),
      大保底: interaction.options.getNumber('大保底'),
      招神值: interaction.options.getBoolean('招神值啟用'),
    };

    const 有修改 = Object.values(input).some(val => val !== null);

    // 🔒 權限檢查
    if (!isAdmin && 有修改) {
      return interaction.reply({
        content: '❌ 只有管理員可以修改獎池設定。你仍可以使用此指令查看設定。',
        ephemeral: true
      });
    }

    // ✅ 管理員修改設定
    if (isAdmin && 有修改) {
      const SSR = input.SSR ?? pool.SSR ?? 0;
      const SR = input.SR ?? pool.SR ?? 0;

      if (SSR + SR > 100) {
        return interaction.reply({
          content: '❌ SSR + SR 機率總和不可超過 100%。',
          ephemeral: true
        });
      }

      if (input.小保底起始 !== null && input.小保底終點 !== null) {
        if (input.小保底起始 >= input.小保底終點) {
          return interaction.reply({
            content: '❌ 小保底起始抽數必須小於終點抽數。',
            ephemeral: true
          });
        }
      }

      if (input.小保底終點 !== null && input.大保底 !== null) {
        if (input.小保底終點 >= input.大保底) {
          return interaction.reply({
            content: '❌ 小保底終點必須小於大保底抽數。',
            ephemeral: true
          });
        }
      }

      // 寫入資料
      if (input.消耗功德 !== null) pool.消耗功德 = input.消耗功德;
      if (input.SSR !== null) pool.SSR = input.SSR;
      if (input.SR !== null) pool.SR = input.SR;
      if (input.小保底起始 !== null) pool.小保底起始 = input.小保底起始;
      if (input.小保底終點 !== null) pool.小保底終點 = input.小保底終點;
      if (input.大保底 !== null) pool.大保底 = input.大保底;
      if (input.招神值 !== null) pool.招神值 = input.招神值;

      updateUser(guildId, null, serverData);
    }

    // ⏱️ 顯示結果
    const embed = new EmbedBuilder()
      .setTitle('🎯 當前獎池設定')
      .setColor(isAdmin && 有修改 ? 0x00CC66 : 0x3399FF)
      .setDescription([
        `💰 消耗功德：${pool.消耗功德 ?? '未設定'} / 抽`,
        `🎲 SSR 機率：${pool.SSR ?? '未設定'}%`,
        `🎲 SR 機率：${pool.SR ?? '未設定'}%`,
        `🎲 R 機率：${100 - ((pool.SSR ?? 0) + (pool.SR ?? 0))}%`,
        `📈 小保底起始：${pool.小保底起始 ?? '未設定'} 抽`,
        `📈 小保底終點：${pool.小保底終點 ?? '未設定'} 抽`,
        `🛡️ 大保底：${pool.大保底 ?? '未設定'} 抽`,
        `🌟 招神值模式：${pool.招神值 ? '✅ 是' : '❌ 否'}`,
        `📘 說明：`,
        `連續 ${pool.小保底起始 ?? '?'} 抽未出SSR 後，出SSR機率逐步提升`,
        `連續 ${pool.小保底終點 ?? '?'} 抽未出SSR，該抽必出SSR`,
        `連續 ${pool.大保底     ?? '?'} 抽未出UP，該抽必出UP SSR，`,
        `${pool.招神值 ? '✅ 啟用招神值(大保底機制更改:大保底過後的SSR必出UP' : '❌ 未啟用招神值'}`
      ].join('\n'))
      .setFooter({ text: isAdmin && 有修改 ? '✅ 設定已更新' : '查詢結果' });

    return interaction.reply({ embeds: [embed], ephemeral: !有修改 });
  }
};
