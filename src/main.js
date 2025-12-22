import Game from './Game.js';
import { initFirebase, db, doc, setDoc, getDoc, updateDoc, onSnapshot } from './firebase.js';

window.addEventListener('load', async () => {
    // 1. Determine Server URL first
    // 1. Determine Server URL logic
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    let serverUrl;
    if (isLocal) {
        serverUrl = 'http://localhost:3000';
    } else if (window.location.hostname.includes('vercel.app')) {
        // If hosted on Vercel, point to the separate Backend URL
        serverUrl = 'https://snake-fight-backend.onrender.com';
    } else {
        // Monolith Mode (e.g. hosted on Render directly) - behaves like localhost
        serverUrl = window.location.origin;
    }

    // 2. Initialize Firebase with Server URL (for config fetch)
    const firebaseReady = await initFirebase(serverUrl);

    // UI References
    const mainMenu = document.getElementById('main-menu');
    const gameContainer = document.getElementById('game-container');
    const btnOffline = document.getElementById('btn-offline');
    const btnOnline = document.getElementById('btn-online');
    const btnStart = document.getElementById('btn-start');
    // const diffSelect = document.getElementById('difficulty-select'); // REMOVED
    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');

    // Online Controls
    const onlineControls = document.getElementById('online-controls');
    const roomInput = document.getElementById('room-code');
    const btnCreateRoom = document.getElementById('btn-create-room'); // HOST button
    const btnJoinRoom = document.getElementById('btn-join-room');

    // Lobby Elements
    const hostLobby = document.getElementById('host-lobby');
    const lobbyCodeDisplay = document.getElementById('lobby-room-code');
    const lobbyStatus = document.getElementById('lobby-status');
    const btnLetsPlay = document.getElementById('btn-lets-play');

    let mode = 'offline';
    let difficulty = 1;
    let socket = null;
    let roomId = null;
    let myPlayerId = null; // Store for Host

    // Connect Socket
    // Connect Socket
    try {
        if (typeof io !== 'undefined') {
            socket = io(serverUrl);
            console.log("Connecting to:", serverUrl);
        } else {
            console.warn('Socket.io client not loaded. Online mode may be limited.');
        }
    } catch (e) { console.warn('Socket init error:', e); }

    // Toggle Mode
    btnOffline.addEventListener('click', () => {
        mode = 'offline';
        btnOffline.className = 'mode-btn active';
        btnOnline.className = 'mode-btn';
        onlineControls.classList.add('hidden');
    });

    btnOnline.addEventListener('click', () => {
        mode = 'online';
        btnOnline.className = 'mode-btn active';
        btnOffline.className = 'mode-btn';
        onlineControls.classList.remove('hidden');
        if (!socket) {
            alert("Warning: Game Server not connected! Online play requires a backend server (not supported on standard Vercel hosting).");
        }
    });

    // --- HOST LOBBY LOGIC ---
    btnCreateRoom.addEventListener('click', async () => {
        if (!socket) return alert("No Connection!");
        if (!firebaseReady) return alert("Firebase not connected! Check .env.local");

        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        roomId = code;

        // Show Lobby
        mainMenu.classList.add('hidden');
        hostLobby.classList.remove('hidden');
        lobbyCodeDisplay.innerText = code;
        lobbyStatus.innerText = "Creating Room in Cloud...";
        btnLetsPlay.classList.add('hidden');

        // Create in Firestore
        try {
            await setDoc(doc(db, "lobbies", roomId), {
                createdAt: Date.now(),
                status: 'waiting',
                hostId: socket.id || 'host',
                difficulty: difficulty,
                scoreLimit: parseInt(scoreInput.value) || 50
            });
            lobbyStatus.innerText = "Waiting for Player 2...";

            // Listen for Player 2
            onSnapshot(doc(db, "lobbies", roomId), (snap) => {
                const data = snap.data();
                if (data && data.player2) {
                    lobbyStatus.innerText = "PLAYER 2 JOINED!";
                    lobbyStatus.style.color = "var(--primary)";
                    lobbyStatus.style.textShadow = "var(--glow-primary)";
                    btnLetsPlay.classList.remove('hidden');
                }
            });

        } catch (e) {
            console.error(e);
            alert("Error creating Firestore room: " + e.message);
            // Fallback to offline/menu?
            location.reload();
            return;
        }

        // Emit Join as Host to Socket (keep existing logic)
        socket.emit('joinGame', {
            roomId: roomId,
            mode: 'online',
            config: {
                difficulty: difficulty,
                scoreLimit: parseInt(scoreInput.value) || 50
            }
        });
    });

    if (socket) {
        socket.on('gameJoined', (data) => {
            myPlayerId = data.playerNum;
        });

        socket.on('playerConnected', () => {
            // Someone joined!
            lobbyStatus.innerText = "PLAYER 2 JOINED!";
            lobbyStatus.style.color = "var(--primary)";
            lobbyStatus.style.textShadow = "var(--glow-primary)";
            btnLetsPlay.classList.remove('hidden');
        });
    }

    btnLetsPlay.addEventListener('click', () => {
        // Host starts game
        hostLobby.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        startGame(true); // true = skipJoin
    });

    // --- JOIN LOGIC ---
    btnJoinRoom.addEventListener('click', async () => {
        roomId = roomInput.value.toUpperCase();
        if (!roomId) {
            alert("Please enter a Room Code");
            return;
        }
        if (!firebaseReady) return alert("Firebase not connected!");

        const btnOriginalText = btnJoinRoom.innerText;
        btnJoinRoom.innerText = "Checking...";

        try {
            const lobbyRef = doc(db, "lobbies", roomId);
            const lobbySnap = await getDoc(lobbyRef);

            if (!lobbySnap.exists()) {
                alert("Room not found!");
                btnJoinRoom.innerText = btnOriginalText;
                return;
            }

            const data = lobbySnap.data();
            if (data.status !== 'waiting') {
                alert("Room is full or already started!");
                btnJoinRoom.innerText = btnOriginalText;
                return;
            }

            // Join Room in Firestore
            await updateDoc(lobbyRef, {
                player2: true,
                status: 'ready'
            });

            // Proceed to Game
            mainMenu.classList.add('hidden');
            gameContainer.classList.remove('hidden');
            startGame(false); // Normal join

        } catch (e) {
            console.error(e);
            alert("Error joining room: " + e.message);
            btnJoinRoom.innerText = btnOriginalText;
        }
    });

    // Helper to start game instance
    function startGame(skipJoin) {
        const targetScore = parseInt(scoreInput.value) || 50;
        const canvas = document.getElementById('game-canvas');
        const controls = {
            p1: {
                up: document.getElementById('p1-up').value,
                down: document.getElementById('p1-down').value,
                left: document.getElementById('p1-left').value,
                right: document.getElementById('p1-right').value
            },
            p2: {
                up: document.getElementById('p2-up').value,
                down: document.getElementById('p2-down').value,
                left: document.getElementById('p2-left').value,
                right: document.getElementById('p2-right').value
            }
        };

        const config = {
            mode: mode,
            difficulty: difficulty,
            scoreLimit: targetScore,
            roomId: roomId,
            controls: controls,
            skipJoin: skipJoin,
            playerId: myPlayerId
        };

        const game = new Game(canvas, socket, config);
        window.currentGame = game;
        game.start();
    }

    // Settings Logic (Existing...)

    // Difficulty Logic
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            difficulty = parseInt(btn.dataset.value);
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Difficulty Logic
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            difficulty = parseInt(btn.dataset.value);
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Settings Logic
    btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    btnSaveSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

    const settingInputs = document.querySelectorAll('.control-group input');
    settingInputs.forEach(input => {
        input.addEventListener('click', () => {
            input.value = 'Press Key...';
            input.classList.add('binding');
        });

        input.addEventListener('keydown', (e) => {
            e.preventDefault();
            input.value = e.code;
            input.classList.remove('binding');
            input.blur();
        });
    });

    // Score Stepper Logic
    const scoreInput = document.getElementById('target-score');
    document.getElementById('score-minus').addEventListener('click', () => {
        let val = parseInt(scoreInput.value) || 50;
        val = Math.max(10, val - 10);
        scoreInput.value = val;
    });

    document.getElementById('score-plus').addEventListener('click', () => {
        let val = parseInt(scoreInput.value) || 50;
        val = Math.min(999, val + 10);
        scoreInput.value = val;
    });

    // Start Game
    btnStart.addEventListener('click', () => {
        // Validation for Online Mode
        if (mode === 'online') {
            roomId = roomInput.value.toUpperCase();
            if (!roomId) {
                alert("Please Create or Join a Room first!");
                return;
            }
        }

        mainMenu.classList.add('hidden');
        gameContainer.classList.remove('hidden');

        // Difficulty is now a global var updated by buttons
        const targetScore = parseInt(scoreInput.value) || 50;
        const canvas = document.getElementById('game-canvas');

        // Read controls
        const controls = {
            p1: {
                up: document.getElementById('p1-up').value,
                down: document.getElementById('p1-down').value,
                left: document.getElementById('p1-left').value,
                right: document.getElementById('p1-right').value
            },
            p2: {
                up: document.getElementById('p2-up').value,
                down: document.getElementById('p2-down').value,
                left: document.getElementById('p2-left').value,
                right: document.getElementById('p2-right').value
            }
        };

        const game = new Game(canvas, socket, {
            mode: mode,
            difficulty: difficulty,
            scoreLimit: targetScore,
            roomId: roomId, // Pass Room ID
            controls: controls
        });
        window.currentGame = game; // Expose for controls
        game.start();
    });

    // In-Game Controls
    document.getElementById('btn-leave').addEventListener('click', () => location.reload());

    document.getElementById('btn-pause').addEventListener('click', () => {
        if (window.currentGame) window.currentGame.togglePause();
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
        if (window.currentGame) window.currentGame.togglePause();
    });

    document.getElementById('btn-quit').addEventListener('click', () => location.reload());
});
