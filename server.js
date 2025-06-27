// server.js - リアルタイム絵チャットサーバー
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静的ファイルの配信設定
app.use(express.static(path.join(__dirname, 'public')));

// 管理者パスワード（実際の運用では環境変数等で管理）
const ADMIN_PASSWORD = 'admin123';

// 接続中のユーザー情報を保存
const connectedUsers = new Map();

// 描画データを保存（メモリ上に保存、実際の運用ではDBを使用推奨）
let drawingData = {
    layer1: [], // レイヤー1の描画データ
    layer2: []  // レイヤー2の描画データ
};

// チャットメッセージを保存
let chatMessages = [];

// Socket.io接続処理
io.on('connection', (socket) => {
    console.log(`新しいユーザーが接続しました: ${socket.id}`);

    // ユーザー認証（名前と管理者権限の確認）
    socket.on('authenticate', (data) => {
        const { username, adminPassword } = data;
        const isAdmin = adminPassword === ADMIN_PASSWORD;
        
        // ユーザー情報を保存
        connectedUsers.set(socket.id, {
            username: username,
            isAdmin: isAdmin,
            id: socket.id
        });
        
        console.log(`ユーザー認証完了: ${username} (管理者: ${isAdmin})`);
        
        // 認証成功をクライアントに通知
        socket.emit('authenticated', {
            success: true,
            isAdmin: isAdmin,
            username: username
        });
        
        // 既存の描画データを新しいユーザーに送信
        socket.emit('initialize-canvas', drawingData);
        
        // 既存のチャットメッセージを送信
        socket.emit('chat-history', chatMessages);
        
        // 他のユーザーに新規参加を通知
        socket.broadcast.emit('user-joined', {
            username: username,
            isAdmin: isAdmin
        });
        
        // 現在の接続ユーザー一覧を全員に送信
        io.emit('users-update', Array.from(connectedUsers.values()));
    });

    // 描画データの受信と配信
    socket.on('draw-data', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        // 描画データに描画者情報を追加
        const drawData = {
            ...data,
            username: user.username,
            isAdmin: user.isAdmin,
            userId: socket.id,
            timestamp: new Date().toISOString()
        };
        
        // レイヤーに応じてデータを保存
        if (data.layer === 'layer1') {
            drawingData.layer1.push(drawData);
        } else if (data.layer === 'layer2') {
            drawingData.layer2.push(drawData);
        }
        
        // 他の全ユーザーに描画データを配信
        socket.broadcast.emit('draw-data', drawData);
        
        console.log(`描画データ受信: ${user.username} - Layer: ${data.layer}`);
    });

    // チャットメッセージの受信と配信
    socket.on('chat-message', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const chatData = {
            username: user.username,
            message: data.message,
            isAdmin: user.isAdmin,
            timestamp: new Date().toISOString()
        };
        
        // チャットメッセージを保存
        chatMessages.push(chatData);
        
        // メッセージ履歴を最新100件に制限
        if (chatMessages.length > 100) {
            chatMessages = chatMessages.slice(-100);
        }
        
        // 全ユーザーにチャットメッセージを配信
        io.emit('chat-message', chatData);
        
        console.log(`チャットメッセージ: ${user.username}: ${data.message}`);
    });

    // キャンバスクリア（管理者のみ）
    socket.on('clear-canvas', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !user.isAdmin) {
            socket.emit('error', { message: '管理者権限が必要です' });
            return;
        }
        
        // 指定されたレイヤーをクリア
        if (data.layer === 'layer1') {
            drawingData.layer1 = [];
        } else if (data.layer === 'layer2') {
            drawingData.layer2 = [];
        } else if (data.layer === 'all') {
            drawingData.layer1 = [];
            drawingData.layer2 = [];
        }
        
        // 全ユーザーにクリア通知
        io.emit('canvas-cleared', data);
        
        console.log(`キャンバスクリア実行: ${user.username} - Layer: ${data.layer}`);
    });

    // ユーザー切断処理
    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            console.log(`ユーザーが切断しました: ${user.username}`);
            
            // ユーザー情報を削除
            connectedUsers.delete(socket.id);
            
            // 他のユーザーに切断を通知
            socket.broadcast.emit('user-left', {
                username: user.username
            });
            
            // 現在の接続ユーザー一覧を更新
            io.emit('users-update', Array.from(connectedUsers.values()));
        }
    });

    // エラーハンドリング
    socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
    });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🎨 絵チャットサーバーが起動しました`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🔑 管理者パスワード: ${ADMIN_PASSWORD}`);
    console.log(`=================================`);
});

// プロセス終了時の処理
process.on('SIGINT', () => {
    console.log('\n絵チャットサーバーを終了します...');
    process.exit(0);
});