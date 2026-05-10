const fs = require('fs');
const path = require('path');
const { gitSync } = require('../gitSync');

const dataFilePath = path.resolve(__dirname, '資料庫.json');
// ✅ 單純讀檔
function loadData() {
  try {
    if (!fs.existsSync(dataFilePath)) fs.writeFileSync(dataFilePath, '{}', 'utf-8');
    const raw = fs.readFileSync(dataFilePath, 'utf-8');
    return JSON.parse(raw);
  }
  catch (error) {
    console.error('讀取資料失敗:', error);
    return {};
  }
}
// ✅ 單純寫檔
function saveData(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    try {
      gitSync("Update JSON data");
    } catch (err) {
      console.error('⚠️ Git 同步錯誤:', err.message);
    }
  }
  catch (error) {
    console.error('寫入資料失敗:', error);
  }
}
// ✅ 深度合併：補齊缺少的欄位，但不覆蓋既有資料
function deepMerge(target, source) {
  for (const key in source) {
    const tgtVal = target[key];
    const srcVal = source[key];

    // 處理 Array
    if (Array.isArray(srcVal)) {
      if (!Array.isArray(tgtVal)) {
        target[key] = [...srcVal]; // 複製陣列
      }
      continue;
    }

    // 處理 Object
    if (srcVal && typeof srcVal === 'object') {
      // 目標不存在 || 目標不是物件 || 目標是陣列 則目標變成空物件
      if (!tgtVal || typeof tgtVal !== 'object' || Array.isArray(tgtVal)) {
        target[key] = {};
      }
      // 繼續深度合併內部
      deepMerge(target[key], srcVal);
      continue;
    }

    // 處理基本型別 (number, string, boolean, null, undefined)
    if (!(key in target)) {
      target[key] = srcVal;
    }
  }
  return target;
}
// ✅ 預設資料
const DEFAULTS = {
  serverSettings: {
    參拜功德: -1,
    商品清單: [],
    常駐獎池設定: {
      消耗功德: 0, SSR: 0, SR : 0, 小保底起始: null, 小保底終點: null,
      大保底: null, 召神值: false, 開放: false, 獎品清單: []
    },
    限定獎池設定: {
      消耗功德: 0, SSR: 0, SR : 0, 小保底起始: null, 小保底終點: null,
      大保底: null, 召神值: false, 開放: false, 獎品清單: []
    },
    地下城: {
      地圖大小: null, 牆壁密度: null, 鑽石數量: null, 每日步數: null,
      鑽石功德: null, 終點功德: null, 統一地圖: null, 地圖: null
    },
  },
  user: {
    參拜次數: 0,
    剩餘功德: 0,
    累積功德: 0,
    最後參拜日期: '無資料',
    留言: null,
    特殊物件: {},
    常駐獎池: { 總計抽數: 0, 該期抽數: 0, 小保: 0, 大保: 0},
    限定獎池: { 總計抽數: 0, 該期抽數: 0, 小保: 0, 大保: 0},
    地下城: {
      刷新日期: null, 探索日期: null, 步數: null, 地圖: null, 探索: null,
      可視: null, 座標: null, 鑽石: null, 完成: false, 探索時間: null
    }
  }
};
// ✅ 資料存取器
const DataStore = {
  // 取得資料
  get(guildId, userId = null) {
    const data = loadData();
    // 初始化 guildId / userId 的儲存空間    
    data[guildId] ||= {};
    if (userId == null) return data[guildId];
    
    data[guildId][userId] ||= {};

    const defaultData = userId === 'serverSettings' ? DEFAULTS.serverSettings : DEFAULTS.user;
    // 合併資料（補齊缺少欄位，但不覆蓋既有）
    deepMerge(data[guildId][userId], defaultData);
    return data[guildId][userId];
  },

  // 更新資料
  update(guildId, userId, newData = {}) {
    const data = loadData();
    data[guildId] ||= {};
    data[guildId][userId || 'serverSettings'] = newData;
    saveData(data);
  },

  reset(guildId, userId = 'serverSettings') {
    const data = loadData();
    data[guildId] ||= {};
    data[guildId][userId] = JSON.parse(
      JSON.stringify(userId === 'serverSettings' ? DEFAULTS.serverSettings : DEFAULTS.user)
    );
    saveData(data);
  },

  delete(guildId, userId) {
    const data = loadData();
    if (data[guildId] && data[guildId][userId]) {
      delete data[guildId][userId];
      saveData(data);
    }
  },

  getAll() {
    return loadData();
  }
};

module.exports = { DataStore };