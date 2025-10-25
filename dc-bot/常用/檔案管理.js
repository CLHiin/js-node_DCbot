const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // v2

const baseDir = path.join(__dirname, '..', '公用圖片');

async function ensureGuildFolder(guildId) {
  const guildFolder = path.join(baseDir, guildId);
  if (!fs.existsSync(guildFolder)) {
    fs.mkdirSync(guildFolder, { recursive: true });
  }
  return guildFolder;
}

/**
 * 下載檔案到伺服器專屬資料夾，並自動命名
 */
async function saveFileFromUrl(guildId, fileUrl, originalName, oldFileName = null) {
  const folder = await ensureGuildFolder(guildId);
  const existingFiles = fs.readdirSync(folder);

  // 取得最大編號
  let maxIndex = 0;
  existingFiles.forEach(file => {
    const match = file.match(/^(\d+)(\.[^.]+)?$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxIndex) maxIndex = num;
    }
  });

  const ext = path.extname(originalName) || '.png';
  const newIndex = maxIndex + 1;
  const newFileName = `${newIndex}${ext}`;
  const savePath = path.join(folder, newFileName);

  // 備份舊圖（若有）
  if (oldFileName) {
    await moveFileToTrash(guildId, oldFileName);
  }

  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`下載失敗: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(savePath, buffer);

  return newFileName;
}


/**
 * 將指定檔案搬移至已刪除資料夾，並加上時間戳記
 */
function moveFileToTrash(guildId, fileName) {
  const folder = path.join(baseDir, guildId);
  const trashFolder = path.join(folder, '已刪除');
  if (!fs.existsSync(trashFolder)) {
    fs.mkdirSync(trashFolder, { recursive: true });
  }

  const originalPath = path.join(folder, fileName);
  if (!fs.existsSync(originalPath)) return;

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-T:]/g, '').slice(0, 15); // YYYYMMDDHHmmss
  const newFileName = `${timestamp}_${base}${ext}`;
  const trashPath = path.join(trashFolder, newFileName);

  fs.renameSync(originalPath, trashPath);
}

/**
 * 列出伺服器資料夾所有檔案
 */
function listFiles(guildId) {
  const folder = path.join(baseDir, guildId);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder);
}

/**
 * 取得完整本地路徑
 */
function getFilePath(guildId, fileName) {
  return path.join(baseDir, guildId, fileName);
}

module.exports = {
  saveFileFromUrl,
  listFiles,
  getFilePath,
  moveFileToTrash,
};
