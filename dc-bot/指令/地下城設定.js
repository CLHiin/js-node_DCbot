const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');
const { GenerateMaze, renderDungeonToImage } = require('../常用/地下城函數');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('地下城設定')
        .setDescription('🗺️ 查看或設定地下城基本參數')
        .addIntegerOption(o => o.setName('地圖大小').setDescription('地下城大小 NxN (建議 10~50)'))
        .addStringOption(o => o.setName('牆壁密度').setDescription('少 / 中 / 多')
            .addChoices(
                { name: '少', value: '少' },
                { name: '中', value: '中' },
                { name: '多', value: '多' }
            ))
        .addIntegerOption(o => o.setName('鑽石數量').setDescription('要放幾顆鑽石'))
        .addIntegerOption(o => o.setName('每日步數').setDescription('每天可行走的步數'))
        .addIntegerOption(o => o.setName('鑽石分數').setDescription('每顆鑽石的分數'))
        .addIntegerOption(o => o.setName('終點分數').setDescription('到達終點的分數'))
        .addBooleanOption(o => o.setName('統一地圖').setDescription('每位玩家統一/隨機地圖'))
        .addBooleanOption(o => o.setName('生成新地圖').setDescription('是否立即生成一張新地圖'))
        .addBooleanOption(o => o.setName('重製玩家地圖').setDescription('將所有人的探索紀錄清除')),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const serverData = DataStore.get(guildId, 'serverSettings');
        const oldConfig = serverData.地下城 || {};
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        const input = {
            地圖大小: interaction.options.getInteger('地圖大小'),
            牆壁密度: interaction.options.getString('牆壁密度'),
            鑽石數量: interaction.options.getInteger('鑽石數量'),
            每日步數: interaction.options.getInteger('每日步數'),
            鑽石功德: interaction.options.getInteger('鑽石分數'),
            終點功德: interaction.options.getInteger('終點分數'),
            統一地圖: interaction.options.getBoolean('統一地圖'),
        };

        // 讀取輸入值
        const 生成新地圖 = interaction.options.getBoolean('生成新地圖');
        const 重製玩家地圖 = interaction.options.getBoolean('重製玩家地圖');

        // 建立新的配置，但只有管理員才能修改
        let newConfig = { ...oldConfig };
        if (isAdmin) {
            if (input.地圖大小 && input.地圖大小 < 10) 
                return safeReply(interaction, {content: '❌ 生成地圖大小至少10以上。', ephemeral: true});
            let 核心變更 = false;
            for (const key in input) {
                if (input[key] != null && input[key] !== oldConfig[key]) {
                    newConfig[key] = input[key];
                    if (['地圖大小', '牆壁密度', '鑽石數量'].includes(key)) 核心變更 = true;
                }
            }
            if (!newConfig.統一地圖) newConfig.地圖 = null;
            else if (生成新地圖 || 核心變更) {
                if (!newConfig.地圖大小 || !newConfig.牆壁密度 || !newConfig.鑽石數量) 
                    return safeReply(interaction, {content: '❌ 生成新地圖需要：大小、牆壁密度、鑽石數量。', ephemeral: true});
                newConfig.地圖 = GenerateMaze(newConfig.地圖大小, newConfig.牆壁密度, newConfig.鑽石數量);
            }
            serverData.地下城 = newConfig;
            DataStore.update(guildId, '', serverData);
        }

        // 統一產生 Embed 描述
        const embed = new EmbedBuilder()
            .setTitle(isAdmin ? '✅ 地下城設定完成' : '🗺️ 伺服器地下城設定')
            .setColor(0x00AE86)
            .setDescription([
                `📏 **地圖大小**：${newConfig.地圖大小 ? `${newConfig.地圖大小} x ${newConfig.地圖大小}` : '未設定'}`,
                `🧱 **牆壁密度**：${newConfig.牆壁密度 || '未設定'}`,
                `💎 **鑽石生成**：${newConfig.鑽石數量 ? `${newConfig.鑽石數量} 顆 (每顆 ${newConfig.鑽石功德} 功德)` : '未設定'}`,
                `🚶 **每日步數**：${newConfig.每日步數 ?? '未設定'}`,
                `🏁 **終點獎勵**：${`${newConfig.終點功德?.toString()} 功德`|| '未設定'}`,
                `🗺️ **地圖模式**：${newConfig.統一地圖 ? '統一' : '隨機'}`
            ].join('\n'));
        await safeReply(interaction, { embeds:[embed] });

        // 如果有新生成地圖，管理員可以看到圖片
        if (isAdmin && newConfig.地圖) {
            const canvas = renderDungeonToImage(newConfig);
            const buffer = canvas.toBuffer('image/png');
            safeReply(interaction,{
                content: '🗺️ 當前的地圖預覽',
                files: [{ attachment: buffer, name: 'dungeon_preview.png' }],
                ephemeral: true
            },false);
        }
        // 重製保底
        if (重製玩家地圖) {
            const allData = DataStore.get(guildId); // 全部伺服器資料
            let count = 0;
            for (const [id, data] of Object.entries(allData)) {
                if (id === 'serverSettings') continue;
                count++;
                data['地下城'] = {
                    刷新日期: null, 探索日期: null, 步數: null, 地圖: null, 探索: null,
                    可視: null, 座標: null, 鑽石: null, 完成: false, 探索時間: null
                };
                DataStore.update(guildId, id, data);
            }
            interaction.channel.send(`🔄 已重製 **${count}** 位玩家的地下城探險紀錄。`);
        }
    }
};
