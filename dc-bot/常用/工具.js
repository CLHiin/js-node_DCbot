/**
 * 可靠回覆 interaction
 * @param {import("discord.js").Interaction} interaction
 * @param {Object} options Discord.js 回覆選項（content, embeds, files...）
 * @param {boolean} [allowSend=true] 若 reply/followUp 失敗是否 fallback 到 channel.send
 */
async function safeReply(interaction, options, allowSend = true) {
    try {
        if (!interaction.replied && !interaction.deferred) {
            return await interaction.reply(options);
        } else {
            return await interaction.followUp(options);
        }
    } catch (err) {
        if (allowSend && interaction.channel) {
            try {
                return await interaction.channel.send(options);
            } catch {
                // 忽略 channel.send 的錯誤
            }
        }
    }
}

module.exports = { safeReply };
