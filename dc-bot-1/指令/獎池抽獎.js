const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RARITY, calcNextSSRRate, drawGacha, formatPrizeName } = require('../常用/獎池函數');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');
const fileManager = require('../常用/檔案管理');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('獎池抽獎')
    .setDescription('🎯 抽卡或查看獎池狀態')
    .addStringOption(option =>
      option.setName('獎池')
        .setDescription('選擇要抽的獎池')
        .setRequired(true)
        .addChoices(
          { name: '常駐', value: '常駐' },
          { name: '限定', value: '限定' }
        )
    )
    .addIntegerOption(option =>
      option.setName('抽數')
        .setDescription('1:單抽 | 10:十連(保底SR)，不填顯示狀態')
        .addChoices({ name: '單抽', value: 1 }, { name: '十連', value: 10 })
    )
    .addUserOption(option =>
      option.setName('目標')
        .setDescription('查看指定用戶狀態，不抽卡')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const poolType = interaction.options.getString('獎池');
    const 抽數 = interaction.options.getInteger('抽數') || 0;
    const 目標 = interaction.options.getUser('目標') || interaction.user;
    const 目標Id = 目標.id;
    const 是自己 = 目標Id === interaction.user.id;

    // 伺服器暱稱（沒有就用 username）
    const memberObj = interaction.guild.members.cache.get(目標Id);
    const displayName = memberObj?.displayName || 目標.username;

    // 取得玩家資料
    const serverData = DataStore.get(guildId, 'serverSettings');
    const playerData = DataStore.get(guildId, 目標Id)
    const poolSettings = serverData[poolType + '獎池設定'];

    if (!poolSettings || !poolSettings.獎品清單 || poolSettings.獎品清單.length === 0) {
      return safeReply(interaction, { content: `❌ ${poolType}獎池尚未設置獎品`, ephemeral: true });
    }
    if (!poolSettings.消耗功德){
      return safeReply(interaction, { content: `❌ ${poolType}獎池未設定抽獎所需功德`, ephemeral: true });
    }
      
    const resultEmbed = new EmbedBuilder().setColor(0xFFD700)
      .setTitle(抽數 ? `🎉 ${displayName + poolType} 獎池抽卡結果 (${抽數} 抽)` : `🎯 ${displayName + poolType} 獎池抽卡狀態`);
    let 獲得身分組 = [], 獲得檔案 = [], 本次特殊物件 = {};
    const 所需功德 = 抽數 * poolSettings.消耗功德;
    if (抽數 > 0) {
      if (!是自己)
        return safeReply(interaction, { content: '❌ 你不能替其他使用者抽卡，只能查看狀態', ephemeral: true });
      if (playerData.剩餘功德 < 所需功德)
        return safeReply(interaction, { content: `❌ 功德不足 (${playerData.剩餘功德} < ${所需功德})`, ephemeral: true });
      if (!poolSettings.開放)
        return safeReply(interaction, { content: '❌ 當前獎池未開放', ephemeral: true });

      // --- 抽獎 ---
      const result = drawGacha(poolSettings, playerData, 抽數, poolSettings.召神值, poolType == '限定');
      獲得身分組 = result.roles;
      獲得檔案 = result.files;
      // 本次特殊物件 = result.specials;
      DataStore.update(guildId, 目標Id, playerData);
      // 抽獎結果 embed
      resultEmbed.setDescription(result.results.map(r => `${RARITY[r.稀有度]} ${r.名稱}`).join('\n') || '無');
      // .addFields({
      //   name: '🎁 總計獎品',
      //   value:
      //     `身分組: ${[...獲得身分組].join('、') || '無'}\n` +
      //     `附加檔案: ${[...獲得檔案].map(f => `<${f}>`).join('、') || '無'}\n` +
      //     `特殊物件: ${Object.entries(本次特殊物件).map(([k,v]) => `${k}×${v}`).join('、') || '無'}`
      // });
    }

    // 詳細的獎池狀態 embed
    const statusEmbed = new EmbedBuilder()
      .setTitle(`📊 ${poolType}獎池狀態`)
      .setColor(0x3399FF)
      .setDescription(
        `功德：${poolSettings.消耗功德 ?? 0} / 抽 (剩餘: ${playerData.剩餘功德})\n` +
        `該期/總計抽數：${playerData[poolType + '獎池'].該期抽數} / ${playerData[poolType + '獎池'].總計抽數}\n` +
        `小保底：${playerData[poolType + '獎池'].小保}（起點：${poolSettings.小保底起始 ?? '無'}，終點：${poolSettings.小保底終點 ?? '無'}）\n` +
        `大保底：${playerData[poolType + '獎池'].大保} / ${poolSettings.大保底 || '無'}（${poolSettings.召神值 ? '召神值模式' : '基本保底模式'}）\n` +
        `下一抽SSR概率：${calcNextSSRRate(poolSettings, playerData, poolType == "限定").toFixed(2)}%\n` +
        `獎池狀態：${poolSettings.開放 ? '✅ 開放' : '❌ 關閉'}`
      );

    // 3️⃣ 當前獎池 embed
    const 獎池列 = ['SSR','SR','R'].map(r => {
      return `${RARITY[r]} ${poolSettings.獎品清單?.filter(i => i.稀有度 === r).map(i => formatPrizeName(i)).join('、') || '無'}`;
    }).join('\n');
    const poolEmbed = new EmbedBuilder().setTitle(`🎯 ${poolType}獎池獎品`).setColor(0xAA66CC).setDescription(獎池列);

    await safeReply(interaction, {embeds: [resultEmbed, statusEmbed, poolEmbed], ephemeral: 抽數 == 0 || !是自己});

    // --- 發放身分組與檔案 ---
    for (const roleId of 獲得身分組) {
      const role = interaction.guild.roles.cache.get(roleId.replace(/[<@&>]/g, ''));
      if (role && memberObj && !memberObj.roles.cache.has(role.id)) {
        try { memberObj.roles.add(role); } catch {}
      }
    }
    for (const 檔案名稱 of 獲得檔案) {
      if (!檔案名稱) continue;
      const filePath = fileManager.getFilePath(guildId, 檔案名稱);
      const 獎品物件 = poolSettings.獎品清單.find(i => i.檔案名稱 === 檔案名稱);
      const 獎品名稱 = 獎品物件 ? formatPrizeName(獎品物件) : '獎品';
      if (fs.existsSync(filePath)) {
        const attachment = new AttachmentBuilder(filePath);
        safeReply(interaction, {content: `❇️ 你抽到 【${獎品名稱}】 的附加檔案`,files: [attachment], ephemeral: true}, false);
      }
      else safeReply(interaction, { content: `⚠️ 找不到 ${獎品名稱} 的附加檔案。`, ephemeral: true });
    }
  }
};