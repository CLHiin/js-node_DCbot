const fs = require('fs');
const path = require('path');

const dataFilePath = path.resolve(__dirname, '資料庫.json');

// ✅ 單純讀檔
function loadData() {
  try {
    if (!fs.existsSync(dataFilePath)) {
      fs.writeFileSync(dataFilePath, '{}', 'utf-8');
    }
    const raw = fs.readFileSync(dataFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('讀取資料失敗:', error);
    return {};
  }
}

// ✅ 單純寫檔
function saveData(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('寫入資料失敗:', error);
  }
}

// ✅ 深度合併：補齊缺少的欄位，但不覆蓋既有資料
function deepMerge(target, source) {
  for (const key in source) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (Array.isArray(srcVal)) {
      // 如果目標沒有這個 key，就直接補一份陣列
      if (!Array.isArray(tgtVal)) {
        target[key] = [...srcVal];
      }
    } else if (srcVal && typeof srcVal === 'object') {
      // 如果目標不是物件，強制變成物件
      if (!tgtVal || typeof tgtVal !== 'object' || Array.isArray(tgtVal)) {
        target[key] = {};
      }
      deepMerge(target[key], srcVal);
    } else {
      // 原始型別 (number, string, boolean, null, undefined)
      if (!(key in target)) {
        target[key] = srcVal;
      }
    }
  }
  return target;
}

// ✅ 取得使用者資料（或伺服器設定）
function getUser(guildId, userId = 'serverSettings', defaultData = {}) {
  const data = loadData();
  if (!userId) userId = 'serverSettings';
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = {};
  if (defaultData == 'user') defaultData = {
      參拜次數: 0,
      剩餘功德: 0,
      累積功德: 0,
      最後參拜日期: '無資料',
      留言: null,
      特殊物件: {},
      常駐獎池: { 總抽數: 0, 小保: 0, 大保: 0 },
      限定獎池: { 總抽數: 0, 小保: 0, 大保: 0 }
  };
  if (defaultData == 'set') defaultData = {
    參拜功德: -1,
    商品清單: [],
    獎池設定: {
      獎品清單: []
    },
    限定獎池設定: {
      獎品清單: []
    },
  };
  deepMerge(data[guildId][userId], defaultData);

  return data[guildId][userId];
}

// ✅ 更新使用者資料
function updateUser(guildId, userId = 'serverSettings', newData) {
  const data = loadData();
  if (!userId) userId = 'serverSettings';
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId] = newData;
  saveData(data);
}

module.exports = {
  getUser,
  updateUser,
  loadData,
  saveData,
};
