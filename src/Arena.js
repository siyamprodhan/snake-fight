export default class Arena {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.food = [];
        this.spawnTimer = 0;

        // Spawn initial food
        this.spawnFood();
    }

    spawnFood() {
        // Simple random spawn
        const x = Math.random() * (this.width - 20);
        const y = Math.random() * (this.height - 20);
        this.food.push({ x, y, size: 10, color: '#fca311' });
    }

    draw(ctx, powerups = []) {
        // Draw Grid
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1;
        for (let i = 0; i <= this.width; i += 40) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, this.height); ctx.stroke();
        }
        for (let i = 0; i <= this.height; i += 40) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(this.width, i); ctx.stroke();
        }

        // Draw Food
        this.food.forEach(f => {
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.arc(f.x + 5, f.y + 5, f.size, 0, Math.PI * 2);
            ctx.fill();
            // Glow
            ctx.shadowColor = f.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // Draw Powerups
        powerups.forEach(p => {
            ctx.fillStyle = p.type === 'speed' ? '#00ccff' : '#ffcc00';
            ctx.beginPath();
            ctx.arc(p.x + 10, p.y + 10, 10, 0, Math.PI * 2);
            ctx.fill();

            // Icon Text
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.type === 'speed' ? '⚡' : '🛡️', p.x + 10, p.y + 11);
        });
    }

    checkFoodCollision(snake) {
        const head = snake.getHeadRect();

        for (let i = 0; i < this.food.length; i++) {
            const f = this.food[i];
            const foodRect = { x: f.x, y: f.y, width: f.size, height: f.size };

            if (this.rectIntersect(head, foodRect)) {
                this.food.splice(i, 1);
                this.spawnFood(); // Spawn new one immediately
                return true;
            }
        }
        return false;
    }

    rectIntersect(r1, r2) {
        return !(r2.x > r1.x + r1.width ||
            r2.x + r2.width < r1.x ||
            r2.y > r1.y + r1.height ||
            r2.y + r2.height < r1.y);
    }

    reset() {
        this.food = [];
        this.spawnFood();
    }
}
