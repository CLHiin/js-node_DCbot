const RARITY = { SSR: '🟨', SR: '🟪', R: '🟦' };

function calcNextSSRRate(pool, userData, 限定模式 = false) {
  const 小保 = userData[限定模式?"限定獎池":"常駐獎池"]?.小保 ?? 0;
  
  const SSR_base = pool.SSR ?? 2;
  let SSR率 = SSR_base;
  if (pool.小保底起始 !== undefined && pool.小保底終點 !== undefined) {
    if (小保 >= pool.小保底終點) SSR率 = 100;
    else if (小保 >= pool.小保底起始) {
      const diff = pool.小保底終點 - pool.小保底起始;
      const boost = ((小保 - pool.小保底起始 + 1) / diff) * (100 - SSR_base);
      SSR率 = SSR_base + boost;
    }
  }
  return SSR率;
}

function formatPrizeName(item) {
  return (item.UP ? '【UP】' : '') + item.名稱;
}

function getRandomByWeight(pool) {
  let fixedTotal = 0;
  let flexibleCount = 0;
  for (const item of pool) {
    if (item.占比 === -1) flexibleCount++;
    else if (typeof item.占比 === 'number' && item.占比 > 0) fixedTotal += item.占比;
  }
  let leftover = 100 - fixedTotal;
  if (leftover < 0) leftover = 0;
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
 * @param {*} pool 獎池設定物件
 * @param {*} userData 用戶資料物件（會修改）
 * @param {*} count 抽卡次數
 * @param {*} 召神值模式 boolean (是否啟用召神值保底)
 * @param {*} 限定模式 boolean (是否為限定池)
 * @returns 抽卡結果與更新後用戶資料
 */
function drawGacha(pool, userData, count, 召神值模式 = false, 限定模式 = false) {
  const 分類 = { SSR: [], SR: [], R: [] };
  for (const item of pool.獎品清單) {
    if (分類[item.稀有度]) 分類[item.稀有度].push(item);
  }

  const 大保底數字 = pool.大保底;
  const 所有結果 = [];
  const 獲得身分組 = new Set();
  const 獲得檔案 = new Set();
  const 本次特殊物件 = {};

  // 依模式選擇要操作的保底資料
  const 獎池Key = 限定模式 ? '限定獎池' : '常駐獎池';
  if (!userData[獎池Key]) {
    userData[獎池Key] = { 小保: 0, 大保: 0, 總抽數: 0 };
  }

  for (let i = 0; i < count; i++) {
    const SSR率 = calcNextSSRRate(pool, userData, 限定模式);
    const SR率 = pool.SR;
    const R率 = Math.max(0, 100 - SSR率 - SR率);

    let 階段抽 = getRandomByWeight([
      { type: 'SSR', 占比: SSR率 },
      { type: 'SR', 占比: SR率 },
      { type: 'R', 占比: R率 }
    ]);
    let 獲得 = getRandomByWeight(分類[階段抽.type]);

    // 十連保底 SR
    if (count === 10 && 所有結果.every(r => r.稀有度 === 'R')) {
      獲得 = getRandomByWeight(分類.SR);
    }
    // 大保底 UP 抽
    const 強制UP抽 = userData[獎池Key].大保 >= 大保底數字 && (召神值模式 || 獲得.稀有度 === 'SSR');
    if (強制UP抽) {
      let UP列表 = 分類.SSR.filter(x => x.UP);
      if (UP列表.length > 0) 獲得 = UP列表[0];
      else {
        獲得 = {
          名稱: 限定模式 ? '限定UP保底卷' : '常駐UP保底卷',
          描述: 限定模式 ? '可兌換限定UP的SSR獎勵' : '可兌換常駐UP的SSR獎勵',
          稀有度: 'SSR',
          占比: 0,
          身分組: null,
          檔案名稱: null,
          UP: true,
          特殊物件: 限定模式 ? '限定UP保底卷' : '常駐UP保底卷'
        };
      }
    }

    所有結果.push({ 名稱: formatPrizeName(獲得), 稀有度: 獲得.稀有度 });

    // 處理身分組
    const processRole = roleId => {
      const roleTag = `<@&${roleId}>`;
      if (!獲得身分組.has(roleTag)) 獲得身分組.add(roleTag);
    };
    if (Array.isArray(獲得.身分組)) 獲得.身分組.forEach(processRole);
    else if (typeof 獲得.身分組 === 'string') processRole(獲得.身分組);

    if (獲得.檔案名稱) 獲得檔案.add(獲得.檔案名稱);

    if (獲得.特殊物件) {
      userData.特殊物件[獲得.特殊物件] = (userData.特殊物件[獲得.特殊物件] || 0) + 1;
      本次特殊物件[獲得.特殊物件] = (本次特殊物件[獲得.特殊物件] || 0) + 1;
    }

    // 更新對應獎池的保底
    userData[獎池Key].小保++;
    userData[獎池Key].大保++;
    userData[獎池Key].總抽數++;

    if (獲得.稀有度 === 'SSR') userData[獎池Key].小保 = 0;
    if (獲得.UP) userData[獎池Key].大保 = 0;
  }

  userData.剩餘功德 -= count * pool.消耗功德;

  return {
    results: 所有結果,
    roles: [...獲得身分組],
    files: [...獲得檔案],
    specials: 本次特殊物件,
    userData
  };
}

module.exports = {
  RARITY,
  calcNextSSRRate,
  formatPrizeName,
  getRandomByWeight,
  drawGacha
};
