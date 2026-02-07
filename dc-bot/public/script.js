let allLogs = [];
let fullData = null;

// ========== 確認bot狀態 ==========

async function checkBotStatus() {
  const el = document.getElementById('bot-status');
  if (!el) return;

  try {
    const res = await fetch('/status');
    const data = await res.json();

    if (data.status === 'online') {
      el.textContent = '🟢 Bot 在線';
      return;
    }

    el.textContent = '🟡 Bot 離線，嘗試重新連線中...';

    const reconnect = await fetch('/reconnect', { method: 'POST' });
    const rData = await reconnect.json();

    if (rData.status === 'online') {
      el.textContent = '🟢 Bot 已重新連線';
    } else {
      el.textContent = '🔴 Bot 無法連線';
    }
  } catch {
    el.textContent = '❌ 無法取得 Bot 狀態';
  }
}

checkBotStatus();

// ========== 日誌 ==========
async function fetchLogs() {
  const res = await fetch('/logs');
  allLogs = await res.json();
  renderLogs();
}

function renderLogs() {
  const tbody = document.querySelector('#logs-table tbody');
  const sFilter = document.getElementById('filter-server').value.toLowerCase();
  const uFilter = document.getElementById('filter-user').value.toLowerCase();
  const cFilter = document.getElementById('filter-command').value.toLowerCase();
  const tFilter = document.getElementById('filter-type').value.toLowerCase();
  const startDate = document.getElementById('filter-start').value;
  const endDate = document.getElementById('filter-end').value;
  tbody.innerHTML = '';

  allLogs.filter(log => {
    const time = new Date(log.time);
    const startOK = !startDate || time >= new Date(startDate);
    const endOK = !endDate || time <= new Date(endDate + "T23:59:59");
    const matchServer = !sFilter || (log.guildName?.toLowerCase().includes(sFilter)) || (log.guildId?.toLowerCase().includes(sFilter));
    const matchUser = !uFilter || (log.username?.toLowerCase().includes(uFilter)) || (log.userId?.toLowerCase().includes(uFilter));
    const matchCmd = !cFilter || (log.command?.toLowerCase().includes(cFilter));
    const matchType = !tFilter || (log.type?.toLowerCase() === tFilter);
    return startOK && endOK && matchServer && matchUser && matchCmd && matchType;
  }).forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(log.time).toLocaleString()}</td>
      <td>${log.guildName ? `${log.guildName} (${log.guildId})` : '-'}</td>
      <td>${log.username ? `${log.username} (${log.userId})` : '-'}</td>
      <td>${log.command}</td>
      <td>${log.type || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('apply-filters').addEventListener('click', renderLogs);
document.getElementById('refresh-logs').addEventListener('click', fetchLogs);
fetchLogs();

// ========== JSON ==========
document.getElementById('unlock-btn').addEventListener('click', async ()=>{
  const password = document.getElementById('password').value;
  const res = await fetch('/auth', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({password})
  });
  if(res.ok){
    const dataRes = await fetch('/data');
    fullData = await dataRes.json();
    const textarea = document.getElementById('json-textarea');
    textarea.value = JSON.stringify(fullData, null, 2);
    textarea.readOnly = false;
    document.getElementById('download-json').disabled = false;
  } else {
    alert('密碼錯誤');
  }
});

// 下載 JSON
document.getElementById('download-json').addEventListener('click', ()=>{
  const blob = new Blob([document.getElementById('json-textarea').value], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '儲存檔_backup.json';
  a.click();
  URL.revokeObjectURL(url);
});
