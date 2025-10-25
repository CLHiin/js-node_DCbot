const RARITY = { SSR: '🟨', SR: '🟪', R: '🟦' };

// 下一個SSR機率
function calcNextSSRRate(pool, userData, 限定模式 = false) {
  const 獎池Key = 限定模式 ? '限定獎池' : '常駐獎池';

  // 確保 userData[獎池Key] 存在，並初始化小保
  if (!userData[獎池Key]) userData[獎池Key] = {};
  const 小保量 = Number(userData[獎池Key].小保 ?? 0);

  // SSR 基礎機率
  const SSR_base = Number(pool?.SSR ?? 0);
  let SSR率 = SSR_base;

  const 小保起始 = Number(pool?.小保底起始 ?? 0);
  const 小保終點 = Number(pool?.小保底終點 ?? 0);

  // 計算小保加成
  if (小保起始 > 0 && 小保終點 > 0 && 小保終點 >= 小保起始) {
    if (小保量 >= 小保終點) SSR率 = 100;
    else if (小保量 >= 小保起始) {
      const diff = 小保終點 - 小保起始;
      const boost = ((小保量 - 小保起始 + 1) / diff) * (100 - SSR_base);
      SSR率 = SSR_base + boost;
    }
  }

  // 保證 SSR率在 0~100 範圍
  SSR率 = Math.min(Math.max(SSR率, 0), 100);

  return SSR率;
}

function formatPrizeName(item) {
  return (item?.UP ? '【UP】' : '') + (item?.名稱 || '未知獎勵');
}

// 獲取抽獎權重
function getRandomByWeight(pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;

  let fixedTotal = 0;
  let flexibleCount = 0;

  for (const item of pool) {
    if (item.占比 === -1) flexibleCount++;
    else if (typeof item.占比 === 'number' && item.占比 > 0) fixedTotal += item.占比;
  }

  let leftover = Math.max(0, 100 - fixedTotal);
  const flexibleWeight = flexibleCount > 0 ? leftover / flexibleCount : 0;

  const weights = pool.map(item => {
    if (item.占比 === -1) return flexibleWeight;
    if (typeof item.占比 === 'number' && item.占比 > 0) return item.占比;
    return 0;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return pool[Math.floor(Math.random() * pool.length)];

  let rand = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    if (rand < weights[i]) return pool[i];
    rand -= weights[i];
  }
  return pool[pool.length - 1];
}

/**
 * 抽卡主函數（支援常駐 / 限定模式）
 */
function drawGacha(poolConfig, userData, count, 召神值模式 = false, 限定模式 = false) {
  if (!poolConfig || !userData || count <= 0) return null;

  const 分類 = { SSR: [], SR: [], R: [] };
  for (const item of poolConfig.獎品清單 || []) {
    if (分類[item.稀有度]) 分類[item.稀有度].push(item);
  }

  const 獎池Key = 限定模式 ? '限定獎池' : '常駐獎池';
  if (!userData[獎池Key]) userData[獎池Key] = { 小保: 0, 大保: 0, 總抽數: 0 };

  const 大保底數字 = poolConfig.大保底 ?? 999; // 無設定就用大數
  const 所有結果 = [];
  const 獲得身分組 = new Set();
  const 獲得檔案 = new Set();
  const 本次特殊物件 = {};

  for (let i = 0; i < count; i++) {
    const SSR率 = calcNextSSRRate(poolConfig, userData, 限定模式);
    const SR率 = poolConfig.SR ?? 10;
    const R率 = Math.max(0, 100 - SSR率 - SR率);

    let 階段抽 = getRandomByWeight([
      { type: 'SSR', 占比: SSR率 },
      { type: 'SR', 占比: SR率 },
      { type: 'R', 占比: R率 }
    ]);

    let 獲得 = getRandomByWeight(分類[階段抽?.type] || []);

    // 十連保底 SR
    if (count === 10 && 所有結果.every(r => r.稀有度 === 'R') && 分類.SR.length > 0) {
      獲得 = getRandomByWeight(分類.SR);
    }

    // 大保底 UP
    const 強制UP抽 = userData[獎池Key].大保 >= 大保底數字 && (召神值模式 || 獲得?.稀有度 === 'SSR');
    if (強制UP抽) {
      const UP列表 = (分類.SSR || []).filter(x => x.UP);
      if (UP列表.length > 0) 獲得 = UP列表[0];
      else {
        獲得 = {
          名稱: 限定模式 ? '限定UP保底卷' : '常駐UP保底卷',
          描述: '可兌換 UP 獎勵',
          稀有度: 'SSR',
          占比: 0,
          UP: true,
          特殊物件: 限定模式 ? '限定UP保底卷' : '常駐UP保底卷'
        };
      }
    }

    所有結果.push({ 名稱: formatPrizeName(獲得), 稀有度: 獲得?.稀有度 || 'R' });

    // 處理身分組
    if (Array.isArray(獲得?.身分組)) 獲得.身分組.forEach(r => 獲得身分組.add(`<@&${r}>`));
    else if (typeof 獲得?.身分組 === 'string') 獲得身分組.add(`<@&${獲得.身分組}>`);

    if (獲得?.檔案名稱) 獲得檔案.add(獲得.檔案名稱);

    if (獲得?.特殊物件) {
      userData.特殊物件[獲得.特殊物件] = (userData.特殊物件[獲得.特殊物件] || 0) + 1;
      本次特殊物件[獲得.特殊物件] = (本次特殊物件[獲得.特殊物件] || 0) + 1;
    }

    // 更新保底
    userData[獎池Key].小保 = (獲得?.稀有度 === 'SSR') ? 0 : (userData[獎池Key].小保 + 1);
    userData[獎池Key].大保 = (獲得?.UP) ? 0 : (userData[獎池Key].大保 + 1);
    userData[獎池Key].總抽數 = (userData[獎池Key].總抽數 || 0) + 1;
  }

  userData.剩餘功德 = (userData.剩餘功德 || 0) - count * (poolConfig.消耗功德 || 0);

  return {
    results: 所有結果,
    roles: [...獲得身分組],
    files: [...獲得檔案],
    specials: 本次特殊物件,
    userData
  };
}
const { EmbedBuilder } = require('discord.js');

// 生成獎池狀態文字
function generatePoolEmbed(pool, title, color = 0x3399FF) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription([
      `💰 消耗功德：${pool.消耗功德 ?? '未設定'}`,
      `🟨 SSR 機率：${pool.SSR ?? '未設定'}%`,
      `🟪 SR 機率：${pool.SR ?? '未設定'}%`,
      `🟦 R 機率：${100 - ((pool.SSR ?? 0) + (pool.SR ?? 0))}%`,
      `📈 小保底起始：${pool.小保底起始 ?? '未設定'}`,
      `📈 小保底終點：${pool.小保底終點 ?? '未設定'}`,
      `🛡️ 大保底：${pool.大保底 ?? '未設定'}`,
      `🌟 召神值模式：${pool.召神值 ? '✅ 是' : '❌ 否'}`,
      `🔔 開放：${pool.開放 ? '✅ 是' : '❌ 否'}`,
    ].join('\n'));
}

function generatePrizeEmbed(獎品清單, content, filterRarity = null) {
  const RARITIES = ['SSR', 'SR', 'R'];
  const raritiesToShow = filterRarity && RARITIES.includes(filterRarity) ? [filterRarity] : RARITIES;

  // 建立主要 embed
  const embed = new EmbedBuilder().setTitle('🎯 獎品總覽').setColor(0x00AEFF).setDescription(content);

  // 整理顯示的獎品
  const allItems = raritiesToShow.flatMap((rarity) =>獎品清單.filter((i) => i.稀有度 === rarity).map((i) => ({ ...i, rarity })));

  if (!allItems.length) {
    embed.addFields({ name: '⚠️ 無資料', value: '該稀有度下沒有可顯示的獎品。' });
    return [embed];
  }

  // 為每個稀有度計算平分占比
  const rarityShareMap = {};
  for (const rarity of raritiesToShow) {
    const group = allItems.filter((i) => i.稀有度 === rarity);
    const 固定總 = group.reduce((sum, i) => sum + (i.占比 >= 0 ? i.占比 : 0), 0);
    const 平分數 = group.filter((i) => i.占比 === -1).length;
    rarityShareMap[rarity] = 平分數 ? Math.max(0, (100 - 固定總) / 平分數) : 0; // 平分占比
  }

  let descriptionText = '';

  // 按稀有度依序顯示
  for (const rarity of raritiesToShow) {
    const group = allItems.filter((i) => i.稀有度 === rarity);
    if (!group.length) continue;
    if (descriptionText) descriptionText += '\n'; // 不同稀有度間空一行
    for (const item of group) {
      const 占比文字 = item.占比 >= 0 ? item.占比.toFixed(2) + '%' : `${rarityShareMap[item.稀有度].toFixed(2)}%[平分]`;
      const 名稱顯示 = formatPrizeName(item);

      // 組合附帶資訊
      const 附帶清單 = [];
      if (item.檔案名稱) 附帶清單.push(`[${item.檔案名稱}]`);
      if (item.身分組  ) 附帶清單.push(`[@${item.身分組}]`);
      if (item.特殊物件) 附帶清單.push(`[${item.特殊物件}x1]`);

      const 描述文字 = ` 描述：${item.描述 || '無'}`;
      const 附帶文字 = 附帶清單.length ? `附帶：${附帶清單.join(' ')}` : '附帶：無';

      descriptionText += `${RARITY[item.稀有度]} ${名稱顯示}（${占比文字}）\n📝 ${描述文字}\n📎 ${附帶文字}\n`;
    }
  }

  embed.setDescription(`${content}\n\n${descriptionText}`);

  return [embed];
}

module.exports = {
  RARITY,
  calcNextSSRRate,
  formatPrizeName,
  getRandomByWeight,
  drawGacha,
  generatePoolEmbed,
  generatePrizeEmbed,
};
