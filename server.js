import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import ServerGame from './server/ServerGame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Serve static files from current directory
app.use(express.static(__dirname));

// Basic route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Firebase Config Endpoint
app.get('/api/config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    });
});

// Room Management
const rooms = new Map(); // roomId -> ServerGame instance

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    let currentRoomId = null;

    socket.on('joinGame', ({ roomId, mode, config }) => {
        // Leave previous room if any
        if (currentRoomId && rooms.has(currentRoomId)) {
            const oldGame = rooms.get(currentRoomId);
            oldGame.removePlayer(socket.id);
            if (oldGame.players.size === 0) rooms.delete(currentRoomId);
        }

        currentRoomId = roomId;
        socket.join(roomId);

        let game = rooms.get(roomId);
        if (!game) {
            console.log(`Creating new room: ${roomId}`);
            game = new ServerGame(io, roomId); // Pass roomId for broadcasting
            if (config) game.setGameRules(config); // Set initial rules
            rooms.set(roomId, game);
        }

        const playerNum = game.addPlayer(socket.id);

        // Notify client
        socket.emit('gameJoined', {
            roomId,
            playerNum,
            config: { difficulty: game.difficulty, scoreLimit: game.scoreLimit }
        });

        // Notify others in room
        socket.to(roomId).emit('playerConnected', { playerNum });

        // If rules changed during join (e.g. difficulty), sync them
        if (config) game.setGameRules(config);
    });

    socket.on('input', (data) => {
        if (currentRoomId && rooms.has(currentRoomId)) {
            rooms.get(currentRoomId).handleInput(socket.id, data);
        }
    });

    socket.on('setGameRules', (rules) => {
        if (currentRoomId && rooms.has(currentRoomId)) {
            rooms.get(currentRoomId).setGameRules(rules);
        }
    });

    socket.on('togglePause', () => {
        if (currentRoomId && rooms.has(currentRoomId)) {
            rooms.get(currentRoomId).togglePause();
        }
    });

    socket.on('requestRestart', () => {
        if (currentRoomId && rooms.has(currentRoomId)) {
            rooms.get(currentRoomId).handleRestartRequest(socket.id);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (currentRoomId && rooms.has(currentRoomId)) {
            const game = rooms.get(currentRoomId);
            game.removePlayer(socket.id);
            if (game.players.size === 0) {
                console.log(`Room empty, deleting: ${currentRoomId}`);
                // Stop the game loop if needed? ServerGame constructor starts loop.
                // ideally we should stop loop, but for now GC might handle it if referenced.
                // Better: game.stop(); (need to add stop method)
                clearInterval(game.loopId);
                clearInterval(game.powerupInterval);
                rooms.delete(currentRoomId);
            }
        }
    });
});


const PORT = 3000;
const server = httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

const gracefulShutdown = () => {
    console.log('Received kill signal, shutting down gracefully');
    server.close(() => {
        console.log('Closed out remaining connections');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
