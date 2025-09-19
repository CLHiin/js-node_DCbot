const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('💬 讓機器人說一句話（管理員或指定使用者）') 
    .addStringOption(option =>
      option.setName('message')
        .setDescription('要說的內容')
        .setRequired(true)
    ),

  async execute(interaction) {
    const ALLOWED_USER_ID = '976677955969380373';
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const isAllowedUser = interaction.user.id === ALLOWED_USER_ID;

    if (!isAdmin && !isAllowedUser) {
      return interaction.reply({ content: '❌ 你沒有權限使用此指令。', ephemeral: true });
    }

    const message = interaction.options.getString('message');

    try {
      await interaction.channel.send(message);
      await interaction.reply({ content: '✅ 已發送訊息。', ephemeral: true });
    } catch {
      await interaction.reply({ content: message });
    }

  },
};
