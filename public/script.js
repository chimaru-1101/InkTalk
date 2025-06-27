// script.js - リアルタイム絵チャット クライアント

// グローバル変数
let socket = null;
let isAuthenticated = false;
let currentUser = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// 描画設定
let currentTool = 'pen';
let currentColor = '#000000';
let currentSize = 5;
let currentOpacity = 1.0;
let currentLayer = 'layer1';

// キャンバス要素
let canvasLayer1, canvasLayer2, canvasDrawing;
let ctxLayer1, ctxLayer2, ctxDrawing;

// UI要素
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const usernameInput = document.getElementById('username-input');
const adminPasswordInput = document.getElementById('admin-password');
const joinBtn = document.getElementById('join-btn');
const userInfo = document.getElementById('user-info');
const connectionStatus = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');

// キャンバスサイズ調整（統一版）
function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (!wrapper) return; // wrapperがなければ何もしない

    const rect = wrapper.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    [canvasLayer1, canvasLayer2, canvasDrawing].forEach(canvas => {
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    });
}

// 初期化時とリサイズ時にキャンバスサイズ調整
window.addEventListener('load', () => {
    resizeCanvas();
    setTimeout(resizeCanvas, 100); // モバイル対応などで遅延リサイズ
});
window.addEventListener('resize', resizeCanvas);

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 絵チャットクライアント初期化開始');
    
    // Socket.io接続
    initializeSocket();
    
    // UI初期化
    initializeUI();
    
    // キャンバス初期化
    initializeCanvas();
    
    // イベントリスナー設定
    setupEventListeners();
    
    console.log('✅ 初期化完了');
});

// ========== Socket.io 初期化 ==========
function initializeSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('🔗 サーバーに接続しました');
        updateConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
        console.log('❌ サーバーから切断されました');
        updateConnectionStatus('disconnected');
    });

    socket.on('authenticated', (data) => {
        console.log('🔐 認証完了:', data);
        if (data.success) {
            isAuthenticated = true;
            currentUser = {
                username: data.username,
                isAdmin: data.isAdmin
            };
            loginScreen.classList.add('hidden');
            mainScreen.classList.remove('hidden');
            updateUserInfo();
            if (data.isAdmin) {
                document.getElementById('admin-controls').classList.remove('hidden');
            }
        }
    });

    socket.on('initialize-canvas', (data) => {
        console.log('🎨 キャンバス初期化データ受信');
        if (data.layer1) data.layer1.forEach(d => drawOnCanvas(d, false));
        if (data.layer2) data.layer2.forEach(d => drawOnCanvas(d, false));
    });

    socket.on('draw-data', (data) => {
        drawOnCanvas(data, false);
    });

    socket.on('chat-message', (data) => {
        addChatMessage(data);
    });

    socket.on('chat-history', (messages) => {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        messages.forEach(addChatMessage);
    });

    socket.on('user-joined', (data) => {
        addSystemMessage(`${data.username}さんが参加しました`);
    });

    socket.on('user-left', (data) => {
        addSystemMessage(`${data.username}さんが退出しました`);
    });

    socket.on('users-update', (users) => {
        updateUserCount(users.length);
    });

    socket.on('canvas-cleared', (data) => {
        if (data.layer === 'layer1' || data.layer === 'all') {
            ctxLayer1.clearRect(0, 0, canvasLayer1.width, canvasLayer1.height);
        }
        if (data.layer === 'layer2' || data.layer === 'all') {
            ctxLayer2.clearRect(0, 0, canvasLayer2.width, canvasLayer2.height);
        }
        addSystemMessage(`キャンバスがクリアされました (${data.layer})`);
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
        alert('エラーが発生しました: ' + error.message);
    });
}

// ========== UI 初期化 ==========
function initializeUI() {
    updateConnectionStatus('connecting');
    updateToolUI();
    updateColorUI();
    updateSizeUI();
    updateOpacityUI();
    updateLayerUI();
}

// ========== キャンバス初期化 ==========
function initializeCanvas() {
    canvasLayer1 = document.getElementById('canvas-layer1');
    canvasLayer2 = document.getElementById('canvas-layer2');
    canvasDrawing = document.getElementById('canvas-drawing');

    ctxLayer1 = canvasLayer1.getContext('2d');
    ctxLayer2 = canvasLayer2.getContext('2d');
    ctxDrawing = canvasDrawing.getContext('2d');

    resizeCanvas(); // ←ここでキャンバスサイズを合わせる

    setupCanvasContext(ctxLayer1);
    setupCanvasContext(ctxLayer2);
    setupCanvasContext(ctxDrawing);

    console.log('🎨 キャンバス初期化完了');
}

// キャンバスコンテキスト設定
function setupCanvasContext(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
}

// ========== イベントリスナー設定 ==========
function setupEventListeners() {
    joinBtn.addEventListener('click', handleLogin);
    usernameInput.addEventListener('keypress', e => { if(e.key === 'Enter') handleLogin(); });
    adminPasswordInput.addEventListener('keypress', e => { if(e.key === 'Enter') handleLogin(); });

    setupDrawingEvents();
    setupToolEvents();
    setupChatEvents();

    window.addEventListener('resize', resizeCanvas);
}

// 描画イベント設定
function setupDrawingEvents() {
    canvasDrawing.addEventListener('mousedown', startDrawing);
    canvasDrawing.addEventListener('mousemove', draw);
    canvasDrawing.addEventListener('mouseup', stopDrawing);
    canvasDrawing.addEventListener('mouseout', stopDrawing);

    canvasDrawing.addEventListener('touchstart', handleTouch);
    canvasDrawing.addEventListener('touchmove', handleTouch);
    canvasDrawing.addEventListener('touchend', stopDrawing);

    canvasDrawing.addEventListener('contextmenu', e => e.preventDefault());
}

// ツールイベント設定
function setupToolEvents() {
    document.querySelectorAll('.layer-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            currentLayer = e.target.dataset.layer;
            updateLayerUI();
        });
    });

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            currentTool = e.target.dataset.tool;
            updateToolUI();
        });
    });

    document.querySelectorAll('.color-item').forEach(item => {
        item.addEventListener('click', e => {
            currentColor = e.target.dataset.color;
            updateColorUI();
        });
    });

    document.getElementById('color-picker').addEventListener('change', e => {
        currentColor = e.target.value;
        updateColorUI();
    });

    document.getElementById('brush-size').addEventListener('input', e => {
        currentSize = parseInt(e.target.value);
        updateSizeUI();
    });

    document.getElementById('opacity').addEventListener('input', e => {
        currentOpacity = parseInt(e.target.value) / 100;
        updateOpacityUI();
    });

    document.getElementById('layer1-opacity').addEventListener('input', e => {
        const opacity = parseInt(e.target.value) / 100;
        canvasLayer1.style.opacity = opacity;
        document.getElementById('layer1-opacity-value').textContent = e.target.value;
    });

    document.getElementById('layer2-opacity').addEventListener('input', e => {
        const opacity = parseInt(e.target.value) / 100;
        canvasLayer2.style.opacity = opacity;
        document.getElementById('layer2-opacity-value').textContent = e.target.value;
    });

    document.getElementById('clear-current-layer')?.addEventListener('click', () => {
        if(confirm('現在のレイヤーをクリアしますか？')){
            socket.emit('clear-canvas', { layer: currentLayer });
        }
    });

    document.getElementById('clear-all-layers')?.addEventListener('click', () => {
        if(confirm('全てのレイヤーをクリアしますか？')){
            socket.emit('clear-canvas', { layer: 'all' });
        }
    });
}

// チャットイベント設定
function setupChatEvents() {
    document.getElementById('toggle-chat').addEventListener('click', () => {
        document.getElementById('chat-panel').classList.toggle('hidden');
    });

    document.getElementById('close-chat').addEventListener('click', () => {
        document.getElementById('chat-panel').classList.add('hidden');
    });

    document.getElementById('back-to-draw').addEventListener('click', () => {
        document.getElementById('chat-panel').classList.add('hidden');
    });

    document.getElementById('send-chat').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendChatMessage();
    });
}

// ========== 描画関連 ==========
function startDrawing(e) {
    if (!isAuthenticated) return;
    isDrawing = true;
    const coords = getMousePos(e);
    lastX = coords.x;
    lastY = coords.y;

    const ctx = getDrawingContext();
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);

    const drawData = {
        layer: currentLayer,
        tool: currentTool,
        color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
        size: currentSize,
        opacity: currentOpacity,
        startX: lastX,
        startY: lastY,
        endX: lastX + 0.1,
        endY: lastY + 0.1
    };

    drawOnCanvas(drawData, true);
    socket.emit('draw-data', drawData);
}

function draw(e) {
    if (!isDrawing || !isAuthenticated) return;
    const coords = getMousePos(e);

    const ctx = getDrawingContext();
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    const drawData = {
        layer: currentLayer,
        tool: currentTool,
        color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
        size: currentSize,
        opacity: currentOpacity,
        startX: lastX,
        startY: lastY,
        endX: coords.x,
        endY: coords.y
    };

    drawOnCanvas(drawData, true);
    socket.emit('draw-data', drawData);

    lastX = coords.x;
    lastY = coords.y;
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    ctxDrawing.clearRect(0, 0, canvasDrawing.width, canvasDrawing.height);
}

function handleTouch(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent(
            e.type === 'touchstart' ? 'mousedown' : 
            e.type === 'touchmove' ? 'mousemove' : 'mouseup',
            {
                clientX: touch.clientX,
                clientY: touch.clientY
            }
        );
        canvasDrawing.dispatchEvent(mouseEvent);
    }
}

function getMousePos(e) {
    const rect = canvasDrawing.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvasDrawing.width / rect.width),
        y: (e.clientY - rect.top) * (canvasDrawing.height / rect.height)
    };
}

function getDrawingContext() {
    setupDrawingStyle(ctxDrawing);
    return ctxDrawing;
}

function setupDrawingStyle(ctx) {
    ctx.strokeStyle = currentTool === 'eraser' ? '#FFFFFF' : currentColor;
    ctx.lineWidth = currentSize;
    ctx.globalAlpha = currentOpacity;
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
}

function drawOnCanvas(drawData, isLocal = true) {
    const ctx = drawData.layer === 'layer1' ? ctxLayer1 : ctxLayer2;

    ctx.save();

    ctx.strokeStyle = drawData.color;
    ctx.lineWidth = drawData.size;
    ctx.globalAlpha = drawData.opacity;
    ctx.globalCompositeOperation = drawData.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(drawData.startX, drawData.startY);
    ctx.lineTo(drawData.endX, drawData.endY);
    ctx.stroke();

    ctx.restore();
}

// ========== ログイン処理 ==========
function handleLogin() {
    const username = usernameInput.value.trim();
    const adminPassword = adminPasswordInput.value.trim();

    if (!username) {
        alert('お名前を入力してください');
        return;
    }
    if (username.length > 20) {
        alert('お名前は20文字以内で入力してください');
        return;
    }

    socket.emit('authenticate', {
        username: username,
        adminPassword: adminPassword
    });

    updateConnectionStatus('connecting');
}

// ========== チャット処理 ==========
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (message && isAuthenticated) {
        socket.emit('chat-message', { message: message });
        input.value = '';
    }
}

function addChatMessage(data) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${data.isAdmin ? 'admin' : ''}`;

    const time = new Date(data.timestamp).toLocaleTimeString();

    messageDiv.innerHTML = `
        <div class="chat-username ${data.isAdmin ? 'admin' : ''}">${data.username}${data.isAdmin ? ' (管理者)' : ''}</div>
        <div class="chat-text">${escapeHtml(data.message)}</div>
        <div class="chat-time">${time}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message system';

    messageDiv.innerHTML = `
        <div class="chat-text">${escapeHtml(message)}</div>
        <div class="chat-time">${new Date().toLocaleTimeString()}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ========== UI更新 ==========
function updateUserInfo() {
    if (currentUser) {
        userInfo.textContent = `${currentUser.username}${currentUser.isAdmin ? ' (管理者)' : ''}`;
    }
}

function updateConnectionStatus(status) {
    connectionStatus.className = `connection-status ${status}`;

    switch (status) {
        case 'connected':
            statusText.textContent = '接続済み';
            break;
        case 'disconnected':
            statusText.textContent = '切断';
            break;
        case 'connecting':
            statusText.textContent = '接続中...';
            break;
    }
}

function updateUserCount(count) {
    document.getElementById('user-count').textContent = count;
}

function updateToolUI() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === currentTool);
    });
}

function updateColorUI() {
    document.querySelectorAll('.color-item').forEach(item => {
        item.classList.toggle('active', item.dataset.color === currentColor);
    });
    document.getElementById('color-picker').value = currentColor;
}

function updateSizeUI() {
    document.getElementById('brush-size-value').textContent = currentSize;
    document.getElementById('brush-size').value = currentSize;
}

function updateOpacityUI() {
    const opacityPercent = Math.round(currentOpacity * 100);
    document.getElementById('opacity-value').textContent = opacityPercent;
    document.getElementById('opacity').value = opacityPercent;
}

function updateLayerUI() {
    document.querySelectorAll('.layer-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.layer === currentLayer);
    });
}

// ========== ユーティリティ ==========
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== エラーハンドリング ==========
window.addEventListener('error', (e) => {
    console.error('❌ JavaScript Error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ Unhandled Promise Rejection:', e.reason);
});

console.log('🎨 script.js loaded successfully');
