const socket = io();

let myRoomId = null;       // 我目前所在的房間 ID
let myIsHost = false;      // 我是否為房主
let myRole = 'spectator';        // 我的角色：bank / police / robber / spectator
let inGame = false;        // 是否在遊戲中
let actionQueue = [];      // 本地行動序列
let currentRoom = null;    // 當前房間完整資料

/* =========================
   🔹 畫面狀態控制
========================= */
// 1️⃣ 返回大廳／房間初始狀態（離開房間或被踢用）
function enterLobby(){
  inGame = false;
  myRoomId = null;
  myIsHost = false;
  myRole = 'spectator';
  actionQueue = [];
  currentRoom = null;

  // 畫面切換
  document.getElementById('gameCard').style.display = 'none';
  document.getElementById('roomCard').style.display = 'block';
  document.getElementById('nickname').disabled = false;
  // 重置房間資訊 UI
  document.getElementById('roomTitle').innerText = '未加入房間';
  document.getElementById('myRole').innerText = 'spectator';
  document.getElementById('kickList').innerHTML = '';
  document.getElementById('spectatorList').innerText = '0';
  // 開始按鈕恢復
  const startBtn = document.getElementById('startBtn');
  startBtn.textContent = '開始遊戲';
  startBtn.onclick = ()=> startGame();
  renderRoom(null);
}
// 2️⃣ 進入房間（更新房間資訊，但不進入遊戲）
function enterRoom(room){
  inGame = false;
  currentRoom = room;
  myRoomId = room.roomId;
  myIsHost = (socket.id === room.host);
  // 畫面切換
  document.getElementById('gameCard').style.display = 'none';
  document.getElementById('roomCard').style.display = 'block';
  document.getElementById('nickname').disabled = false;

  // 開始按鈕設置
  const startBtn = document.getElementById('startBtn');
  startBtn.textContent = '開始遊戲';
  startBtn.onclick = ()=> startGame();

  renderRoom(room);
}
// 3️⃣ 進入遊戲（房間已在遊戲中）
function enterGame(room){
  renderRoom(room);
  inGame = true;
  currentRoom = room;
  myRoomId = room.roomId;
  // 畫面切換
  document.getElementById('nickname').disabled = true;
  document.getElementById('roomCard').style.display = 'none';
  document.getElementById('gameCard').style.display = 'grid';
  document.getElementById('hostSettings').style.display = 'block';
  // 開始/結束按鈕
  const startBtn = document.getElementById('startBtn');
  startBtn.textContent = '結束遊戲';
  startBtn.onclick = ()=> endGame();

  // 初始化遊戲 UI
  if(typeof initGameUI==='function')initGameUI(room);
}
// 🔹 房間 UI
function renderRoom(room) {
  currentRoom = room || null;
  myRoomId = room?.roomId || null;
  myIsHost = room?.host != null && socket.id === room?.host;
  const isInGame = room?.inGame || false;

  // 1. 更新角色座位資訊
  ['bank', 'police', 'robber'].forEach(role => {
    const seat = document.getElementById(role + 'Seat');
    let info = null;
    if (room && room.players) info = room.players[role];
    let name = info ? info.name : '等待玩家';
    if (info && room.host === info.id) name += ' ⭐';
    seat.innerText = name;
    
    const btn = document.getElementById('btn' + role.charAt(0).toUpperCase() + role.slice(1));
    // 遊戲中或該位置已有人時禁用選位按鈕
    btn.disabled = !!info || isInGame;
  });

  // 2. 更新觀戰列表
  const specList = (room?.spectator || []).map(s => {
    let n = s.name;
    if (n.length > 10) n = n.slice(0, 10) + '…';
    if (s.id === room?.host) n += ' ⭐';
    return n;
  }).join(', ');
  document.getElementById('spectatorList').innerText = specList || '0';

  // 3. 更新自己的角色
  myRole = Object.entries(room?.players || {}).find(([role, p]) => p.id === socket.id)?.[0] || 'spectator';
  document.getElementById('myRole').innerText = myRole;

  // 4. 標題與房主面板控制
  document.getElementById('roomTitle').innerText = room?.roomId ? room.roomId + ' 房間' : '未加入房間';
  
  const hostSettingsEl = document.getElementById('hostSettings');
  hostSettingsEl.style.display = myIsHost ? 'block' : 'none';

  // 🔹 修改點：遊戲開始後，房主的所有設定輸入框與更新按鈕都必須禁用
  const inputs = document.querySelectorAll('#hostSettings input, #updateSettingsBtn');
  inputs.forEach(el => {el.disabled = !myIsHost || isInGame;});

  // 5. 🔹 開始/結束遊戲按鈕邏輯
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    if (isInGame) {
      // 遊戲進行中：顯示「結束遊戲」，房主可點擊
      startBtn.textContent = '結束遊戲';
      startBtn.disabled = !myIsHost; 
      startBtn.onclick = endGame;
    } else {
      // 準備階段：顯示「開始遊戲」，需滿足人數且為房主才可點擊
      startBtn.textContent = '開始遊戲';
      const isFull = ['bank', 'police', 'robber'].every(r => room?.players?.[r]);
      startBtn.disabled = !myIsHost || !isFull;
      startBtn.onclick = startGame;
    }
  }
  // 6. 更新踢人列表
  const kickList = document.getElementById('kickList');
  if (myIsHost && room) {
    const candidates = [...Object.values(room.players || {}), ...(room.spectator || [])]
      .filter(p => p.id !== socket.id);
    kickList.innerHTML = candidates.map(p =>
      `<div>${p.name} <button class="small" onclick="kickPlayer('${p.id}')">踢出</button></div>`
    ).join('');
  } else {
    kickList.innerHTML = '';
  }
}
/* =========================
   🔹 連線初始化
========================= */
socket.on('connect', () => {
  const defaultName = '玩家' + socket.id.slice(0,6);
  document.getElementById('myName').innerText = defaultName;
  document.getElementById('nickname').value = defaultName;
  socket.emit('setName', defaultName);
});
/* =========================
   🔹 基本點擊功能
========================= */
function getSettingsFromUI(){
  return {
    totalRounds: Number(set_rounds.value),
    actionLimit: Number(set_actionLimit.value),
    invest:{ percent:Number(set_investPercent.value), min:Number(set_investMin.value), max:Number(set_investMax.value) },
    corrupt:{ percent:Number(set_corruptPercent.value), min:Number(set_corruptMin.value) },
    rob:{ percent:Number(set_robPercent.value), min:Number(set_robMin.value) },
    scoutBonus: Number(set_scoutBonus.value),
    tunnelNeed: Number(set_tunnelNeed.value),
    tunnelMax: Number(set_tunnelMax.value),
    bankInit: Number(set_bankInit.value),
    policeBonus: Number(set_policeBonus.value), // <- 新增這行
    bankCost:{ sec:Number(set_bankSec.value), cam:Number(set_bankCam.value), invest:Number(set_bankInvest.value), secLimit:Number(set_bankSecLimit.value), camLimit:Number(set_bankCamLimit.value), investLimit:Number(set_bankInvestLimit.value) },
    policeCost:{ def:Number(set_policeDef.value), patrol:Number(set_policePatrol.value), corrupt:Number(set_policeCorrupt.value), defLimit:Number(set_policeDefLimit.value), patrolLimit:Number(set_policePatrolLimit.value), corruptLimit:Number(set_policeCorruptLimit.value) },
    robberCost:{ rob:Number(set_robRob.value), ground:Number(set_robGround.value), scout:Number(set_robScout.value), dig:Number(set_robDig.value), robLimit:Number(set_robRobLimit.value), groundLimit:Number(set_robGroundLimit.value), scoutLimit:Number(set_robScoutLimit.value), digLimit:Number(set_robDigLimit.value) }
  };
}
function setName() {
  const nicknameInput = document.getElementById('nickname');
  if (nicknameInput.disabled) return; // 遊戲中不可改名
  const name = nicknameInput.value.trim();
  if (!name) return alert('請輸入名稱');
  socket.emit('setName', name);
  document.getElementById('myName').innerText = name;
}
function createRoom() {
  if(myRoomId) return alert('你已在房間內');
  const settings = getSettingsFromUI();
  const name = document.getElementById('nickname').value.trim();
  socket.emit('createRoom', settings, name);
}
function joinRoom() {
  if(myRoomId) return alert('你已在房間內');
  const id = document.getElementById('roomIdInput').value.trim();
  if(!id) return alert('請輸入房號');
  const name = document.getElementById('nickname').value.trim();
  socket.emit('joinRoom', id, name);
}
function leaveRoom(){
  if(!myRoomId) return;
  socket.emit('leaveRoom');
}
function kickPlayer(targetId){
  if(!myIsHost || !myRoomId) return;
  socket.emit('kickPlayer', targetId);
}
function choose(role){
  if(!myRoomId) return alert('你尚未加入房間，無法選角色');
  socket.emit('chooseRole', role);
}
function toggleSettings() {
  const hostSettings = document.getElementById('hostSettings');
  hostSettings.style.display =
    hostSettings.style.display==='none'?'block':'none';
}
function updateSettings(){
  if(!myIsHost || !myRoomId) return;
  socket.emit('updateSettings', getSettingsFromUI());
}
function startGame() {
  if (!myIsHost || !myRoomId) return;
  const isFull = ['bank', 'police', 'robber'].every(r => currentRoom?.players?.[r]);
  if (!isFull) return alert('三方玩家尚未齊全，無法開始遊戲！');
  socket.emit('startGame');
}
function endGame() {
  if (!myRoomId || !myIsHost) return;
  if (confirm("確定要強制結束這場遊戲嗎？")) socket.emit('endGame');
}
/* =========================
   🔹 Socket 事件
========================= */
// 設定更新
socket.on('settingsUpdate', s => {
  if(!s) return;
  set_rounds.value = s.totalRounds;
  set_actionLimit.value = s.actionLimit;
  set_investPercent.value = s.invest.percent;
  set_investMin.value = s.invest.min;
  set_investMax.value = s.invest.max;
  set_corruptPercent.value = s.corrupt.percent;
  set_corruptMin.value = s.corrupt.min;
  set_robPercent.value = s.rob.percent;
  set_robMin.value = s.rob.min;
  set_scoutBonus.value = s.scoutBonus;
  set_tunnelNeed.value = s.tunnelNeed;
  set_tunnelMax.value = s.tunnelMax;
  set_bankInit.value = s.bankInit;
  set_policeBonus.value = s.policeBonus;

  set_bankSec.value = s.bankCost.sec;
  set_bankCam.value = s.bankCost.cam;
  set_bankInvest.value = s.bankCost.invest;
  set_bankSecLimit.value = s.bankCost.secLimit;
  set_bankCamLimit.value = s.bankCost.camLimit;
  set_bankInvestLimit.value = s.bankCost.investLimit;

  set_policeDef.value = s.policeCost.def;
  set_policePatrol.value = s.policeCost.patrol;
  set_policeCorrupt.value = s.policeCost.corrupt;
  set_policeDefLimit.value = s.policeCost.defLimit;
  set_policePatrolLimit.value = s.policeCost.patrolLimit;
  set_policeCorruptLimit.value = s.policeCost.corruptLimit;

  set_robRob.value = s.robberCost.rob;
  set_robGround.value = s.robberCost.ground;
  set_robScout.value = s.robberCost.scout;
  set_robDig.value = s.robberCost.dig;
  set_robRobLimit.value = s.robberCost.robLimit;
  set_robGroundLimit.value = s.robberCost.groundLimit;
  set_robScoutLimit.value = s.robberCost.scoutLimit;
  set_robDigLimit.value = s.robberCost.digLimit;
});
// 房間資料更新
socket.on('roomUpdate', room => {
  currentRoom = room || null;
  myRoomId = room?.roomId || null;
  if(room?.inGame)enterGame(room);
  else            enterRoom(room);
});
// 離開房間 / 被踢
socket.on('leaveRoom', () => {
  alert('你已被踢出或離開房間！');
  enterLobby();
});
socket.on('endGame', (room)=>{
  alert('遊戲結束');
  currentRoom = room;
  enterRoom(currentRoom);
});
// 房間資料更新（遊戲開始）
socket.on('startGame', room => {
  currentRoom = room || null;
  myRoomId = room?.roomId || null;
  enterGame(room);
});
// 遊戲被強制結束（有人被踢）
socket.on('gameEndedByKick', (room)=>{
  alert('有正式玩家被踢出或離線，遊戲強制結束');
  currentRoom = room;
  enterRoom(currentRoom);
});
// 系統錯誤 / 操作失敗提示
socket.on('systemFailed', msg => {
  alert(msg || '系統錯誤');
});