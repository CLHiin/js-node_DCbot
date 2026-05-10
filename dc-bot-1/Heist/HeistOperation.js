module.exports = function(io){
  const rooms = {};

  io.on('connection', socket => {
    // 🔹 設定玩家名稱
    socket.on('setName', name=>{
      socket.myName = name || ('玩家' + socket.id.slice(0,6));
      for(const roomId in rooms){
        const room = rooms[roomId];
        let updated = false;
        // 更新角色名稱
        for(const role in room.players){
          if(room.players[role].id === socket.id){
            room.players[role].name = socket.myName;
            updated = true;
          }
        }
        // 更新觀戰名稱
        room.spectator.forEach(s=>{
          if(s.id === socket.id){ s.name = socket.myName; updated = true;}
        });
        if(updated) io.to(roomId).emit('roomUpdate', room);
      }
    });
    // 🔹 創建/加入房間
    function enterRoom(socket, roomId, name, settings={}){
      // 創建房間
      if(!roomId){
        do {roomId = Math.random().toString(36).substr(2,6).toUpperCase();} while(rooms[roomId]);
        rooms[roomId] = {
          roomId,
          host: socket.id,
          players: {},
          spectator: [],
          settings,
          inGame: false
        };
      }
      const room = rooms[roomId];
      if(!room) return socket.emit('systemFailed','房間不存在');
      // 加入房間
      socket.join(roomId);
      socket.myName = name;
      socket.myRoomId = roomId;
      room.spectator.push({id: socket.id, name: socket.myName});
      // 如果房間正在遊戲中，用 startGame 來加載遊戲
      if(room.inGame) io.to(roomId).emit('startGame', room);
      else            io.to(roomId).emit('roomUpdate', room);
      socket.emit('settingsUpdate', room.settings);
    }
    socket.on('createRoom', (settings, name)=>{enterRoom(socket, null, name, settings);});
    socket.on('joinRoom', (roomId, name)=>{enterRoom(socket, roomId, name);});
    // 🔹 離開 / 踢人 / 斷線
    function leaveRoomHandler(socket, targetSocket = socket){
      const roomId = targetSocket.myRoomId;
      if(!roomId || !rooms[roomId]) return;
      const room = rooms[roomId];
      let removedPlayer = false;
      // 移除角色
      for(const r in room.players){
        if(room.players[r].id === targetSocket.id){ 
          delete room.players[r]; 
          removedPlayer = true; 
        }
      }
      room.spectator = room.spectator.filter(s => s.id !== targetSocket.id);
      // 房主轉讓
      if(room.host === targetSocket.id){
        const candidates = [...Object.values(room.players), ...room.spectator];
        room.host = candidates.length>0 ? candidates[0].id : null;
      }
      targetSocket.leave(roomId);
      targetSocket.emit('leaveRoom');
      targetSocket.myRoomId = null;
      // 遊戲中正式玩家離開，結束遊戲
      if(removedPlayer && room.inGame){
        room.inGame = false;
        io.to(roomId).emit('gameEndedByKick');
      }
      // 空房間刪除
      if(Object.keys(room.players).length === 0 && room.spectator.length === 0){
        delete rooms[roomId];
      }
      else io.to(roomId).emit('roomUpdate', room);
    }
    socket.on('leaveRoom', ()=> leaveRoomHandler(socket));
    socket.on('disconnect', ()=> leaveRoomHandler(socket));
    socket.on('kickPlayer', targetId => {
      const targetSocket = io.sockets.sockets.get(targetId);
      if(!targetSocket) return;
      leaveRoomHandler(socket, targetSocket);
    });
    // 🔹 選角色
    socket.on('chooseRole', role=>{
      if(!socket.myRoomId || !rooms[socket.myRoomId]) return socket.emit('systemFailed','房間不存在');
      const roomId = socket.myRoomId;
      const room = rooms[roomId];
      // 移除舊角色或觀戰
      room.spectator = room.spectator.filter(s => s.id !== socket.id);
      for(const r in room.players){
        if(room.players[r].id === socket.id)
          delete room.players[r];
      }
      if(role == 'spectator') room.spectator.push({id: socket.id, name: socket.myName});
      else room.players[role] = {id: socket.id, name: socket.myName};
      io.to(roomId).emit('roomUpdate', room);
    });
    // 🔹 更新設定
    socket.on('updateSettings', settings=>{
      if(!socket.myRoomId || !rooms[socket.myRoomId]) return socket.emit('systemFailed','房間不存在');
      const roomId = socket.myRoomId;
      const room = rooms[roomId];
      if(room.host !== socket.id) return socket.emit('systemFailed','非房主無法操作');
      room.settings = settings;
      io.to(roomId).emit('settingsUpdate', settings);
    });
    socket.on('endGame', ()=>{
      if(!socket.myRoomId || !rooms[socket.myRoomId]) return socket.emit('systemFailed','房間不存在');
      const roomId = socket.myRoomId;
      const room = rooms[roomId];
      room.inGame = false;
      io.to(roomId).emit('endGame', room);
    });
    // 🔹 開始遊戲
    socket.on('startGame', ()=>{
      if(!socket.myRoomId || !rooms[socket.myRoomId]) return socket.emit('systemFailed','房間不存在');
      const roomId = socket.myRoomId;
      const room = rooms[roomId];
      if(room.host !== socket.id) return socket.emit('systemFailed','非房主無法操作');
      if(!['bank','police','robber'].every(r=>room.players[r])) return socket.emit('systemFailed','陣營缺人');
      room.inGame = true;
      // ===== 新增：初始化遊戲狀態 =====
      room.game = {
        day: 1,
        actions: { bank: [], police: [], robber: [] },
        ready: { bank: false, police: false, robber: false },
        scores: { 
          bank: room.settings.bankInit || 0,
          police: {bonus: room.settings.policeBonus || 0, corrupt: 0},
          robber: 0
        },
        cost: { bank: 0, police: 0, robber: 0 },
        history: [],
        commHistory: [],
        scoutBonus: 0, // 探查加成
        tunnelsDone: 0, // 地洞進度
        informerLive: true, // 地洞通報
        lastKnownBankScore: 0, // 金庫最後分數
        lastKnownDay: 1, // 金庫最後更新日
      };
      io.to(roomId).emit('startGame', room);
    });
    socket.on('sendComm', (text) => {
      const roomId = socket.myRoomId; // 修正：前端傳進來或從 socket 屬性抓
      const room = rooms[roomId];
      if (!room || !room.game) return;
      // 取得角色
      const roleKey = Object.keys(room.players).find(key => room.players[key] && room.players[key].id === socket.id) || 'spectator';
      if (roleKey === 'robber') return socket.emit('systemFailed', '搶匪無法使用通信系統。');
      const commEntry = {
          role: roleKey,
          name: room.players[roleKey] ? room.players[roleKey].name : (socket.myName || '觀戰者'),
          text: text.substring(0, 200),
          time: new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })
      };
      if (!room.game.commHistory) room.game.commHistory = [];
      room.game.commHistory.push(commEntry);
      // 廣播給銀行、警察
      Object.keys(room.players).forEach(role => {
          const player = room.players[role];
          if (player && player.id && role !== 'robber') io.to(player.id).emit('newComm', commEntry);
      });
      if (room.spectator)room.spectator.forEach(spec => io.to(spec.id).emit('newComm', commEntry));
    });
    socket.on('toggleReady', (clientActions) => {
        const roomId = socket.myRoomId;
        const room = rooms[roomId];
        if(!room || !room.inGame) return;
        const role = Object.entries(room.players).find(([r, p]) => p.id === socket.id)?.[0];
        if(!role) return;
        // 1. 先切換準備狀態
        room.game.ready[role] = !room.game.ready[role];
        // 2. 如果是變成「已準備」，則更新該角色的行動
        if (room.game.ready[role]) room.game.actions[role] = Array.isArray(clientActions) ? clientActions : [];
        io.to(roomId).emit('updateReady', room.game);
        if(Object.values(room.game.ready).every(v => v))resolveRound(roomId);
    });

    // 🔹 判定函數
    function resolveRound(roomId) {
      const room = rooms[roomId];
      const g = room.game;
      const s = room.settings;
      // --- 階段零：合法性檢查 (如果有任何人違規，中斷結算) ---
      for (const role of ['bank', 'police', 'robber']) {
        const queue = g.actions[role] || [];
        const roleSocketId = room.players[role].id;
        // 1. 檢查單日總行動上限 (actionLimit)
        if (queue.length > s.actionLimit) {
          g.ready[role] = false; // 取消該玩家準備狀態
          io.to(roleSocketId).emit('systemFailed', `你的行動總數 (${queue.length}) 超過上限 (${s.actionLimit})，請重新調整後再準備。`);
          io.to(roomId).emit('updateReady', g.ready); // 通知所有人有人「取消準備」了
          return; // ❌ 中斷整個結算流程
        }
        // 2. 檢查特定行動的單日次數限制 (Limit 檢查)
        const counts = {};
        for (const act of queue) {
          counts[act] = (counts[act] || 0) + 1;
          const limit = s[`${role}Cost`][`${act}Limit`];
          if (limit !== -1 && counts[act] > limit) {
            g.ready[role] = false;
            const actName = getChineseName(act); // 轉換為中文方便閱讀
            io.to(roleSocketId).emit('systemFailed', `行動「${actName}」超過單日限次 (${limit})。`);
            io.to(roomId).emit('updateReady', g.ready);
            return; // ❌ 中斷
          }
        }
        // 3. 檢查特殊前提：地底搶劫 (ground) 必須要有地洞
        const groundCount = queue.filter(a => a === 'ground').length;
        if (groundCount > 0) {
          const finishedTunnels = Math.floor(g.tunnelsDone / s.tunnelNeed);
          if (finishedTunnels < 1) {
            g.ready[role] = false;
            io.to(roleSocketId).emit('systemFailed', `地洞尚未完工，無法執行地底搶劫！`);
            io.to(roomId).emit('updateReady', g.ready);
            return; // ❌ 中斷
          }
        }
      }
      // --- 通過檢查，開始真正的邏輯判定 ---
      executeLogic(roomId);
    }
    function executeLogic(roomId) {
      const room = rooms[roomId];
      const g = room.game;
      const s = room.settings;
      const ACTION_NAMES = { 
        sec: '保全', cam: '監控', invest: '理財', def: '防衛', patrol: '巡邏', 
        corrupt: '貪污', rob: '搶劫', ground: '地底搶劫', scout: '探查', dig: '挖洞' 
      };
      const acts = { bank: {}, police: {}, robber: {} };
      const actionSnapshot = { bank: [], police: [], robber: [] };

      // 1. 核心統計：計算次數、花費與快照
      ['bank', 'police', 'robber'].forEach(role => {
        const counts = {};
        g.actions[role].forEach(a => {
          acts[role][a] = (acts[role][a] || 0) + 1;
          g.cost[role] += (s[`${role}Cost`][a] || 0);
          counts[ACTION_NAMES[a]] = (counts[ACTION_NAMES[a]] || 0) + 1;
        });
        actionSnapshot[role] = Object.entries(counts).map(([name, count]) => `${name} x${count}`);
      });

      const dayResult = { day: g.day, actions: actionSnapshot, public: "", bank: "", bankHidden: "", police: "", robber: "" };
      const hasCamera = (acts.bank.cam || 0) > 0;

      // --- 階段一：銀行理財 ---
      if (acts.bank.invest) {
        const oldScore = g.scores.bank;
        const profit = Math.min(s.invest.max, acts.bank.invest * Math.max(Math.floor(oldScore * (s.invest.percent / 100)), s.invest.min));
        g.scores.bank += profit;
        if (hasCamera) {
          dayResult.bank += `[銀行] 理財執行 ${acts.bank.invest} 次，獲利 $${profit}。金庫：$${oldScore} -> $${g.scores.bank}。\n`;
        } else {
          dayResult.bank += `[銀行] 理財執行 ${acts.bank.invest} 次，因無監控無法確認收益。\n`;
          dayResult.bankHidden += `[銀行隱藏紀錄] 獲利 $${profit}，金庫：$${oldScore} -> $${g.scores.bank}。\n`;
        }
      }
      // --- 階段二：警察貪污 ---
      if (acts.police.corrupt) {
        const oldBank = g.scores.bank;
        const amount = acts.police.corrupt * Math.max(Math.floor(oldBank * (s.corrupt.percent / 100)), s.corrupt.min);
        if (hasCamera) {
          const oldBonus = g.scores.police.bonus;
          g.scores.police.bonus -= 5;
          dayResult.bank += `[銀行] 監控攔截了警察的貪污行為。\n`;
          dayResult.police += `[警察] 貪污被抓！分紅比例：${oldBonus}% -> ${g.scores.police.bonus}%。\n`;
        } else {
          g.scores.bank -= amount;
          g.scores.police.corrupt += amount;
          dayResult.police += `[警察] 貪污成功！獲得 $${amount}。總貪污額：$${g.scores.police.corrupt}。\n`;
          dayResult.bankHidden += `[貪污隱藏紀錄] 遭貪污 $${amount}，金庫：$${oldBank} -> $${g.scores.bank}。\n`;
        }
      }
    // --- 階段三：搶劫判定 (難度動態計算 + 防線崩潰機制) ---
      const robCount = acts.robber.rob || 0;
      const groundCount = acts.robber.ground || 0;
      let totalWins = 0;
      const oldDef = (acts.police.def || 0) + (acts.police.corrupt || 0);
      if (robCount > 0 || groundCount > 0) {
        let pDef = oldDef;
        let bSec = (acts.bank.sec || 0);
        let defenseBroken = false; 
        const completedTunnels = Math.floor(g.tunnelsDone / s.tunnelNeed);
        // A. 優先判定地底搶劫 (前 N 人難度 2，其餘 1)
        for (let i = 0; i < groundCount; i++) {
          if (completedTunnels < 1) break; // 門檻未到，地底全滅
          const cost = (i < completedTunnels) ? 2 : 1;
          let pool = pDef + (hasCamera ? bSec : 0);
          if (!defenseBroken && pool >= cost) {
            let remain = cost;
            let dedP = Math.min(pDef, remain);
            pDef -= dedP; remain -= dedP;
            if (remain > 0) bSec -= remain;
          }
          else {defenseBroken = true; totalWins++;}
        }
        // B. 判定直接搶劫 (僅首位難度 1 + ScoutBonus，其餘 1)
        for (let i = 0; i < robCount; i++) {
          // 只有首位享受昨日全部的探查增益
          const cost = (i === 0) ? (1 + (g.scoutBonus || 0)) : 1;
          let pool = pDef + bSec;
          if (!defenseBroken && pool >= cost) {
            let remain = cost;
            let dedP = Math.min(pDef, remain);
            pDef -= dedP; remain -= dedP;
            if (remain > 0) bSec -= remain;
          } else {
            defenseBroken = true;
            totalWins++;
          }
        }
        // --- 4. 結算與公告 (原本 -> 之後) ---
        const oldB = g.scores.bank, oldR = g.scores.robber, oldP = g.scores.police.bonus;
        const stolen = totalWins * Math.max(Math.floor(oldB * (s.rob.percent / 100)), s.rob.min);
        g.scores.bank -= stolen;
        g.scores.robber += stolen;
        g.scores.police.bonus -= (totalWins * 2);
        dayResult.public += `[公共] 今日 ${groundCount} 地洞搶劫 + ${robCount} 直接搶匪，被 ${oldDef}守衛+${(acts.bank.sec || 0)}保安防禦，有 ${totalWins} 人成功搶劫。\n`;
        dayResult.police += `[警察] 遭到 ${totalWins} 人成功搶劫！分紅比例：${oldP}% -> ${g.scores.police.bonus}%。\n`;
        dayResult.robber += `[搶匪] 有 ${totalWins} 人搶劫成功！收益：$${oldR} -> $${g.scores.robber}。\n`;
        dayResult.bank += `[銀行] 監控沒有運行，無法看見金庫變動。\n`;
        if (totalWins>0){
          if (hasCamera) dayResult.bank += `[銀行] 遭到 ${totalWins} 人搶劫，金庫：$${oldB} -> $${g.scores.bank}。\n`;
          else dayResult.bankHidden += `[銀行隱藏紀錄] 遭到 ${totalWins}人搶劫，金庫：$${oldB} -> $${g.scores.bank}。\n`;
        }
      }
      // --- 階段四：偵查與地底邏輯 ---
      const digCount = acts.robber.dig || 0;
      const maxTunnelProgress = s.tunnelMax * s.tunnelNeed; 
      // 1. 搶匪挖掘：增加點數
      if (digCount > 0) {
        g.tunnelsDone = Math.min(maxTunnelProgress, g.tunnelsDone + digCount);
        if (g.informerLive && g.tunnelsDone >= s.tunnelNeed) {
          dayResult.public += `[公共]【緊急通報】警方線人情報：隧道已完成！(線人失聯，不再提醒)\n`;
          g.informerLive = false;
        }
      }

      const pCount = acts.police.patrol || 0, sCount = acts.robber.scout || 0;
      const blocked = Math.min(pCount, sCount);
      const freeP = Math.max(0, pCount - sCount);
      if (pCount > 0) dayResult.public += `[公共] ${pCount}名警察巡邏，驅離了 ${blocked}名探查者。\n`;
      // 2. 警察回填：精確計算扣除點數
      let potentialDamage = 0;
      for (let i = 0; i < freeP; i++) if (Math.random() < 0.5) potentialDamage += s.tunnelNeed;
      const actualLoss = Math.min(g.tunnelsDone, potentialDamage);

      if (actualLoss > 0) {
        g.tunnelsDone -= actualLoss;
        dayResult.public += `[公共] ${freeP}名警察加強巡邏，發現了地洞，地洞進度 -${actualLoss} 點！\n`;
      }
      else if (freeP > 0) {
        dayResult.public += `[公共] ${freeP}名警察加強巡邏，但並未發現異常。\n`;
      }
      // 3. 次日加成與搶匪日誌
      const sPow = Math.max(0, sCount - pCount) * (s.scoutBonusRate || 0.5);
      g.scoutBonus = Math.ceil(sPow); 
      const currentFinished = Math.floor(g.tunnelsDone / s.tunnelNeed);
      let robMsg = `[搶匪] 地底進度：${g.tunnelsDone}/${s.tunnelNeed} (可疊加到：${maxTunnelProgress})。\n`;
      robMsg += `[搶匪] 探查增益：明日直接搶劫加成 +${g.scoutBonus}。\n`;
      dayResult.robber += robMsg;
      
      if (hasCamera) { g.lastKnownBankScore = g.scores.bank; g.lastKnownDay = g.day; }
      g.history.push(dayResult);
      g.day++;
      g.ready = { bank: false, police: false, robber: false };
      g.actions = { bank: [], police: [], robber: [] };

      io.to(roomId).emit('dayResultUpdate', room);
    }
  });
};