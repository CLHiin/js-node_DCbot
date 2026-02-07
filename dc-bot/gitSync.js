// gitSync.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const branch = 'service';
const files = ['常用/資料庫.json', '公用檔案/'];
const url = `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/CLHiin/js-node_DCbot_private.git`;
const repoLink = 'https://github.com/CLHiin/js-node_DCbot_private/commit';

const run = (cmd, cb) => exec(cmd.replace(/\n\s+/g, ' '), { encoding: 'utf8' }, cb);
const logLink = hash => `🔗 ${repoLink}/${hash.trim()}`;

function gitPullOnStartup() {
  // 確保目錄存在（防呆）
  files.forEach(f => {if (f.endsWith('/') && !fs.existsSync(f)) fs.mkdirSync(f, { recursive: true });});

  const cmd = `
    git fetch ${url} ${branch} &&
    git checkout FETCH_HEAD -- ${files.map(f => `"${f}"`).join(' ')} &&
    git rev-parse FETCH_HEAD
  `;

  run(cmd, (err, remoteHash) => {
    if (err) return console.warn('⚠️ 啟動同步失敗:', err.message);
    console.log(`✅ 已從遠端版本覆蓋本地\n   📥 ${logLink(remoteHash.trim().split('\n').pop())}`);
  });
}

function gitSync() {
  const paths = files.filter(f => fs.existsSync(f));
  if (!paths.length) return console.log('⚠️ 沒有檔案需要同步');

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const marker = path.join(__dirname, '.last-backup-date');
  const isFirst = !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').trim() !== today;

  const cmd = `
    git config user.email "bot@render.com" &&
    git config user.name "Render Bot" &&
    git add -A ${paths.map(f => `"${f}"`).join(' ')} &&
    ${isFirst
      ? `git commit --allow-empty -m "Daily Backup ${today}"`
      : `git commit --allow-empty --amend -m "Auto Update (temp)" --no-edit`
    } &&
    git push ${url} HEAD:${branch} --force &&
    git rev-parse HEAD
  `.replace(/\n\s+/g, ' ');

  run(cmd, (err, localHash) => {
    if (err) return console.error('❌ Git 同步失敗:', err.message);
    const hash = localHash.trim().split('\n').pop(); // 👈 關鍵：只取最後一行
    console.log(`${isFirst ? '✅ 今日首次永久備份完成' : '✔️ 暫存更新已覆蓋'}\n   📤 🔗 ${repoLink}/${hash}`);
    if (isFirst) fs.writeFileSync(marker, today);
  });
}

module.exports = { gitSync, gitPullOnStartup };