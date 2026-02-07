const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { GenerateMaze, renderDungeonToImage, renderPlayerDungeonToImage } = require('../常用/地下城函數');

const directions = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};

function isSameMonth(dateA, dateB) {
    if (!dateA || !dateB) return false;
    const d1 = new Date(dateA);
    const d2 = new Date(dateB);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('地下城探索')
        .setDescription('🗺️ 探索地下城/查看他人進度')
        .addUserOption(option => option.setName('玩家').setDescription('查看目標玩家的地下城')),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const targetUser = interaction.options.getUser('玩家');
        const targetUserId = targetUser?.id || userId;

        const dungeonConfig = DataStore.get(guildId, 'serverSettings').地下城;
        const playerData = DataStore.get(guildId, targetUserId);
        const pd = playerData.地下城;

        const nowTW = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
        const todayTW = nowTW.toDateString();
        
        // ===== 先 deferReply 避免超時 =====
        await interaction.deferReply();

        if (!dungeonConfig || !dungeonConfig.地圖大小 || !dungeonConfig.牆壁密度 || !dungeonConfig.鑽石數量) {
            return interaction.followUp({ content: '❌ 伺服器尚未設定完整地下城，無法探索' });
        }

        // ===== 每月刷新地圖 =====
        if (!pd.地圖 || !isSameMonth(pd.刷新日期, nowTW)) {
            const mapStr = dungeonConfig.統一地圖 && dungeonConfig.地圖
                ? dungeonConfig.地圖
                : GenerateMaze(dungeonConfig.地圖大小, dungeonConfig.牆壁密度, dungeonConfig.鑽石數量);

            const mapRows = mapStr.split('\n');
            pd.探索 = pd.可視 = mapRows.map(r => '0'.repeat(r.length)).join('\n');
            pd.完成 = false;
            pd.地圖 = mapStr;
            pd.刷新日期 = todayTW;
            pd.鑽石 = dungeonConfig.鑽石數量;

            const map = mapRows.map(r => r.split(''));
            while (true) {
                const x = Math.floor(Math.random() * map[0].length);
                const y = Math.floor(Math.random() * map.length);
                const distToEnd = Math.hypot(x - map[0].length + 1, y - map.length + 1);
                if (map[y][x] !== 'D' && map[y][x] !== 'W' && distToEnd >= map.length * 0.3) {
                    pd.座標 = { x, y };
                    break;
                }
            }
            updateVisible(pd);
        }

        // ===== 管理員查看其他玩家 =====
        if (targetUser) {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isAdmin = member.permissions.has('Administrator');
            // 公開 embed：探索進度
            const embed = createDungeonEmbed(pd, dungeonConfig, `${targetUser.username} 的地下城探索`);
            const files = [{ attachment: renderPlayerDungeonToImage(pd).toBuffer('image/png'), name: '探索進度.png' }];
            await interaction.followUp({ embeds: [embed], files });
            // 管理員額外看到完整地圖
            if (isAdmin) {
                const adminFiles = [{ attachment: renderDungeonToImage(pd).toBuffer('image/png'), name: '完整地圖.png' }];
                interaction.followUp({ content: '完整地圖（管理員專用）', files: adminFiles, ephemeral: true });
            }
            return;
        }

        const now = Date.now();
        if (pd.探索時間 && now - pd.探索時間 < 10 * 60 * 1000) {
            const remain = Math.ceil((10 * 60 * 1000 - (now - pd.探索時間)) / 1000);
            return interaction.followUp({ content: `❌ 你已經在探索地下城了！請 ${remain} 秒後再試` });
        }

        if (pd.探索日期 !== todayTW) pd.步數 = dungeonConfig.每日步數;
        pd.探索日期 = todayTW;
        pd.探索時間 = Date.now();
        DataStore.update(guildId, userId, playerData);

        // ===== 按鈕 =====
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dungeon_up').setLabel('⬆️ 上').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dungeon_down').setLabel('⬇️ 下').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dungeon_left').setLabel('⬅️ 左').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dungeon_right').setLabel('➡️ 右').setStyle(ButtonStyle.Primary)
        );

        const message = await interaction.followUp({
            embeds: [createDungeonEmbed(pd, dungeonConfig, '🗺️ 地下城探索開始')],
            files: [{ attachment: renderPlayerDungeonToImage(pd).toBuffer('image/png'), name: 'dungeon.png' }],
            components: [buttons],
            fetchReply: true
        });

        // ===== 收集器 =====
        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.customId.startsWith('dungeon_'),
            time: 10 * 60 * 1000
        });

        collector.on('collect', async i => {
            await i.deferUpdate();
            try {
                const freshData = DataStore.get(guildId, userId);
                const pd = freshData.地下城;

                if (pd.完成) return i.followUp({ content: '✅ 已完成地下城，等待每月一日刷新', ephemeral: true });
                if (pd.步數 <= 0) return i.followUp({ content: '❌ 步數用完，請等待明日刷新', ephemeral: true });

                const map = pd.地圖.split('\n').map(r => r.split(''));
                const moved = movePlayer(pd, map, i.customId.replace('dungeon_', ''));
                if (!moved) return i.followUp({ content: '❌ 不能走到牆壁或地圖外！', ephemeral: true });

                pd.步數--;
                const explored = pd.探索.split('\n').map(r => r.split('').map(c => parseInt(c)));
                const { x, y } = pd.座標;
                const gotDiamond = map[y][x] === 'D' && explored[y][x] === 0;
                
                if (gotDiamond || map[y][x] === 'E') {
                    const msg = gotDiamond ? '💎 你拿到一顆鑽石！' : '🏁 你到達終點，地下城完成！';
                    const original = freshData.剩餘功德;
                    const add = gotDiamond ? dungeonConfig.鑽石功德 : dungeonConfig.終點功德;
                    if (gotDiamond) { explored[y][x] = 1; pd.鑽石--; }
                    else pd.完成 = true;

                    freshData.剩餘功德 += add;
                    freshData.累積功德 += add;
                    i.followUp({ content: `${msg}\n剩餘功德: ${original} -> ${freshData.剩餘功德}`,ephemeral: true });
                }

                pd.探索 = explored.map(r => r.join('')).join('\n');
                DataStore.update(guildId, userId, freshData);

                await i.editReply({
                    embeds: [createDungeonEmbed(pd, dungeonConfig, '🗺️ 地下城探索中')],
                    files: [{ attachment: renderPlayerDungeonToImage(pd).toBuffer('image/png'), name: 'dungeon.png' }]
                });
            } catch (err) {
                console.warn('⚠️ 互動錯誤:', err.message);
            }
        });

        collector.on('end', async () => {
            const freshData = DataStore.get(guildId, userId);
            if (freshData?.地下城) {
                freshData.地下城.探索時間 = null;
                DataStore.update(guildId, userId, freshData);
            }
            pd.探索時間 = null;
            const embed = new EmbedBuilder()
                .setTitle('探索結束 ⏰')
                .setDescription('⚠️ 探索事件只保留十分鐘！')
                .setColor(0x999999);
            message.edit({ embeds: [embed], components: [] });
        });
    }
};

// ===== 工具函數 =====
function createDungeonEmbed(pd, dungeonConfig, title) {
    return new EmbedBuilder()
        .setTitle(title)
        .setColor(0x00AE86)
        .setDescription([
            `🚶 剩餘步數：${pd.步數} (每日 ${dungeonConfig.每日步數})`,
            `💎 剩餘鑽石：${pd.鑽石} (每顆 ${dungeonConfig.鑽石功德})`,
            `📏 地圖資訊：${dungeonConfig.地圖大小} x ${dungeonConfig.地圖大小} (密度 ${dungeonConfig.牆壁密度})`,
            `🏁 終點獎勵：${dungeonConfig.終點功德 ?? 0}`,
            `💡 提示：每天刷新步數 / 每月刷新地下城`,
            `⚠️ 注意：抵達終點後無法再次探索，需等待下個月刷新`,
        ].join('\n'));
}

function updateVisible(player) {
    const map = player.地圖.split('\n').map(r => r.split(''));
    const visible = player.可視.split('\n').map(r => r.split('').map(c => parseInt(c)));
    const { x, y } = player.座標;

    for (let yy = y - 1; yy <= y + 1; yy++) {
        for (let xx = x - 1; xx <= x + 1; xx++) {
            if (yy >= 0 && yy < map.length && xx >= 0 && xx < map[0].length) {
                visible[yy][xx] = 1;
            }
        }
    }
    player.可視 = visible.map(r => r.join('')).join('\n');
}

function movePlayer(player, map, Id) {
    const move = directions[Id];
    if (!move) return false;
    const x = player.座標.x + move.dx;
    const y = player.座標.y + move.dy;
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return false;
    if (map[y][x] === 'W') return false;
    player.座標.x = x;
    player.座標.y = y;
    updateVisible(player);
    return true;
}
