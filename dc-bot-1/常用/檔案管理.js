const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const { gitSync } = require('../gitSync'); // 假設 gitSync 改成非同步 exec 版本

const baseDir = path.join(__dirname, '..', '公用檔案');

/**
 * 確保伺服器專屬資料夾存在
 */
async function ensureGuildFolder(guildId) {
  const guildFolder = path.join(baseDir, guildId);
  try {
    await fs.mkdir(guildFolder, { recursive: true });
    gitSync(`Create folder for guild ${guildId}`); // 非阻塞
  } catch (err) {
    console.error('⚠️ 建立資料夾失敗:', err.message);
  }
  return guildFolder;
}

/**
 * 下載檔案到伺服器專屬資料夾，並自動命名
 */
async function saveFileFromUrl(guildId, fileUrl, originalName, oldFileName = null) {
  const folder = await ensureGuildFolder(guildId);

  const existingFiles = await fs.readdir(folder);
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

  if (oldFileName) {
    await moveFileToTrash(guildId, oldFileName);
  }

  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`下載失敗: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(savePath, buffer);

  gitSync(`Add or update file for guild ${guildId}: ${newFileName}`); // 非阻塞

  return newFileName;
}

/**
 * 將指定檔案搬移至已刪除資料夾
 */
async function moveFileToTrash(guildId, fileName) {
  const folder = path.join(baseDir, guildId);
  const trashFolder = path.join(folder, '已刪除');

  try {
    await fs.mkdir(trashFolder, { recursive: true });

    const originalPath = path.join(folder, fileName);

    // ▼ 建立日期格式：20251117_153502
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const newFileName = `${yyyy}${mm}${dd}_${hh}${mi}${ss}_${fileName}`;
    try {
      await fs.rename(originalPath, path.join(trashFolder, newFileName));

      // 非阻塞 Git 同步
      gitSync(`Move ${fileName} to trash for guild ${guildId}`);
    } catch (err) {
      if (err.code !== 'ENOENT')
        console.error('⚠️ 搬移檔案失敗:', err.message);
    }

  } catch (err) {
    console.error('⚠️ 建立已刪除資料夾失敗:', err.message);
  }
}

/**
 * 列出伺服器資料夾所有檔案
 */
async function listFiles(guildId) {
  const folder = path.join(baseDir, guildId);
  try {
    return await fs.readdir(folder);
  } catch {
    return [];
  }
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
