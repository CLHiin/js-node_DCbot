const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { DataStore } = require('../常用/儲存檔');
const { safeReply } = require('../常用/工具');
const path = require('path');
const fs = require('fs');

// 註冊中文字型
registerFont(path.join(__dirname, '../fonts/NotoSansTC-Bold.ttf'), { family: 'NotoSansTC' });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('個人名片')
    .setDescription('🪪 生成自己或他人的名片')
    .addUserOption(option => 
      option.setName('目標')
        .setDescription('要查看誰的名片（不填看自己）')
        .setRequired(false)
    )
    .addStringOption(option => 
      option.setName('留言')
        .setDescription('想說的話（不填會使用預設）')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const targetUser = interaction.options.getUser('目標') || interaction.user;
    const targetUserId = targetUser.id;
    const serverName = interaction.guild ? interaction.guild.name : '未知伺服器';

    const user = await DataStore.get(guildId, targetUserId);

    if (targetUserId === interaction.user.id) {
      const inputPhrase = interaction.options.getString('留言');
      if (inputPhrase && inputPhrase.trim() !== '') {
        user.留言 = inputPhrase.trim();
        DataStore.update(guildId, targetUserId, user);
      }
    }

    const phrase = user.留言 || '願神明庇佑，平安喜樂。';

    // Canvas 初始化
    const canvasX = 800;
    const canvasY = 700;
    const canvas = createCanvas(canvasX, canvasY);
    const ctx = canvas.getContext('2d');

    // 背景漸層
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1e1e2f');
    gradient.addColorStop(1, '#3b3b5f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 外框
    const radius = 20;
    ctx.fillStyle = '#fff';
    roundRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, radius);
    ctx.fill();

    ctx.fillStyle = '#2c2c44';
    roundRect(ctx, 20, 20, canvas.width - 40, canvas.height - 40, radius - 5);
    ctx.fill();

    // 頭像
    const avatar = await loadImage(targetUser.displayAvatarURL({ extension: 'png', size: 256 }));
    const avatarX = 40;
    const avatarY = 80;
    const avatarSize = 100;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // CC 圖
    const ccImg = await loadImage(fs.readFileSync(path.join(__dirname, '../圖片/cc.png')));
    const ccSize = 256;
    ctx.drawImage(ccImg, canvas.width - ccSize - 30, 30, ccSize, ccSize);

    // 伺服器名稱
    ctx.fillStyle = '#ffeaa7';
    ctx.font = '700 22px "NotoSansTC"';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 3;
    ctx.fillText(serverName, canvas.width - 30, canvas.height - 30);

    // 名字框
    const nameBoxX = avatarX + avatarSize + 20;
    const nameBoxY = avatarY - 10;
    const nameBoxW = 300;
    const nameBoxH = 50;
    ctx.fillStyle = '#444466';
    roundRect(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, 10);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '700 28px "NotoSansTC"';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 2;
    ctx.fillText(targetUser.username, nameBoxX + 15, nameBoxY + 35);

    // 留言框
    const phraseBoxX = nameBoxX;
    const phraseBoxY = nameBoxY + nameBoxH + 15;
    const phraseBoxW = 300;
    const phraseBoxH = 150;
    ctx.fillStyle = '#555577';
    roundRect(ctx, phraseBoxX, phraseBoxY, phraseBoxW, phraseBoxH, 10);
    ctx.fill();

    ctx.fillStyle = '#ffeaa7';
    ctx.font = '500 20px "NotoSansTC"';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 3;
    wrapText(ctx, phrase, phraseBoxX + 15, phraseBoxY + 30, phraseBoxW - 30, 26, phraseBoxH - 40);

    // 參拜資訊
    const infoBaseX = 40;
    const lineHeight = 30;
    let infoY = avatarY + avatarSize + phraseBoxH;

    ctx.fillStyle = '#fff';
    ctx.font = '500 22px "NotoSansTC"';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 1;

    const leftTexts = [
      `參拜次數：${user.參拜次數}`,
      `剩餘功德：${user.剩餘功德}`,
      `累積功德：${user.累積功德 || 0}`,
      `最後參拜：${user.最後參拜日期}`
    ];

    let maxLeftTextWidth = 0;
    for (const text of leftTexts) {
      const width = ctx.measureText(text).width;
      if (width > maxLeftTextWidth) maxLeftTextWidth = width;
    }

    for (const text of leftTexts) {
      ctx.fillText(text, infoBaseX, infoY);
      infoY += lineHeight;
    }

    // 特殊物件
    const gap = 50;
    let itemY = infoY + 30;
    let itemBaseX = infoBaseX;

    ctx.fillStyle = '#fff';
    ctx.font = '700 20px "NotoSansTC"';
    ctx.fillText('特殊物件：', itemBaseX, itemY);
    itemY += 28;

    
    const 特殊物件清單 = Object.entries(user.特殊物件);
    if (特殊物件清單.length === 0) ctx.fillText('無特殊物件', itemBaseX, itemY);
    else {
      特殊物件清單.sort((a, b) => {
        const len = str => [...str].reduce((acc, c) => c.charCodeAt(0) > 255 ? acc + 2 : acc + 1, 0);
        return len(b[0]) - len(a[0]);
      });
      user.特殊物件 = Object.fromEntries(特殊物件清單);
      let colMaxWidth = 0;
      for (const [name, count] of 特殊物件清單) {
        const text = `- ${name} x ${count}`;
        ctx.fillText(text, itemBaseX, itemY);
        colMaxWidth = Math.max(colMaxWidth, ctx.measureText(text).width);
        if ((itemY += 26) > canvasY - 26) {
          itemBaseX += colMaxWidth + infoBaseX; 
          itemY = infoY + 48;
          colMaxWidth = 0;
        }
      }
    }

    // 常駐/限定獎池資訊
    const poolBaseX = infoBaseX + maxLeftTextWidth + gap;
    const drawPool = (title, poolData, poolBaseX) => {
      let poolY = avatarY + avatarSize + phraseBoxH;
      ctx.fillStyle = '#fff';
      ctx.font = '700 20px "NotoSansTC"';
      ctx.fillText(title, poolBaseX, poolY);
      poolY += 28;

      ctx.font = '500 20px "NotoSansTC"';
      ctx.fillText(`總計抽數：${poolData['總計抽數'] || 0}`, poolBaseX, poolY);
      poolY += 26;
      ctx.fillText(`該期抽數：${poolData['該期抽數'] || 0}`, poolBaseX, poolY);
      poolY += 26;
      ctx.fillText(`小保底：${poolData['小保'] || 0}`, poolBaseX, poolY);
      poolY += 26;
      ctx.fillText(`大保底：${poolData['大保'] || 0}`, poolBaseX, poolY);
      poolY += 26;
    };
    if (user['常駐獎池'] && typeof user['常駐獎池'] === 'object') drawPool('常駐獎池：', user['常駐獎池'], poolBaseX);
    if (user['限定獎池'] && typeof user['限定獎池'] === 'object') drawPool('限定獎池：', user['限定獎池'], poolBaseX + 200);

    // 輸出 PNG
    const pngBuffer = canvas.toBuffer('image/png');
    const attachment = new AttachmentBuilder(pngBuffer, { name: '個人名片.png' });
    DataStore.update(guildId, targetUserId, user);
    safeReply(interaction, { files: [attachment] });
  }
};

// 圓角矩形輔助
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ✅ 改進後的自動換行（防止超出框）
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxHeight) {
  const words = text.split('');
  let line = '';
  let lines = [];
  for (const char of words) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      lines.push(line);
      line = char;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);

  const maxLines = Math.floor(maxHeight / lineHeight);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let lastLine = lines[lines.length - 1];
    while (ctx.measureText(lastLine + '...').width > maxWidth && lastLine.length > 0) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[lines.length - 1] = lastLine + '...';
  }

  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lineHeight;
  }
}
