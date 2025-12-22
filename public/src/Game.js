import Snake from './Snake.js';
import Arena from './Arena.js';

export default class Game {
    constructor(canvas, socket, config = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.socket = socket;
        this.width = canvas.width;
        this.height = canvas.height;
        this.config = config; // { mode, difficulty, controls }
        this.playerNum = null;
        this.lastTime = 0;
        this.timer = 120;
        this.isGameOver = false;

        // Initialize entities
        const p1Controls = this.config.controls?.p1 || { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
        const p2Controls = this.config.controls?.p2 || { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

        this.arena = new Arena(this.width, this.height);
        this.snake1 = new Snake(1, 100, 100, '#e94560', p1Controls);
        this.snake2 = new Snake(2, 700, 500, '#4ecca3', p2Controls);

        // Apply Difficulty (Speed)
        const speedMult = parseInt(this.config.difficulty || 1);
        this.snake1.speed *= speedMult;
        this.snake2.speed *= speedMult;

        // UI Elements
        this.ui = {
            p1Score: document.getElementById('score-p1'),
            p2Score: document.getElementById('score-p2'),
            timer: document.getElementById('time-remaining'),
            roomDisplay: document.getElementById('room-display'),
            gameOverScreen: document.getElementById('game-over-screen'),
            pauseScreen: document.getElementById('pause-screen'),
            winnerText: document.getElementById('winner-text'),
            restartBtn: document.getElementById('restart-btn'),
            status: document.querySelector('#main-menu') ? null : document.createElement('div')
        };

        // Ensure screens are hidden
        this.ui.gameOverScreen.classList.add('hidden');
        this.ui.pauseScreen.classList.add('hidden');

        this.config.scoreLimit = parseInt(this.config.scoreLimit) || 100; // Default 100
        this.isPaused = false;

        // Timer - Elapsed Time Mode (Count Up)
        this.timer = 0;

        // Setup based on mode
        if (this.config.mode === 'online') {
            if (this.ui.roomDisplay) this.ui.roomDisplay.innerText = `ROOM: ${this.config.roomId}`;
            this.setupNetworking();
            if (this.socket) {
                // Send difficulty AND score limit
                this.socket.emit('setGameRules', {
                    difficulty: parseInt(this.config.difficulty || 1),
                    scoreLimit: this.config.scoreLimit
                });
            }
        } else {
            if (this.ui.roomDisplay) this.ui.roomDisplay.innerText = "";
            this.setupOfflineInputs();
        }    // Timer
        this.timerInterval = setInterval(() => {
            if (!this.isGameOver && !this.isPaused) {
                this.timer++;
                this.ui.timer.innerText = this.timer;
                // No Time Limit - Play until Score Limit
            }
        }, 1000);

        this.ui.playAgainBtn = document.getElementById('btn-play-again');
        this.ui.exitBtn = document.getElementById('btn-exit');

        if (this.ui.playAgainBtn) {
            this.ui.playAgainBtn.addEventListener('click', () => {
                if (this.config.mode === 'online' && this.socket) {
                    this.socket.emit('requestRestart');
                } else {
                    location.reload();
                }
            });
        }

        if (this.ui.exitBtn) {
            this.ui.exitBtn.addEventListener('click', () => {
                location.reload(); // Reloads to main menu
            });
        }
    }

    togglePause() {
        if (this.isGameOver) return;

        if (this.config.mode === 'online') {
            if (this.socket) this.socket.emit('togglePause');
            return;
        }

        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.ui.pauseScreen.classList.remove('hidden');
        } else {
            this.ui.pauseScreen.classList.add('hidden');
            this.lastTime = performance.now(); // Reset delta to prevent huge jump
            this.loop(this.lastTime);
        }
    }

    setupNetworking() {
        if (!this.socket) {
            console.error("Socket not initialized!");
            return;
        }

        if (this.config.skipJoin) {
            // Already joined in Lobby, just set ID
            this.playerId = this.config.playerId;
            console.log(`Re-attaching as Player ${this.playerId} (Lobby Join)`);
        } else {
            // New Join (Guest)
            this.socket.emit('joinGame', {
                roomId: this.config.roomId,
                mode: this.config.mode,
                config: {
                    difficulty: parseInt(this.config.difficulty || 1),
                    scoreLimit: this.config.scoreLimit
                }
            });
        }

        // Listen for successful join (for Guest or Re-join)
        this.socket.on('gameJoined', (data) => {
            console.log(`Joined Room: ${data.roomId} as Player ${data.playerNum}`);
            this.playerId = data.playerNum;
            if (this.ui.roomDisplay) {
                this.ui.roomDisplay.innerText = `ROOM: ${data.roomId} | P${data.playerNum}`;
                this.ui.roomDisplay.style.color = data.playerNum === 1 ? 'var(--primary)' : 'var(--secondary)';
            }
        });

        // Opponent Joined Notification
        this.socket.on('playerConnected', (data) => {
            console.log(`Player ${data.playerNum} connected!`);
            const msg = document.createElement('div');
            msg.innerText = "PLAYER 2 JOINED!\nLET'S PLAY!";
            msg.style.cssText = `
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                font-size: 3rem; color: #fff; text-shadow: 0 0 20px #fff;
                font-weight: bold; text-align: center; pointer-events: none;
                animation: glow 1s alternate infinite; z-index: 100;
            `;
            document.body.appendChild(msg);
            setTimeout(() => msg.remove(), 3000); // Remove after 3s
        });

        // Opponent Disconnected Notification
        this.socket.on('playerDisconnected', () => {
            const msg = document.createElement('div');
            msg.innerText = "OPPONENT LEFT";
            msg.style.cssText = `
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                font-size: 4rem; color: #ff4757; text-shadow: 0 0 20px #ff4757;
                font-weight: bold; text-align: center; pointer-events: none;
                z-index: 100;
             `;
            document.body.appendChild(msg);
            setTimeout(() => msg.remove(), 3000);
        });

        // Waiting for Restart
        this.socket.on('waitingForRestart', () => {
            if (this.ui.playAgainBtn) {
                this.ui.playAgainBtn.innerText = "WAITING FOR OPPONENT...";
                this.ui.playAgainBtn.disabled = true;
            }
        });

        // Game Restarted
        this.socket.on('gameRestarted', (gameState) => {
            console.log("Game Restarted!");
            // Reset button state
            if (this.ui.playAgainBtn) {
                this.ui.playAgainBtn.innerText = "PLAY AGAIN";
                this.ui.playAgainBtn.disabled = false;
            }
            this.ui.gameOverScreen.classList.add('hidden');
            this.ui.pauseScreen.classList.add('hidden');
            this.isGameOver = false;
            this.isPaused = false;
            this.ui.winnerText.innerText = "";
            this.updateFromState(gameState);
        });

        this.socket.on('gameState', (state) => {
            // Sync Pause State
            if (state.isPaused !== this.isPaused) {
                this.isPaused = state.isPaused;
                if (this.isPaused) {
                    this.ui.pauseScreen.classList.remove('hidden');
                } else {
                    this.ui.pauseScreen.classList.add('hidden');
                }
            }

            if (this.isPaused) return;

            // Update entities from server
            // Assuming 'this.entities' is initialized elsewhere or will be.
            // For now, let's update snake1 and snake2 directly based on player IDs.
            // This assumes a 2-player game where player IDs map to snake1/snake2.
            // A more robust solution would dynamically manage snakes in an array/map.
            if (state.players[1]) {
                this.syncSnake(this.snake1, state.players[1]);
            }
            if (state.players[2]) {
                this.syncSnake(this.snake2, state.players[2]);
            }

            this.arena.food = state.food;
            this.powerups = state.powerups || []; // Sync powerups

            this.ui.p1Score.innerText = this.snake1.score;
            this.ui.p2Score.innerText = this.snake2.score;
            this.ui.timer.innerText = Math.floor(state.timer);

            // Only end game if server says so
            if (state.status === 'ended' && !this.isGameOver) {
                // Determine winner from score since server just says 'ended' in status loop
                // BUT better: wait for 'gameOver' event for one-time trigger?
                // actually server emits 'gameOver' event separately.
                // so let's use that.
            }
            this.draw(); // Draw after updating state
        });

        this.socket.on('gameOver', (data) => {
            if (this.isGameOver) return;
            this.endGame(data.winner);
        });

        // Online Inputs
        window.addEventListener('keydown', (e) => {
            let action = null;
            const code = e.code;
            if (['KeyW', 'ArrowUp'].includes(code)) action = 'up';
            else if (['KeyS', 'ArrowDown'].includes(code)) action = 'down';
            else if (['KeyA', 'ArrowLeft'].includes(code)) action = 'left';
            else if (['KeyD', 'ArrowRight'].includes(code)) action = 'right';

            if (action) this.socket.emit('input', action);
        });
    }

    syncSnake(localSnake, data) {
        if (!localSnake || !data) return;
        localSnake.x = data.x;
        localSnake.y = data.y;
        localSnake.score = data.score;
        localSnake.history = data.history || [];
        localSnake.isStunned = data.isStunned;
        localSnake.stunTimer = data.stunTimer;
    }

    setupOfflineInputs() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') this.togglePause(); // Valid for ESC too
            if (this.isPaused) return;
            this.snake1.handleInput(e.code);
            this.snake2.handleInput(e.code);
        });
    }

    start() {
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    loop(currentTime) {
        if (this.isGameOver) return;
        if (this.isPaused) return; // Stop loop

        requestAnimationFrame((t) => this.loop(t));

        const dt = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        if (this.config.mode === 'offline') {
            this.updateOffline(dt);
        }
        // Online does not run local update logic, just rendering

        this.draw();
    }

    updateOffline(dt) {
        this.snake1.update(dt, this.arena);
        this.snake2.update(dt, this.arena);

        // Food Collision
        const checkFood = (snake) => {
            if (!snake.isStunned && this.arena.checkFoodCollision(snake)) {
                snake.grow();
                this.ui.p1Score.innerText = this.snake1.score;
                this.ui.p2Score.innerText = this.snake2.score;
            }
        };
        checkFood(this.snake1);
        checkFood(this.snake2);

        // Snake vs Snake Logic (Restored)
        const head1 = { x: this.snake1.x + this.snake1.size / 2, y: this.snake1.y + this.snake1.size / 2 };
        const head2 = { x: this.snake2.x + this.snake2.size / 2, y: this.snake2.y + this.snake2.size / 2 };

        // Head-to-Head
        if (Math.hypot(head1.x - head2.x, head1.y - head2.y) < this.snake1.size) {
            this.snake1.stun(2); this.snake1.bounce();
            this.snake2.stun(2); this.snake2.bounce();
        }

        // Body Hits
        if (!this.snake1.isStunned && this.snake2.checkBodyCollision(head1)) {
            this.snake1.score = Math.max(0, this.snake1.score - 5);
            this.snake1.stun(2); this.snake1.bounce();
            this.ui.p1Score.innerText = this.snake1.score;
        }
        if (!this.snake2.isStunned && this.snake1.checkBodyCollision(head2)) {
            this.snake2.score = Math.max(0, this.snake2.score - 5);
            this.snake2.stun(2); this.snake2.bounce();
            this.ui.p2Score.innerText = this.snake2.score;
        }

        // Win Condition
        if (this.snake1.score >= this.config.scoreLimit || this.snake2.score >= this.config.scoreLimit) this.endGame();
    }

    updateFromState(state) {
        this.syncSnake(this.snake1, state.players[1]);
        this.syncSnake(this.snake2, state.players[2]);
        this.arena.food = state.food;
        this.powerups = state.powerups || []; // Sync powerups
        this.ui.p1Score.innerText = this.snake1.score;
        this.ui.p2Score.innerText = this.snake2.score;
        this.ui.timer.innerText = Math.floor(state.timer);
    }

    syncSnake(local, server) {
        if (!server) return;
        local.x = server.x; local.y = server.y;
        local.score = server.score; local.color = server.color;
        local.history = server.history || [];
        local.isStunned = server.isStunned;
        local.effects = server.effects || { speed: 0, shield: 0 };
    }

    draw() {
        this.ctx.fillStyle = '#0f3460';
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.arena.draw(this.ctx, this.powerups); // Pass powerups
        this.snake1.draw(this.ctx);
        this.snake2.draw(this.ctx);
    }

    endGame() {
        this.isGameOver = true;
        let winner = "Draw";
        if (this.snake1.score > this.snake2.score) winner = "Player 1 Wins!";
        else if (this.snake2.score > this.snake1.score) winner = "Player 2 Wins!";
        this.ui.winnerText.innerText = winner;
        this.ui.gameOverScreen.classList.remove('hidden');
    }
}
