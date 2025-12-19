export default class Snake {
    constructor(id, x, y, color, controls) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color;
        this.controls = controls;
        this.size = 20;
        this.score = 0;
        this.speed = 200; // pixels per second
        this.velocity = { x: 0, y: 0 }; // Start static until key press
        this.direction = null; // 'up', 'down', 'left', 'right'
        this.tail = []; // Array of {x, y} for body
        this.history = []; // History for smooth movement drawing
        this.maxTail = 0; // Growth counter
        this.effects = { speed: 0, shield: 0 }; // Synced from server
    }

    handleInput(code) {
        const { up, down, left, right } = this.controls;

        // Prevent 180 degree turns
        if (code === up && this.direction !== 'down') {
            this.velocity = { x: 0, y: -this.speed };
            this.direction = 'up';
        }
        if (code === down && this.direction !== 'up') {
            this.velocity = { x: 0, y: this.speed };
            this.direction = 'down';
        }
        if (code === left && this.direction !== 'right') {
            this.velocity = { x: -this.speed, y: 0 };
            this.direction = 'left';
        }
        if (code === right && this.direction !== 'left') {
            this.velocity = { x: this.speed, y: 0 };
            this.direction = 'right';
        }
    }

    update(deltaTime, arena) {
        if (this.isStunned) {
            this.stunTimer -= deltaTime;
            if (this.stunTimer <= 0) {
                this.isStunned = false;
                this.color = this.originalColor;
                // Temporary invulnerability to prevent instant re-stun if still touching?
                // For now, let's assume the bounce separation handles it.
            }
            return; // Don't move if stunned
        }

        // Move head
        this.x += this.velocity.x * deltaTime;
        this.y += this.velocity.y * deltaTime;

        // Wall Wrap-around
        if (this.x < 0) this.x = arena.width - this.size;
        else if (this.x > arena.width - this.size) this.x = 0;

        if (this.y < 0) this.y = arena.height - this.size;
        else if (this.y > arena.height - this.size) this.y = 0;

        // History / Tail Logic
        if (!this.history) this.history = [];
        const lastPos = this.history[0];
        if (!lastPos || Math.hypot(this.x - lastPos.x, this.y - lastPos.y) > 5) {
            this.history.unshift({ x: this.x, y: this.y });
        }

        // Trim history
        const maxHistory = (5 + this.score / 2) * 4;
        if (this.history.length > maxHistory) {
            this.history.pop();
        }
    }

    draw(ctx) {
        let drawX = this.x;
        let drawY = this.y;
        let drawColor = this.color;

        // Shock / Stun Effect
        if (this.isStunned) {
            // Jitter effect
            drawX += (Math.random() - 0.5) * 10;
            drawY += (Math.random() - 0.5) * 10;

            // Flash color
            if (Math.floor(Date.now() / 100) % 2 === 0) {
                drawColor = '#fff'; // Flash white
            } else {
                drawColor = '#ff0000'; // Flash red
            }
        }

        // Power-up Visuals
        ctx.shadowBlur = 0;
        if (this.effects.shield > 0) {
            ctx.shadowColor = '#ffd700'; // Gold glow
            ctx.shadowBlur = 20;
            drawColor = '#ffee00'; // Brighter body
        } else if (this.effects.speed > 0) {
            ctx.shadowColor = '#00ccff'; // Blue glow
            ctx.shadowBlur = 20;
            // drawColor = '#00ccff'; // Optional: change body color
        }

        ctx.fillStyle = drawColor;

        // Draw Head
        ctx.beginPath();
        ctx.arc(drawX + this.size / 2, drawY + this.size / 2, this.size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw Body from history
        let distanceAccumulator = 0;
        const spacing = 10;

        for (let i = 1; i < this.history.length; i++) {
            const p1 = this.history[i - 1];
            const p2 = this.history[i];
            distanceAccumulator += Math.hypot(p1.x - p2.x, p1.y - p2.y);

            if (distanceAccumulator >= spacing) {
                // Jitter body too if stunned? Maybe just head for "Shock" center.
                // Let's jitter everything slightly for full effect
                let bx = p2.x;
                let by = p2.y;
                if (this.isStunned) {
                    bx += (Math.random() - 0.5) * 5;
                    by += (Math.random() - 0.5) * 5;
                }

                ctx.beginPath();
                ctx.arc(bx + this.size / 2, by + this.size / 2, (this.size - 2) / 2, 0, Math.PI * 2);
                ctx.fill();
                distanceAccumulator -= spacing;
            }
        }
    }

    grow() {
        this.score += 10;
    }

    stun(duration = 2) {
        this.isStunned = true;
        this.stunTimer = duration;
        this.originalColor = this.color;
    }

    // Bounce back opposite to current velocity to separate from collision
    bounce() {
        const bounceDist = 30;
        // Normalize velocity
        const speed = Math.hypot(this.velocity.x, this.velocity.y) || 1;
        const dx = (this.velocity.x / speed) * bounceDist;
        const dy = (this.velocity.y / speed) * bounceDist;

        this.x -= dx;
        this.y -= dy;

        // Reset velocity so they don't immediately move back in after stun?
        // Actually keep velocity implies they continue moving after stun?
        // User: "abar shekhan thekeu khela shuru hobe" -> resume from there.
        // So we keep velocity, but bounce prevents immediate re-collision.
    }

    // Kept for game reset
    reset(x, y) {
        this.x = x;
        this.y = y;
        this.score = 0;
        this.history = [];
        this.velocity = { x: 0, y: 0 };
        this.direction = null;
        this.isStunned = false;
        this.originalColor = this.color;
    }

    getHeadRect() {
        return { x: this.x, y: this.y, width: this.size, height: this.size };
    }

    // Check if point collides with this snake's body
    checkBodyCollision(point) {
        // Use history points for collision
        // Simple circle distance check against 'bones' of the spine
        const spacing = 10;
        let distanceAccumulator = 0;

        for (let i = 1; i < this.history.length; i++) {
            // We only check segments that are "drawn" (every spacing units)
            // This matches visual collision usually
            const p1 = this.history[i - 1];
            const p2 = this.history[i];
            distanceAccumulator += Math.hypot(p1.x - p2.x, p1.y - p2.y);

            if (distanceAccumulator >= spacing) {
                const dx = point.x - p2.x;
                const dy = point.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.size) { // Radius + Radius approx
                    return true;
                }
                distanceAccumulator -= spacing;
            }
        }
        return false;
    }
}
