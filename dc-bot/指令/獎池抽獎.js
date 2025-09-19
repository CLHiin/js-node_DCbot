const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RARITY, calcNextSSRRate, drawGacha, formatPrizeName } = require('../常用/獎池函數');
const { getUser, updateUser } = require('../常用/儲存檔');
const fileManager = require('../常用/檔案管理');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池抽獎')
    .setDescription('🎲 抽卡或查看獎池獎品')
    .addIntegerOption(o => o.setName('抽數').setDescription('1:單抽 | 10:十連(保底SR)，不填顯示狀態')
       .addChoices({ name: '單抽', value: 1 },{ name: '十連', value: 10 }).setRequired(false)
    )
    .addUserOption(o => o.setName('目標').setDescription('查看指定用戶狀態，不抽卡').setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const 抽數 = interaction.options.getInteger('抽數') || 0;
    const 目標 = interaction.options.getUser('目標') ;
    const 目標Id = 目標?.id || interaction.user.id;
    const member = interaction.guild.members.cache.get(目標Id);
    const 目標名稱 = member ? member.displayName : 目標?.username;

    const poolData = getUser(guildId, null, 'set');
    const pool = poolData.獎池設定;

    if (!pool || Object.keys(pool).length === 0) {
      return interaction.reply({ content: '❌ 尚未設定獎池，請先設置獎池。', ephemeral: true });
    }
    if (typeof pool.消耗功德 !== 'number' || pool.消耗功德 <= 0) {
      return interaction.reply({ content: '❌ 獎池尚未設定消耗功德，無法抽卡。', ephemeral: true });
    }
    if (抽數 > 0 && 目標) {
      return interaction.reply({ content: '❌ 你不能替其他使用者抽卡，只能查看他們的狀態。', ephemeral: true });
    }
    const userData = getUser(guildId, 目標Id, { 剩餘功德: 0, 特殊物件: {}, 常駐獎池: { 總抽數: 0, 小保: 0, 大保: 0 }});
    const 所需功德 = 抽數 * pool.消耗功德;
    if (userData.剩餘功德 < 所需功德) {
      return interaction.reply({ content: `❌ 功德不足 (${userData.剩餘功德} < ${所需功德})`, ephemeral: true });
    }

    const { results: 所有結果, roles: 獲得身分組, files: 獲得檔案, specials: 本次特殊物件, userData: 新用戶資料 } =
      drawGacha(pool, userData, 抽數, pool.召神值, false);
    updateUser(guildId, 目標Id, 新用戶資料);


    const 大保底數字 = pool.大保底;
    const 召神值模式 = !!pool.召神值;

    const 獎池列 = ['SSR','SR','R'].map(r => {
      const list = pool.獎品清單?.filter(i => i.稀有度 === r).map(i => formatPrizeName(i)).join('、') || '無';
      return `${r}：${list}`;
    }).join('\n');

    // 你的 embed 建立不動
    const embed = new EmbedBuilder().setTitle(
      抽數 && !目標 ? `🎉 ${目標名稱} 抽卡結果 (${抽數} 抽)` : `🎯 ${目標名稱} 的抽卡狀態`
    ).setColor(0x00AAFF);

    if (抽數) {
      embed.setDescription(所有結果.map(r => `${RARITY[r.稀有度]} ${r.名稱}`).join('\n')).addFields(
        {
          name: '🎁 總計獎品',
          value:
            `身分組: ${[...獲得身分組].join('、') || '無'}\n` +
            `附加檔案: ${[...獲得檔案].map(f => `<${f}>`).join('、') || '無'}\n` +
            `特殊物件: ${Object.entries(本次特殊物件).map(([k, v]) => `${k}×${v}`).join('、') || '無'}`
        },
        {
          name: '📦 出貨統計',
          value:
            `SSR (${所有結果.filter(i => i.稀有度 === 'SSR').length}個)、` +
            `SR (${所有結果.filter(i => i.稀有度 === 'SR').length}個)、` +
            `R (${所有結果.filter(i => i.稀有度 === 'R').length}個)`
        }
      );
    }
    embed.addFields(
      {
        name: '📊 獎池狀態',
        value:
          `獎池功德：${pool.消耗功德} / 抽\n` +
          `剩餘功德：${新用戶資料.剩餘功德}\n` +
          `總抽數：${新用戶資料.常駐獎池.總抽數}\n` +
          `小保底：${新用戶資料.常駐獎池.小保}（起點：${pool.小保底起始 ?? '無'}，終點：${pool.小保底終點 ?? '無'}）\n` +
          `大保底：${新用戶資料.常駐獎池.大保} / ${大保底數字}（${召神值模式 ? '召神值模式' : '無召神值模式'}）\n` +
          `下一抽SSR概率：${calcNextSSRRate(pool, 新用戶資料).toFixed(2)}%`
      },
      { name: '🎯 當前獎池', value: 獎池列 }
    );

    await interaction.reply({ embeds: [embed], ephemeral: 抽數 === 0 || !!目標 });

    if (!目標) {
      for (const roleId of 獲得身分組) {
        const role = interaction.guild.roles.cache.get(roleId.replace(/[<@&>]/g, ''));
        const member = interaction.guild.members.cache.get(目標Id);
        if (role && member && !member.roles.cache.has(role.id)) {
          try {
            await member.roles.add(role);
          } catch (err) {
            console.warn(`❌ 無法賦予身分組 ${role.name} 給 ${目標名稱}：`, err);
          }
        }
      }

      for (const 檔案名稱 of 獲得檔案) {
        if (檔案名稱) {
          const filePath = fileManager.getFilePath(guildId, 檔案名稱);
          const 獎品物件 = pool.獎品清單.find(item => item.檔案名稱 === 檔案名稱);
          const 獎品名稱 = 獎品物件 ? formatPrizeName(獎品物件) : '獎品';
          if (fs.existsSync(filePath)) {
            const attachment = new AttachmentBuilder(filePath);
            await interaction.followUp({ content: `❇️ 這是你抽到 【${獎品名稱}】 的附帶檔案`, files: [attachment], ephemeral: true });
          } else {
            await interaction.followUp({ content: `⚠️ 找不到 ${獎品名稱} 的附加檔案。`, ephemeral: true });
          }
        }
      }
    }
  }
};
