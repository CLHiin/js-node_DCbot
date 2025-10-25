const { createCanvas } = require('@napi-rs/canvas');

// 計算曼哈頓距離
function distance(p1, p2) {
    return Math.abs(p1[0]-p2[0]) + Math.abs(p1[1]-p2[1]);
}

// BFS 檢查通路 (沒用到)
function isReachable(maze, endPos = null) {
    const n = maze.length;
    const visited = Array.from({length:n}, () => Array(n).fill(false));
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

    if (!endPos) {
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (maze[i][j] === 'E') { endPos = [i, j]; break; }
            }
            if (endPos) break;
        }
        if (!endPos) return true;
    }

    const queue = [endPos];
    visited[endPos[0]][endPos[1]] = true;

    while (queue.length) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < n && ny >= 0 && ny < n && maze[nx][ny] !== 'W' && !visited[nx][ny]) {
                visited[nx][ny] = true;
                queue.push([nx, ny]);
            }
        }
    }

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (maze[i][j] === '.' && !visited[i][j]) return false;
        }
    }
    return true;
}

// 放置鑽石
function placeDiamonds(maze, diamondCount) {
    let diamondsPlaced = 0;
    const n = maze.length;
    while (diamondsPlaced < diamondCount) {
        const emptyCells = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (maze[i][j] === '.') emptyCells.push([i,j]);
        if (emptyCells.length === 0) break;
        const [x, y] = emptyCells[Math.floor(Math.random()*emptyCells.length)];
        maze[x][y] = 'D';
        diamondsPlaced++;
    }
}

// 統計元素數量
function countElements(maze) {
    const counts = { '.':0, 'W':0, 'E':0, 'D':0 };
    for (const row of maze) for (const cell of row) if (counts[cell]!==undefined) counts[cell]++;
    return counts;
}

// -------------------- 迷宮生成演算法 --------------------

function shuffle(arr){ return arr.sort(() => Math.random()-0.5); }

// 少密度：迷宮生成牆壁，15~25%牆
function generateSparse(n) {
    const maze = Array.from({length:n}, () => Array(n).fill('W'));
    const dirs = [[0,1],[1,0],[0,-1],[-1,0]];

    const startX = Math.floor(Math.random()*n);
    const startY = Math.floor(Math.random()*n);
    maze[startX][startY] = '.';

    const stack = [[startX,startY]];
    let emptyCount = 1;
    const totalCells = n*n;
    const wallMin = Math.floor(totalCells*0.15);
    const wallMax = Math.floor(totalCells*0.25);
    const emptyTarget = totalCells - Math.floor(Math.random()*(wallMax-wallMin)+wallMin);

    while (stack.length && emptyCount < emptyTarget) {
        const [x, y] = stack[stack.length-1];
        const shuffledDirs = shuffle([...dirs]);
        let moved = false;

        for (const [dx, dy] of shuffledDirs) {
            const steps = 1 + Math.floor(Math.random()*3);
            let path = [];
            let nx = x, ny = y;
            for (let s = 0; s < steps; s++) {
                nx += dx; ny += dy;
                if (nx < 0 || nx >= n || ny < 0 || ny >= n || maze[nx][ny] === '.') break;
                path.push([nx, ny]);
            }

            if (path.length > 0) {
                for (const [px, py] of path) {
                    maze[px][py] = '.';
                    emptyCount++;
                    stack.push([px, py]);
                }
                moved = true;
                break;
            }
        }
        if (!moved) stack.pop();
    }

    // 終點
    const emptyCells = [];
    for (let i=0;i<n;i++) for (let j=0;j<n;j++) if(maze[i][j]==='.') emptyCells.push([i,j]);
    const [endX,endY] = emptyCells[Math.floor(Math.random()*emptyCells.length)];
    maze[endX][endY] = 'E';

    return maze;
}

// 中密度：老鼠走迷宮 + 概率穿洞
function generateMedium(n) {
    const maze = Array.from({length:n}, () => Array(n).fill('W'));
    const dirs = [[0,1],[1,0],[0,-1],[-1,0]];

    const start = [0,0];
    maze[start[0]][start[1]] = '.';
    const stack = [[...start]];

    while (stack.length) {
        const [x,y] = stack[stack.length-1];
        const shuffled = shuffle([...dirs]);
        let moved = false;

        for(const [dx,dy] of shuffled) {
            const steps = 2;
            let path = [];
            let nx = x, ny = y;
            let canMove = true;

            for(let s=0; s<steps; s++){
                nx += dx; ny += dy;
                if(nx<0 || nx>=n || ny<0 || ny>=n){ canMove=false; break; }
                if(maze[nx][ny] === '.') {
                    if(path.length>0 && Math.random()<0.1) path.push([nx,ny]);
                    else { canMove=false; break; }
                } else {
                    path.push([nx,ny]);
                }
            }

            if(path.length>0 && canMove){
                for(const [px,py] of path) maze[px][py]='.';
                const last = path[path.length-1];
                stack.push([last[0], last[1]]);
                moved = true;
                break;
            }
        }

        if(!moved) stack.pop();
    }

    // 終點放置在空格旁邊
    const emptyCells = [];
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) if(maze[i][j]==='.') emptyCells.push([i,j]);
    const [endX,endY] = emptyCells[Math.floor(Math.random()*emptyCells.length)];
    maze[endX][endY]='E';

    return maze;
}

// 多密度：老鼠走迷宮 + 隨機步長
function generateDense(n) {
    const maze = Array.from({length:n}, () => Array(n).fill('W'));
    const dirs = [[0,1],[1,0],[0,-1],[-1,0]];

    const start = [0,0];
    maze[start[0]][start[1]] = '.';
    const stack = [[...start]];

    while (stack.length) {
        const [x, y] = stack[stack.length-1];
        const shuffledDirs = shuffle([...dirs]);
        let moved = false;

        for (const [dx, dy] of shuffledDirs) {
            const steps = 2;
            let nx = x, ny = y;
            let canMove = true;

            for (let s = 0; s < steps; s++) {
                nx += dx; ny += dy;
                if (nx < 0 || nx >= n || ny < 0 || ny >= n || maze[nx][ny] === '.') {
                    canMove = false;
                    break;
                }
            }

            if (canMove) {
                nx = x; ny = y;
                for (let s = 0; s < steps; s++) {
                    nx += dx; ny += dy;
                    maze[nx][ny] = '.';
                }
                stack.push([nx, ny]);
                moved = true;
                break;
            }
        }

        if (!moved) stack.pop();
    }

    // 放置終點在空格旁邊
    const emptyCells = [];
    for (let i=0;i<n;i++) for (let j=0;j<n;j++) if(maze[i][j]==='.') emptyCells.push([i,j]);
    if(emptyCells.length>0){
        const [ex, ey] = emptyCells[Math.floor(Math.random()*emptyCells.length)];
        const neighbors = dirs.map(([dx,dy])=>[ex+dx, ey+dy])
                              .filter(([nx,ny])=>nx>=0 && nx<n && ny>=0 && ny<n && maze[nx][ny]==='W');
        if(neighbors.length>0){
            const [nx, ny] = neighbors[Math.floor(Math.random()*neighbors.length)];
            maze[nx][ny] = 'E';
        } else {
            maze[ex][ey] = 'E';
        }
    }
    return maze;
}

// 將字串還原為二維陣列
function parseMazeString(str) {
    // return str.split('\n').map(row => row.split(''));
    return str.split('\n').map(r => r.split('').map(c => isNaN(c) ? c : parseInt(c)));
}

// 生成迷宮
function GenerateMaze(size, wallLevel, diamond) {
    const func = { '少': generateSparse, '中': generateMedium, '多': generateDense };
    const generator = func[wallLevel];
    if (!generator) throw new Error('無效的牆壁等級');

    const maze = generator(size);
    placeDiamonds(maze, diamond);
    // 存成字串
    return maze.map(row => row.join('')).join('\n');
}

// 繪製迷宮成圖片
function renderDungeonToImage(地下城) {
    const dungeon = parseMazeString(地下城.地圖);
    const tileSize = 32;
    const rows = dungeon.length;
    const cols = dungeon[0].length;

    const canvas = createCanvas(cols * tileSize, rows * tileSize);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const COLORS = { '.': '#FFFFFF', 'W': '#8B4513', 'E': '#FFD700', 'D': '#00FFFF' };

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            ctx.fillStyle = COLORS[dungeon[y][x]] || '#FF00FF';
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
            ctx.strokeStyle = '#333333';
            ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
    }
    return canvas;
}

// 繪製玩家的地下城圖片
function renderPlayerDungeonToImage(player) {
    const dungeon = parseMazeString(player.地圖);   // 地圖字串 -> 二維陣列
    const explored = parseMazeString(player.探索);  // 探索字串 -> 二維陣列
    const visible = parseMazeString(player.可視);   // 可視字串 -> 二維陣列

    const tileSize = 32;
    const rows = dungeon.length;
    const cols = dungeon[0].length;

    const canvas = createCanvas(cols * tileSize, rows * tileSize);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const COLORS = { '.': '#FFFFFF', 'W': '#8B4513', 'D': '#00FFFF', 'E': '#FFD700' };
    const EXPLORED_D_COLOR = '#7777FF';

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let cell = dungeon[y][x];

            if (cell === 'D' && explored[y][x]) ctx.fillStyle = EXPLORED_D_COLOR;
            else if (visible[y][x]) ctx.fillStyle = COLORS[cell] || '#FF00FF';
            else ctx.fillStyle = '#000000';

            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
            ctx.strokeStyle = '#333333';
            ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
    }
    

    // === 繪製定位格線（彩色）===
    // 垂直線
    for (let x = 0; x <= cols; x++) {
        if (x % 10 === 0) {
            ctx.strokeStyle = '#FF0000'; // 每10格：紅線
            ctx.lineWidth = 2;
        } else if (x % 5 === 0) {
            ctx.strokeStyle = '#FF0000'; // 每5格：藍線
            ctx.lineWidth = 1;
        } else {
            continue;
        }
        ctx.beginPath();
        ctx.moveTo(x * tileSize, 0);
        ctx.lineTo(x * tileSize, rows * tileSize);
        ctx.stroke();
    }

    // 水平線
    for (let y = 0; y <= rows; y++) {
        if (y % 10 === 0) {
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
        } else if (y % 5 === 0) {
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 1;
        } else {
            continue;
        }
        ctx.beginPath();
        ctx.moveTo(0, y * tileSize);
        ctx.lineTo(cols * tileSize, y * tileSize);
        ctx.stroke();
    }



    // 玩家位置
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(player.座標.x * tileSize, player.座標.y * tileSize, tileSize, tileSize);

    return canvas;
}

module.exports = {
    // generateSparse,
    // generateMedium,
    // generateDense,
    
    GenerateMaze,
    countElements,
    renderDungeonToImage,
    renderPlayerDungeonToImage,
}