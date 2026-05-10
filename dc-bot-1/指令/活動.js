const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DataStore } = require("../常用/儲存檔");
const { safeReply } = require('../常用/工具');

// 轉換分鐘 → hh:mm 文字
function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;

    if (h > 0 && m > 0) return `${h} 小時 ${m} 分`;
    if (h > 0) return `${h} 小時`;
    return `${m} 分`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("活動")
        .setDescription("💎 創建活動按鈕，點擊可獲得功德(管理員限定)")
        .addIntegerOption(option => option.setName("時間").setDescription("活動持續時間(分鐘)").setRequired(true))
        .addStringOption(option => option.setName("標題").setDescription("活動標題").setRequired(true))
        .addStringOption(option => option.setName("內文").setDescription("活動內文").setRequired(true))
        .addIntegerOption(option => option.setName("功德").setDescription("基礎功德").setRequired(true))
        .addIntegerOption(option => option.setName("範圍").setDescription("隨機額外功德範圍").setRequired(false))
        .addBooleanOption(option => option.setName("提醒").setDescription("將最終結果傳給你").setRequired(false)),

    async execute(interaction) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has("Administrator")) {
            return safeReply(interaction,{ content: "❌ 你沒有權限使用此指令！", ephemeral: true });
        }

        const title = interaction.options.getString("標題");
        const description = interaction.options.getString("內文").split("\\n").join("\n");
        const basePower = interaction.options.getInteger("功德");
        const extraRange = interaction.options.getInteger("範圍") || 0;
        const minutes = interaction.options.getInteger("時間");
        const notify = interaction.options.getBoolean("提醒") || false;

        const buttonId = `event_${Date.now()}`;
        const minGain = basePower + Math.min(0, extraRange);
        const maxGain = basePower + Math.max(0, extraRange);
        const rangeText = extraRange ? `${minGain}~${maxGain}` : basePower;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(buttonId)
                .setLabel("參加活動 💎")
                .setStyle(ButtonStyle.Success)
        );

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x00ff00)
            .setFooter({ text: `時間：${formatMinutes(minutes)} | 功德：${rangeText}` });

        const claimed = new Map();
        let message;

        try {
            message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        } catch (err) {
            console.warn("⚠️ 活動建立失敗:", err.message);
            if (interaction.channel) interaction.channel.send({ content: "⚠️ 活動建立失敗，請重新嘗試。", embeds: [embed] });
            return;
        }

        const collector = message.createMessageComponentCollector({
            filter: (i) => i.customId === buttonId,
            time: minutes * 60 * 1000,
        });

        collector.on("collect", async (i) => {
            if (claimed.has(i.user.id)) {
                return safeReply(i,{ content: "❌ 你已經領過這次活動了！", ephemeral: true }, false);
            }

            let gain = basePower;
            if (extraRange) gain = Math.floor(Math.random() * (maxGain - minGain + 1)) + minGain;

            const guildId = interaction.guild.id;
            const userId = i.user.id;
            const user = DataStore.get(guildId, userId);
            user.剩餘功德 = (user.剩餘功德 || 0) + gain;
            user.累積功德 = (user.累積功德 || 0) + gain;
            DataStore.update(guildId, userId, user);
            claimed.set(i.user.id, gain);
            i.reply({ content: `🎉 你獲得了 **${gain} 功德**！\n目前剩餘：**${user.剩餘功德}**`, ephemeral: true });
        });

        collector.on("end", async () => {
            const total = claimed.size;
            const sorted = [...claimed.entries()].sort((a, b) => b[1] - a[1]);
            const displayTop = sorted.slice(0, 10);
            let summary = `-# 時間：${formatMinutes(minutes)} | 功德：${rangeText}\n📌 活動結束！共 **${total} 位** 玩家參與：\n\n`;

            for (const [userId, gain] of displayTop) {
                summary += `💎 獲得 **${gain} 功德** → <@${userId}>\n`;
            }
            if (total > 10) summary += `\n…以及其他 **${total - 10} 位** 玩家`;

            const endEmbed = EmbedBuilder.from(embed).setFooter({
                text: `活動已結束｜共 ${total} 人參與`,
            });

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(buttonId)
                    .setLabel("活動已結束")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            // 更新訊息 → 顯示排行榜
            message.edit({
                embeds: [endEmbed.addFields({ name: "📊 活動統計", value: summary }),],
                components: [disabledRow],
            }).catch(() => {});
            if (notify) try {
                const eventUrl = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${message.id}`;
                let fullList = `📋【活動完整清單】\n`;
                fullList += `活動名稱：${title}\n`;
                fullList += `參與人數：${total}\n`;
                fullList += `活動連結：${eventUrl}\n\n`;
                for (const [userId, gain] of sorted) {
                    fullList += `💎 ${gain} 功德 → <@${userId}>\n`;
                }
                interaction.user.send({
                    content: fullList.length > 1900
                        ? "📋 活動完整清單過長，請查看下方檔案\n\n🔗 活動連結：\n" + eventUrl
                        : fullList,
                    files: fullList.length > 1900
                        ? [{
                            attachment: Buffer.from(fullList, "utf-8"),
                            name: `活動清單_${Date.now()}.txt`,
                        }]
                        : [],
                });
            } catch (err) {
                console.warn("⚠️ 無法私訊管理員活動清單");
            }
        });
    },
};