/* ========================================
    🔹 全域變數與狀態
======================================== */
let gameState = {
    day: 1,
    ready: { bank: false, police: false, robber: false },
    scores: { bank: 0, police: { bonus: 0, corrupt: 0 }, robber: 0 },
    cost: { bank: 0, police: 0, robber: 0 },
    history: [],
    commHistory: [], 
    tunnelsDone: 0,
    lastKnownBankScore: 0,
    lastKnownDay: 1
};
let currentAnnounceDay = 1; 
let localActionQueue = []; 
let gameSettings = null;

const ACTION_TO_CODE = { '保全':'sec','監控':'cam','理財':'invest','防衛':'def','巡邏':'patrol','貪污':'corrupt','搶劫':'rob','地底搶劫':'ground','探查':'scout','挖洞':'dig' };
const CODE_TO_NAME = { sec:'保全', cam:'監控', invest:'理財', def:'防衛', patrol:'巡邏', corrupt:'貪污', rob:'搶劫', ground:'地底搶劫', scout:'探查', dig:'挖洞' };

function getRoleKey() {
    const roleText = document.getElementById('myRole')?.textContent || '觀戰';
    const map = { 'bank':'bank','銀行':'bank','police':'police','警察':'police','robber':'robber','搶匪':'robber','spectator':'spectator','觀戰':'spectator' };
    return map[roleText] || 'spectator';
}

/* ========================================
    🔹 1. 初始化與核心渲染
======================================== */
function initGameUI(room) {
    gameSettings = room.settings;
    if (room.game) {
        gameState = room.game;
        currentAnnounceDay = gameState.day > 1 ? gameState.day - 1 : 1;
    }
    if (room.players) {
        if (document.getElementById('gameBank')) document.getElementById('gameBank').textContent = room.players.bank?.name || '等待中';
        if (document.getElementById('gamePolice')) document.getElementById('gamePolice').textContent = room.players.police?.name || '等待中';
        if (document.getElementById('gameRobber')) document.getElementById('gameRobber').textContent = room.players.robber?.name || '等待中';
    }
    updateGameUI();
    bindCommEvents();
    bindReadyButtons();
}

function updateGameUI() {
    const roleKey = getRoleKey();
    const dayEl = document.getElementById('currentDay');
    if (dayEl) dayEl.textContent = gameState.day;

    const isReady = gameState.ready[roleKey];
    const costs = gameSettings ? (gameSettings[`${roleKey}Cost`] || {}) : {};
    const totalPending = localActionQueue.reduce((sum, code) => sum + (costs[code] || 0), 0);

    // --- 分數顯示邏輯 ---
    const updateScoreRow = (id, role, title, score, extra = '') => {
        const el = document.getElementById(id);
        if (el) {
            if (roleKey === role || roleKey === 'spectator') {
                el.innerHTML = `
                    <div class="camp-left">${title}：$${score} ${extra}</div>
                    <div class="camp-right">累積花費: $${gameState.cost[role]} ${totalPending > 0 && roleKey === role ? `<span class="pending-cost">+(預計 $${totalPending})</span>` : ''}</div>
                `;
                el.style.display = 'flex';
            } else { el.style.display = 'none'; }
        }
    };

    // 銀行分數 (含監控時效)
    const lastHist = gameState.history[gameState.history.length - 1];
    const hadCam = lastHist && lastHist.actions.bank.some(a => a.includes('監控'));
    const canSeeBankReal = (roleKey === 'spectator' || roleKey === 'bank' || gameState.day === 1 || hadCam);
    updateScoreRow('bankScore', 'bank', '🏦 銀行', 
        canSeeBankReal ? gameState.scores.bank : (gameState.lastKnownBankScore || 0), 
        `<small>(存檔: 第${canSeeBankReal ? gameState.day : (gameState.lastKnownDay || 1)}天)</small>`);

    // 警察與搶匪
    updateScoreRow('policeScore', 'police', '🚔 警察', gameState.scores.police.corrupt, `<small>(分紅: ${gameState.scores.police.bonus}%)</small>`);
    updateScoreRow('robberScore', 'robber', '🔫 搶匪', gameState.scores.robber);

    // --- 操作區顯示 ---
    const actionContainer = document.getElementById('actionContainer');
    const readyRow = document.querySelector('.readyRow');
    if (roleKey === 'spectator') {
        if (actionContainer) actionContainer.style.display = 'none';
        if (readyRow) readyRow.style.display = 'none';
    } else {
        if (actionContainer) actionContainer.style.display = 'flex';
        if (readyRow) readyRow.style.display = 'flex';
    }

    // --- 通信控制 (觀戰可看不可說) ---
    const commInput = document.getElementById('commInput');
    const commSend = document.getElementById('commSend');
    if (commInput && commSend) {
        const isOperator = (roleKey === 'bank' || roleKey === 'police');
        commInput.style.display = isOperator ? 'block' : 'none';
        commSend.style.display = isOperator ? 'block' : 'none';
        commInput.disabled = isReady;
        commSend.disabled = isReady;
    }

    renderActionButtons();
    renderActionQueue();
    updateReadyUI();
    updateAnnounceBox();
}

/* ========================================
    🔹 2. 行動按鈕 (Alert 提示邏輯)
======================================== */
function renderActionButtons() {
    const btnGroup = document.querySelector('.btnGroup');
    const roleKey = getRoleKey();
    if (!btnGroup || roleKey === 'spectator' || !gameSettings) return;

    const roleActions = { 
        bank: ['保全','監控','理財'], 
        police: ['防衛','巡邏','貪污'], 
        robber: ['搶劫','地底搶劫','探查','挖洞'] 
    };
    const costTable = gameSettings[`${roleKey}Cost`] || {};
    const isReady = gameState.ready[roleKey];
    btnGroup.innerHTML = '';

    (roleActions[roleKey] || []).forEach(actName => {
        const code = ACTION_TO_CODE[actName];
        const cost = costTable[code] || 0;
        const btn = document.createElement('button');
        
        btn.textContent = `${actName}($${cost})`;

        btn.onclick = () => {
            // 檢查是否已準備
            if (isReady) { alert("您已進入準備狀態，無法修改行動。"); return; }
            
            // 檢查地洞
            if (code === 'ground' && Math.floor(gameState.tunnelsDone / (gameSettings.tunnelNeed || 10)) < 1) {
                alert("地底搶劫失敗：地洞尚未挖通！"); return;
            }

            // 檢查總行動上限
            if (localActionQueue.length >= (gameSettings.actionLimit || 3)) {
                alert(`已達單日行動上限 (${gameSettings.actionLimit} 次)`); return;
            }

            // 檢查單項行動上限
            const itemLimit = costTable[`${code}Limit`];
            if (itemLimit !== undefined && itemLimit !== -1) {
                if (localActionQueue.filter(c => c === code).length >= itemLimit) {
                    alert(`該行動「${actName}」今日次數已達上限`); return;
                }
            }

            localActionQueue.push(code);
            updateGameUI();
        };
        btnGroup.appendChild(btn);
    });
}

function renderActionQueue() {
    const queueGroup = document.querySelector('.queueGroup');
    if (!queueGroup) return;
    const isReady = gameState.ready[getRoleKey()];
    queueGroup.innerHTML = '';
    
    localActionQueue.forEach((code, index) => {
        const qBtn = document.createElement('button');
        qBtn.textContent = CODE_TO_NAME[code];
        qBtn.onclick = () => {
            if (isReady) { alert("已準備，無法取消行動。"); return; }
            localActionQueue.splice(index, 1);
            updateGameUI();
        };
        queueGroup.appendChild(qBtn);
    });
}

/* ========================================
    🔹 4. 公告系統 (精簡行動摘要)
======================================== */
function updateAnnounceBox() {
    const announceBox = document.getElementById('announceBox');
    const titleEl = document.getElementById('announceTitle');
    const roleKey = getRoleKey();
    if (!announceBox) return;

    const hist = gameState.history.find(h => h.day === currentAnnounceDay);
    if (titleEl) titleEl.textContent = `第 ${currentAnnounceDay} 天公告`;

    if (!hist) {
        announceBox.innerHTML = `<div class="empty-hint">尚無結算資料</div>`;
        return;
    }

    // 行動摘要：看不見就不顯示行
    let html = `<div class="action-summary-list">`;
    Object.entries(hist.actions).forEach(([r, acts]) => {
        const icon = r === 'bank' ? '🏦' : (r === 'police' ? '🚔' : '🔫');
        if (roleKey === 'spectator' || roleKey === r) {
            html += `<div>${icon} ${acts.join(', ') || '待機'}</div>`;
        }
    });
    html += `</div><hr style="opacity:0.1; margin:10px 0;">`;

    html += `<div class="public-report"><strong>【公開情報】</strong><br>${(hist.public || '平安無事。').replace(/\n/g, '<br>')}</div>`;
    
    if (roleKey !== 'spectator') {
        if (hist[roleKey]) html += `<div class="private-report"><strong>【陣營私報】</strong><br>${hist[roleKey].replace(/\n/g, '<br>')}</div>`;
    } else {
        ['bank','police','robber'].forEach(k => {
            if (hist[k]) html += `<div class="private-report" style="border-color:#555"><b>[${k}]</b><br>${hist[k].replace(/\n/g, '<br>')}</div>`;
        });
        if (hist.bankHidden) html += `<div class="hidden-info"><b>[系統監控偵測]</b><br>${hist.bankHidden.replace(/\n/g, '<br>')}</div>`;
    }
    announceBox.innerHTML = html;
}

/* ========================================
    🔹 5. 準備與 Socket
======================================== */
function updateReadyUI() {
    const roleKey = getRoleKey();
    const isReady = gameState.ready[roleKey];
    const rb = document.getElementById('readyBtn');
    const waitText = document.querySelector('.waitingText');

    if (rb) {
        rb.textContent = isReady ? '取消準備' : '準備完成';
        rb.className = isReady ? 'ready-active' : '';
    }

    const notReady = Object.keys(gameState.ready).filter(r => !gameState.ready[r]).map(r => r==='bank'?'銀行':(r==='police'?'警察':'搶匪'));
    if (waitText) waitText.textContent = notReady.length > 0 ? `等待: ${notReady.join('/')}` : '結算中...';
}

function bindReadyButtons() {
    const rb = document.getElementById('readyBtn');
    if (rb) {
        rb.onclick = () => {
            const roleKey = getRoleKey();
            const isCurrentlyReady = gameState.ready[roleKey];
            socket.emit('toggleReady', isCurrentlyReady ? [] : localActionQueue);
        };
    }
    document.getElementById('prevDay').onclick = () => { if(currentAnnounceDay > 1) { currentAnnounceDay--; updateAnnounceBox(); }};
    document.getElementById('nextDay').onclick = () => { if(currentAnnounceDay < gameState.day - 1) { currentAnnounceDay++; updateAnnounceBox(); }};
}

function bindCommEvents() {
    const commSection = document.getElementById('commSection');
    const commInput = document.getElementById('commInput');
    const sendBtn = document.getElementById('commSend');
    const roleKey = getRoleKey();

    // 搶匪不顯示通信，觀戰與警銀顯示
    if (roleKey === 'robber') {
        if (commSection) commSection.style.display = 'none';
        return;
    }
    if (commSection) commSection.style.display = 'block';

    sendBtn.onclick = () => {
        const text = commInput.value.trim();
        if (text) { socket.emit('sendComm', text); commInput.value = ''; }
    };
    commInput.onkeydown = (e) => { if (e.key === 'Enter') sendBtn.onclick(); };
}

function appendMessageUI(msg) {
    const commBox = document.getElementById('commBox');
    if (!commBox) return;
    const div = document.createElement('div');
    div.className = `comm-line role-${msg.role}`;
    div.innerHTML = `<small style="color:#888">[${msg.time}]</small> <b>${msg.name}:</b> ${msg.text}`;
    commBox.appendChild(div);
    commBox.scrollTop = commBox.scrollHeight;
}

socket.on('gameUpdate', (data) => {
    gameState = data.game; gameSettings = data.settings;
    const commBox = document.getElementById('commBox');
    if (commBox) {
        commBox.innerHTML = '';
        (gameState.commHistory || []).forEach(appendMessageUI);
    }
    updateGameUI();
});

socket.on('dayResultUpdate', (data) => {
    gameState = data.game; gameSettings = data.settings;
    localActionQueue = [];
    currentAnnounceDay = Math.max(1, gameState.day - 1);
    updateGameUI();
});

socket.on('newComm', appendMessageUI);
socket.on('updateReady', (data) => { gameState = data; updateReadyUI(); });