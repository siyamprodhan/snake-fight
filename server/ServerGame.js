export default class ServerGame {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.width = 800;
        this.height = 600;
        this.lastTime = Date.now();
        this.timer = 120;
        this.isGameOver = false;

        // ... existing init ...
        this.players = new Map();

        this.gameState = {
            players: {
                1: this.createPlayer(1, 100, 100, '#e94560'),
                2: this.createPlayer(2, 700, 500, '#4ecca3')
            },
            food: [],
            powerups: [],
            timer: 120,
            status: 'waiting',
            isPaused: false
        };

        this.restartRequests = new Set(); // Track players who want to restart
        this.spawnFood();
        this.baseSpeed = 200;
        this.scoreLimit = 100;
        this.startGameLoop();
        setInterval(() => {
            if (!this.gameState.isPaused && !this.isGameOver) {
                this.spawnPowerup();
            }
        }, 15000);
    }

    // ... existing methods ...

    broadcast() {
        this.io.to(this.roomId).emit('gameState', this.gameState);
    }

    setDifficulty(level) {
        this.baseSpeed = 200 * level;
        console.log('Difficulty set to:', level);
    }

    setGameRules(rules) {
        if (rules.difficulty) this.setDifficulty(rules.difficulty);
        if (rules.scoreLimit) this.scoreLimit = rules.scoreLimit;
        console.log(`Game Rules Updated: Speed=${this.baseSpeed}, ScoreLimit=${this.scoreLimit}`);
    }

    createPlayer(id, x, y, color) {
        return {
            id,
            x, y,
            color,
            vx: 0, vy: 0,
            score: 0,
            history: [],
            isStunned: false,
            stunTimer: 0,
            size: 20,
            effects: { // Active effects
                speed: 0, // timer
                shield: 0
            }
        };
    }

    addPlayer(socketId) {
        // ensure we return player num
        let pNum = null;
        if (!this.players.has(socketId)) {
            if (!Array.from(this.players.values()).includes(1)) pNum = 1;
            else if (!Array.from(this.players.values()).includes(2)) pNum = 2;

            if (pNum) {
                this.players.set(socketId, pNum);
                // Use createPlayer to ensure consistency
                this.gameState.players[pNum] = this.createPlayer(
                    pNum,
                    pNum === 1 ? 100 : 700,
                    pNum === 1 ? 100 : 500,
                    pNum === 1 ? '#e94560' : '#4ecca3'
                );
            }
        }
        return pNum;
    }

    removePlayer(socketId) {
        const pNum = this.players.get(socketId);
        if (pNum) {
            this.players.delete(socketId);
            this.restartRequests.delete(socketId); // Clear restart request if they leave

            // Notify other players in the room
            this.io.to(this.roomId).emit('playerDisconnected', { playerNum: pNum });

            // Optionally clear player state or mark as inactive?
            // For now, keep state but maybe reset?
            // actually keeping it allows rejoin with same state if we wanted, 
            // but here we just leave it.
        }
    }

    handleInput(socketId, startInput) { // input: 'up', 'down', 'left', 'right'
        const pNum = this.players.get(socketId);
        if (!pNum) {
            // console.log(`Input ignored: ${socketId} is not a player.`);
            return;
        }

        const player = this.gameState.players[pNum];
        if (!player || player.isStunned) return;

        // console.log(`Player ${pNum} input: ${startInput}`);

        const speed = this.baseSpeed;

        // Basic input handler similar to client
        switch (startInput) {
            case 'up': if (player.vy === 0) { player.vx = 0; player.vy = -speed; } break;
            case 'down': if (player.vy === 0) { player.vx = 0; player.vy = speed; } break;
            case 'left': if (player.vx === 0) { player.vx = -speed; player.vy = 0; } break;
            case 'right': if (player.vx === 0) { player.vx = speed; player.vy = 0; } break;
        }
    }

    spawnFood() {
        const x = Math.random() * (this.width - 20);
        const y = Math.random() * (this.height - 20);
        this.gameState.food.push({ x, y, size: 10, color: '#fca311' });
    }

    togglePause() {
        this.gameState.isPaused = !this.gameState.isPaused;
        this.broadcast();
    }

    startGameLoop() {
        this.loopId = setInterval(() => {
            if (this.gameState.isPaused) return; // Skip update if paused

            const now = Date.now();
            const deltaTime = (now - this.lastTime) / 1000;
            this.lastTime = now;

            this.update(deltaTime);
            this.broadcast();

        }, 1000 / 30); // 30 FPS server tick
    }

    update(dt) {
        if (this.gameState.timer > 0) {
            this.gameState.timer -= dt;
            if (this.gameState.timer <= 0) {
                this.gameState.timer = 0;
                // Optional: Game Over by Time? For now just stay at 0
            }
        }

        // Update players
        [1, 2].forEach(id => {
            const p = this.gameState.players[id];

            // Check if player exists (might have been removed or not added yet)
            if (!p) return;

            // Handle Effects
            if (p.effects && p.effects.speed > 0) p.effects.speed -= dt;
            if (p.effects && p.effects.shield > 0) p.effects.shield -= dt;

            if (p.isStunned) {
                p.stunTimer -= dt;
                if (p.stunTimer <= 0) p.isStunned = false;
                return;
            }

            // Apply Speed Boost
            let currentSpeed = 1.0;
            if (p.effects && p.effects.speed > 0) currentSpeed = 1.5;

            p.x += p.vx * dt * currentSpeed;
            p.y += p.vy * dt * currentSpeed;

            // Wrap around
            if (p.x < 0) p.x = this.width - p.size;
            else if (p.x > this.width - p.size) p.x = 0;
            if (p.y < 0) p.y = this.height - p.size;
            else if (p.y > this.height - p.size) p.y = 0;

            // History
            if (!p.history) p.history = [];
            const lastPos = p.history[0];
            if (!lastPos || Math.hypot(p.x - lastPos.x, p.y - lastPos.y) > 5) {
                p.history.unshift({ x: p.x, y: p.y });
            }
            const maxHistory = (5 + p.score / 2) * 4;
            if (p.history.length > maxHistory) p.history.pop();

            // Food collision
            this.gameState.food.forEach((f, index) => {
                if (Math.hypot(p.x - f.x, p.y - f.y) < p.size + f.size) {
                    p.score += 10;
                    this.gameState.food.splice(index, 1);
                    this.spawnFood();
                }
            });

            // Powerup collision
            this.gameState.powerups.forEach((pu, index) => {
                if (Math.hypot(p.x - pu.x, p.y - pu.y) < p.size + 15) {
                    // Activate Effect
                    if (p.effects) {
                        if (pu.type === 'speed') p.effects.speed = 5; // 5 seconds
                        if (pu.type === 'shield') p.effects.shield = 5;
                    }
                    this.gameState.powerups.splice(index, 1);
                }
            });
        });

        // Check collisions between players
        const p1 = this.gameState.players[1];
        const p2 = this.gameState.players[2];

        if (p1 && p2) {
            // Head to Head
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (dist < p1.size) {
                this.stun(p1);
                this.stun(p2);
                this.bounce(p1);
                this.bounce(p2);
            }

            // Body (naive check for now, can optimize later)
            // Check P1 hitting P2 body
            if (this.checkBodyHit(p1, p2)) {
                p1.score = Math.max(0, p1.score - 5);
                this.stun(p1);
                this.bounce(p1);
            }
            if (this.checkBodyHit(p2, p1)) {
                p2.score = Math.max(0, p2.score - 5);
                this.stun(p2);
                this.bounce(p2);
            }

            // Win Condition
            if (p1.score >= this.scoreLimit || p2.score >= this.scoreLimit) {
                console.log('Game Over by Score Limit:', this.scoreLimit);
                this.broadcast(); // Send final state
                this.io.emit('gameOver', {
                    winner: p1.score >= this.scoreLimit ? 1 : 2
                });
                this.resetGame();
            }
        }
    }

    resetGame() {
        console.log('Resetting Game State (Internal)...');
        [1, 2].forEach(id => {
            // Use createPlayer to reset correctly
            this.gameState.players[id] = this.createPlayer(
                id,
                id === 1 ? 100 : 700,
                id === 1 ? 100 : 500,
                id === 1 ? '#e94560' : '#4ecca3'
            );
        });
        this.gameState.food = [];
        this.gameState.powerups = [];
        this.gameState.timer = 120; // Reset timer
        this.gameState.isPaused = false; // Unpause
        this.spawnFood();
        // this.gameOver = false; // Remvoed, implied by state
    }

    handleRestartRequest(socketId) {
        if (!this.players.has(socketId)) return;

        this.restartRequests.add(socketId);

        // Check if all current players have requested restart
        // (Assuming 2 players for now, but safeguards for solo testing)
        const required = this.players.size;

        if (this.restartRequests.size >= required && required > 0) {
            this.performRestart();
        } else {
            // Notify the user they are waiting
            this.io.to(socketId).emit('waitingForRestart');
        }
    }

    performRestart() {
        console.log('Restarting Game (Mutual Agreement)...');
        this.resetGame();
        this.restartRequests.clear();
        this.broadcast();
        this.io.to(this.roomId).emit('gameRestarted', this.gameState);
    }

    spawnPowerup() {
        if (this.gameState.powerups.length >= 2) return; // Limit items
        const x = Math.random() * (this.width - 30);
        const y = Math.random() * (this.height - 30);
        const type = Math.random() > 0.5 ? 'speed' : 'shield';
        this.gameState.powerups.push({ x, y, type, id: Date.now() });
    }

    stun(p) {
        if (p.effects && p.effects.shield > 0) return; // Shield check
        p.isStunned = true;
        p.stunTimer = 2;
    }

    checkBodyHit(attacker, victim) {
        if (attacker.isStunned) return false;
        // Simple history check
        const spacing = 10;
        let distAcc = 0;
        for (let i = 1; i < victim.history.length; i++) {
            distAcc += Math.hypot(victim.history[i].x - victim.history[i - 1].x, victim.history[i].y - victim.history[i - 1].y);
            if (distAcc >= spacing) {
                if (Math.hypot(attacker.x - victim.history[i].x, attacker.y - victim.history[i].y) < attacker.size) {
                    return true;
                }
                distAcc -= spacing;
            }
        }
        return false;
    }

    bounce(p) {
        const bounceDist = 30;
        // Invert velocity roughly? Or just push back.
        // Since we don't track full vector if 0, assume opposite of last move
        // For now just generic push or negative velocity
        p.x -= (p.vx * 0.2); // simple pushback
        p.y -= (p.vy * 0.2);
    }

    // broadcast() is defined earlier, removing this duplicate at end of file
}

