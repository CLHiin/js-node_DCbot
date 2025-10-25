const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { DataStore } = require('../常用/儲存檔');
const { GenerateMaze, renderDungeonToImage, renderPlayerDungeonToImage } = require('../常用/地下城函數');

const directions = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};

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

        const serverData = DataStore.get(guildId, 'serverSettings');
        const playerData = DataStore.get(guildId, targetUserId);

        const dungeonConfig = serverData.地下城;
        const pd = playerData.地下城;

        const now = Date.now();
        const nowDate = new Date();
        const today = nowDate.toDateString();

        if (!dungeonConfig || !dungeonConfig.地圖大小 || !dungeonConfig.牆壁密度 || !dungeonConfig.鑽石數量) {
            return interaction.reply({ content: '❌ 伺服器尚未設定完整地下城，無法探索', ephemeral: true });
        }

        // 初始生成地圖     nowDate.getDay(),0=週日
        if ((!pd.地圖) || (nowDate.getDay() === 0 && pd.刷新日期 !== today)) { 
            const mapStr = dungeonConfig.統一地圖 && dungeonConfig.地圖
                ? dungeonConfig.地圖
                : GenerateMaze(dungeonConfig.地圖大小, dungeonConfig.牆壁密度, dungeonConfig.鑽石數量);

            const mapRows = mapStr.split('\n');
            pd.探索 = pd.可視 = mapRows.map(r => '0'.repeat(r.length)).join('\n');
            pd.完成 = false;
            pd.地圖 = mapStr;
            pd.刷新日期 = today;
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

        // 管理員查看其他玩家時，直接渲染，不受步數/探索限制
        if (targetUser) {
            if (!pd.地圖) return interaction.reply({ content: '該玩家沒有啟用地下城', ephemeral: true });
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isAdmin = member.permissions.has('Administrator');
            const files = [
                { attachment: renderPlayerDungeonToImage(pd).toBuffer('image/png'), name: '探索進度.png' }
            ];
            if (isAdmin) { // 如果是管理員，額外附上完整地圖
                files.push({ attachment: renderDungeonToImage(pd).toBuffer('image/png'), name: '完整地圖.png' });
            }
            const embed = createDungeonEmbed(pd, dungeonConfig, `${targetUser.username} 的地下城探索`);
            return interaction.reply({ embeds: [embed], files, ephemeral: isAdmin});
        }

        // 檢查玩家是否正在探索，且距離上次探索未超過 10 分鐘
        if (pd.探索時間 && now - pd.探索時間 < 10 * 60 * 1000) {
            return interaction.reply({ content: '❌ 你已經在探索地下城了！稍後再試', ephemeral: true });
        }
        // 每日步數刷新
        if (pd.探索日期 !== today) pd.步數 = dungeonConfig.每日步數;
        pd.探索日期 = today;
        pd.探索時間 = now;
        DataStore.update(guildId, userId, playerData);

        // 按鈕加前綴 "dungeon_" 避免跟其他互動衝突
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dungeon_up').setLabel('⬆️ 上').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dungeon_down').setLabel('⬇️ 下').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dungeon_left').setLabel('⬅️ 左').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dungeon_right').setLabel('➡️ 右').setStyle(ButtonStyle.Primary)
        );

        const message = await interaction.reply({
            embeds: [createDungeonEmbed(pd, dungeonConfig, '🗺️ 地下城探索開始')],
            files: [{ attachment: renderPlayerDungeonToImage(pd).toBuffer('image/png'), name: 'dungeon.png' }],
            components: [buttons],
            fetchReply: true
        });

        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.customId.startsWith('dungeon_'),
            time: 10 * 60 * 1000
        });
        collector.on('collect', async i => {
            await i.deferUpdate();
            try {
                if (pd.完成) return i.followUp({ content: '✅ 已完成地下城，等待週日刷新', ephemeral: true });
                if (pd.步數 <= 0) return i.followUp({ content: '❌ 步數用完，請等待明日刷新', ephemeral: true });

                // 不用 deferUpdate()，因為 update() 本身就會自動回覆
                const map = pd.地圖.split('\n').map(r => r.split(''));
                const moved = movePlayer(pd, map, i.customId.replace('dungeon_', ''));
                if (!moved) return i.followUp({ content: '❌ 不能走到牆壁或地圖外！', ephemeral: true });

                pd.步數--;

                // --- 檢查事件 ---
                const explored = pd.探索.split('\n').map(r => r.split('').map(c => parseInt(c)));
                const { x, y } = pd.座標;
                const 獲得鑽石 = map[y][x] === 'D' && explored[y][x] === 0;
                const 抵達終點 = map[y][x] === 'E' && !pd.完成;

                if (獲得鑽石 || 抵達終點) {
                    const 文本 = 獲得鑽石 ? '💎 你拿到一顆鑽石！' : '🏁 你到達終點，地下城完成！';
                    const 原功德 = playerData.剩餘功德;
                    const 獲取功德 = 獲得鑽石 ? dungeonConfig.鑽石功德 : dungeonConfig.終點功德;

                    if (獲得鑽石) {explored[y][x] = 1; pd.鑽石--;}
                    else pd.完成 = true;

                    playerData.剩餘功德 += 獲取功德;
                    playerData.累積功德 += 獲取功德;

                    await i.followUp({ content: `${文本}\n剩餘功德: ${原功德} -> ${playerData.剩餘功德}`, ephemeral: true });
                }
                pd.探索 = explored.map(r => r.join('')).join('\n');
                DataStore.update(guildId, userId, playerData);

                await i.editReply({
                    embeds: [createDungeonEmbed(pd, dungeonConfig, '🗺️ 地下城探索中')],
                    files: [{ attachment: renderPlayerDungeonToImage(pd).toBuffer('image/png'), name: 'dungeon.png' }]
                });
            } catch (err) {
                console.warn('⚠️ 互動錯誤:', err.message);
            }
        });
        collector.on('end', async () => {
            pd.探索時間 = null;
            const embed = new EmbedBuilder()
                .setTitle('探索結束 ⏰')
                .setDescription('⚠️ 探索事件只保留十分鐘！')
                .setColor(0x999999);
            try {
                await message.edit({ embeds: [embed], components: [] });
            } catch (e) {
                console.warn('訊息已刪除或無法編輯');
            }
        });

    }
};

// Embed 生成函數
function createDungeonEmbed(pd, dungeonConfig, title) {
    return new EmbedBuilder()
        .setTitle(title)
        .setColor(0x00AE86)
        .setDescription([
            `🚶 剩餘步數：${pd.步數} (每日 ${dungeonConfig.每日步數} 步數)`,
            `💎 剩餘鑽石：${pd.鑽石} (每顆 ${dungeonConfig.鑽石功德} 功德)`,
            `📏 地圖資訊：${dungeonConfig.地圖大小} x ${dungeonConfig.地圖大小} (密度 ${dungeonConfig.牆壁密度})`,
            `🏁 終點獎勵：${dungeonConfig.終點功德 ?? 0} 功德`,
            `💡 提示：每天刷新步數 / 每周刷新地下城`,
            `⚠️ 注意：抵達終點後無法再次探索，需等待周日刷新`,
            `🟥-玩家 / 🟫-牆壁 / 🟦-鑽石 / 🟪-已獲得鑽石 / 🟨-終點`
        ].join('\n'));
}

// 更新可視
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

// 移動
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