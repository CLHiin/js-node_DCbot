const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionsBitField,AttachmentBuilder 
} = require('discord.js');
const file = new AttachmentBuilder('./圖片/rua.png');

// 表情定義統一處理
const RUA_EMOJI = '<:rua:1399369942578761739>';
const CAT_EMOJI = '<:CattoNeko_01:1399372634742980608>';

// rua 描述文字
const 可以rua = async (interaction, title, from, to, type = '') => {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`${from}\n正在${type} rua\n${to}\n# ${CAT_EMOJI}`)    
    .setImage('attachment://rua.png')
    .setColor(0x00ff00);

  // 根據是否是按鈕互動決定回應方式
  if (interaction.isButton && interaction.isButton()) {
    return await interaction.update({content: `${to}`, embeds: [embed], files: [file], components: [] });
  }
  else {
    return await interaction.reply({content: `${to}`, embeds: [embed], files: [file], components: [] });
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rua人')
    .setDescription('🤗 選擇一人 rua rua')
    .addUserOption   (option =>option.setRequired(true ).setName('目標').setDescription('要 rua 的人'))
    .addBooleanOption(option =>option.setRequired(false).setName('強制').setDescription('(管理員限定)強制 rua rua')),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('目標');
    const 強制 = interaction.options.getBoolean('強制') || false;
    if (targetUser.id === interaction.user.id)
      return interaction.reply({ content: '你不能自己 rua 自己！', ephemeral: true });
    if (強制) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
        return interaction.reply({ content: '你沒有權限使用強制 rua 功能！', ephemeral: true });
      return 可以rua(interaction, '強制 Rua 執行', interaction.user, targetUser, '強制');
    }
    // 建立按鈕：同意 / 拒絕
    const 同意按鈕 = new ButtonBuilder().setCustomId('rua_accept' ).setLabel('同意被 Rua').setStyle(ButtonStyle.Success);
    const 拒絕按鈕 = new ButtonBuilder().setCustomId('rua_decline').setLabel('拒絕被 Rua').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(同意按鈕, 拒絕按鈕);

    // 發送邀請 embed
    const embed邀請 = new EmbedBuilder()
      .setTitle('Rua 請求')
      .setDescription(`你願意被 ${interaction.user} rua 嗎？\n請點擊下面的按鈕同意或拒絕。`)
      .setFooter({ text: '請在 30 秒內回應' })
      .setColor(0x00aaff);
    await interaction.reply({content: `${targetUser}`, embeds: [embed邀請], components: [row] });

    // 收集按鈕回應
    const filter = i => ['rua_accept', 'rua_decline'].includes(i.customId) && i.user.id === targetUser.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });
    collector.on('collect', async i => {
      if (i.customId === 'rua_accept') return await 可以rua(i, 'Rua 同意 ✅', interaction.user, targetUser);
      const resultEmbed = new EmbedBuilder()
        .setTitle('Rua 拒絕 ❌')
        .setDescription(`❌ ${targetUser} 拒絕被 ${interaction.user} rua。`)
        .setColor(0xff0000);
      await i.update({ embeds: [resultEmbed], components: [] });
    });
    collector.on('end', collected => {
      if (collected.size === 0) {
        const embed超時 = new EmbedBuilder()
          .setTitle('Rua 超時 ⏰')
          .setDescription(`⚠️ ${targetUser} 沒有在時限內回應 rua 請求。`)
          .setColor(0x999999);
        interaction.editReply({ embeds: [embed超時], components: [] });
      }
    });
  }
};
