/**
 * visualEffects.js
 * JavaScript Canvas-based Visual Effects Module
 * Handles procedural effects like Fire, Thunder, Particles.
 */

// Configuration for ambient particle generation properties
// Modify these values to adjust visuals
const FX_CONFIG = {
    // RAIN
    rainMass: 20.0,
    rainSpeedMin: 15,
    rainSpeedMax: 30,
    rainLengthBase: 10,
    rainLengthVar: 10,

    // STAR
    starMass: 15.0,
    starLife: 0.5,
    starDecay: 0.01,
    starSizeBase: 0.1,
    starSizeVar: 3,

    // SNOW
    snowMass: 10.0,
    snowSpeedY: 1,      // Fall speed base
    snowSpeedYVar: 5,   // Fall speed variance
    snowSway: 2,        // Horizontal sway amount
    snowSizeBase: 2,
    snowSizeVar: 3,

    // LEAVES
    leavesMass: 5.0,
    leavesSpeedY: 2,
    leavesSpeedYVar: 8,
    leavesSize: 5,
    leavesSizeVar: 5
};

class VisualFX {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.isActive = false;
        this.animationFrameId = null;
        this.darkness = 0; // Screen darken intensity

        // Ambient Intensities (0.0 - 1.0)
        this.ambience = {
            rain: 0,
            star: 0,
            snow: 0,
            leaves: 0
        };

        this.init();
    }

    init() {
        // Create full-screen overlay canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'fx-canvas';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none'; // Click-through
        this.canvas.style.zIndex = '900'; // Above background, below controls

        // Append to specific container or body
        const container = document.querySelector('.field-section') || document.body;
        container.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    /**
     * Update ambience intensities from XY pad
     */
    setAmbience(rain, star, snow, leaves) {
        this.ambience.rain = rain;
        this.ambience.star = star;
        this.ambience.snow = snow;
        this.ambience.leaves = leaves;

        if (rain > 0 || star > 0 || snow > 0 || leaves > 0) {
            if (!this.isActive) {
                this.isActive = true;
                this.loop();
            }
        }
    }

    /**
     * Trigger an effect at specific coordinates
     * @param {string} type - 'fire', 'thunder', 'sparkle', 'slash', 'ice', 'shuriken', 'sakura', 'blizzard', 'leaves', 'tornado', 'ripple'
     * @param {number} x - Client X or relative X
     * @param {number} y - Client Y or relative Y
     */
    trigger(type, x, y) {
        // Convert client coordinates to canvas coordinates if needed
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;

        // Darken screen for impact
        this.darkness = 0.6;

        if (type === 'fire') {
            this.createFireExplosion(canvasX, canvasY);
        } else if (type === 'thunder') {
            this.createThunder(canvasX, canvasY);
        } else if (type === 'sparkle') {
            this.createSparkles(canvasX, canvasY);
        } else if (type === 'slash') {
            this.createSlash(canvasX, canvasY);
        } else if (type === 'ice') {
            this.createIce(canvasX, canvasY);
        } else if (type === 'shuriken') {
            this.createShuriken(canvasX, canvasY);
        } else if (type === 'sakura') {
            this.createSakura(canvasX, canvasY);
        } else if (type === 'blizzard') {
            this.createBlizzard(canvasX, canvasY);
        } else if (type === 'leaves') {
            this.createLeaves(canvasX, canvasY);
        } else if (type === 'tornado') {
            this.createTornado(canvasX, canvasY);
        } else if (type === 'ripple') {
            this.createRipple(canvasX, canvasY);
        } else if (['effect1', 'effect2', 'effect3', 'effect4', 'effect5'].includes(type)) {
            this.createSparkles(canvasX, canvasY);
        }

        if (!this.isActive) {
            this.isActive = true;
            this.loop();
        }
    }

    createFireExplosion(x, y) {
        // More particles, longer life
        for (let i = 0; i < 80; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12 - 3,
                life: 1.0,
                decay: 0.005 + Math.random() * 0.01,
                color: `hsl(${10 + Math.random() * 40}, 100%, 60%)`,
                size: 10 + Math.random() * 25,
                type: 'fire'
            });
        }
    }

    createThunder(x, y) {
        this.particles.push({
            x: x,
            y: 0,
            targetX: x,
            targetY: y,
            life: 1.0,
            decay: 0.01, // Slower fade (approx double duration)
            color: '#ffffff',
            type: 'thunder_bolt',
            points: this.generateLightningPoints(x, 0, x, y)
        });
        this.particles.push({ type: 'flash', life: 1.0, decay: 0.02 }); // Slower flash
    }

    generateLightningPoints(x1, y1, x2, y2) {
        const points = [{ x: x1, y: y1 }];
        let currX = x1;
        let currY = y1;
        const segments = 15;
        const dy = (y2 - y1) / segments;
        for (let i = 0; i < segments; i++) {
            currX += (Math.random() - 0.5) * 50;
            currY += dy;
            points.push({ x: currX, y: currY });
        }
        return points;
    }

    createSparkles(x, y) {
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 1.0,
                decay: 0.005 + Math.random() * 0.01,
                color: `hsl(${200 + Math.random() * 60}, 100%, 70%)`,
                size: 3 + Math.random() * 6,
                type: 'sparkle'
            });
        }
    }

    createSlash(x, y) {
        this.particles.push({
            x: x - 50, y: y - 50,
            vx: 0, vy: 0,
            life: 1.0, decay: 0.02,
            rotation: 45 * (Math.PI / 180),
            size: 250, type: 'slash'
        });
        for (let i = 0; i < 30; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 150, y: y + (Math.random() - 0.5) * 150,
                vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
                life: 1.0, decay: 0.02,
                color: '#fff', size: 3, type: 'sparkle'
            });
        }
    }

    createIce(x, y) {
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
                life: 1.0, decay: 0.015,
                color: `rgba(200, 240, 255, 0.9)`,
                size: 15 + Math.random() * 30,
                rotation: Math.random() * Math.PI, vRot: (Math.random() - 0.5) * 0.4,
                type: 'ice_shard'
            });
        }
    }

    createShuriken(x, y) {
        this.particles.push({
            x: 0, y: y,
            vx: 20, vy: 0,
            life: 2.0, decay: 0.005,
            rotation: 0, vRot: 0.8,
            size: 60, type: 'shuriken'
        });
    }

    createSakura(x, y) {
        for (let i = 0; i < 100; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: -50 - Math.random() * 400,
                vx: (Math.random() - 0.5) * 3 + 2,
                vy: 2 + Math.random() * 4,
                life: 1.0, decay: 0.003,
                color: '#ffc0cb', size: 6 + Math.random() * 6,
                sway: Math.random() * 100, swaySpeed: 0.05 + Math.random() * 0.05,
                type: 'sakura'
            });
        }
    }

    createBlizzard(x, y) {
        // Slow down and spread out
        for (let i = 0; i < 200; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width, // Full screen width
                y: Math.random() * this.canvas.height - 100, // Full screen height
                vx: -3 - Math.random() * 4, // Much slower horizontal
                vy: 1 + Math.random() * 2,  // Gentle falling
                life: 1.0, decay: 0.003,    // Longer life
                color: '#ffffff', size: 3 + Math.random() * 4,
                type: 'sparkle'
            });
        }
    }

    createLeaves(x, y) {
        for (let i = 0; i < 80; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: -50 - Math.random() * 400,
                vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 4,
                life: 1.0, decay: 0.003,
                color: `hsl(${20 + Math.random() * 40}, 100%, 50%)`,
                size: 10 + Math.random() * 10,
                rotation: Math.random() * Math.PI, vRot: (Math.random() - 0.5) * 0.3,
                type: 'leaf'
            });
        }
    }

    createTornado(x, y) {
        const center = this.canvas.width / 2;
        for (let i = 0; i < 200; i++) {
            this.particles.push({
                x: center, y: this.canvas.height,
                vx: 0, vy: -3 - Math.random() * 8,
                angle: Math.random() * Math.PI * 2, radius: 10 + Math.random() * 10,
                life: 1.0, decay: 0.008,
                color: '#aaaaaa', size: 4 + Math.random() * 4,
                type: 'tornado_particle',
                initialX: center
            });
        }
    }

    createRipple(x, y) {
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                this.particles.push({
                    x: x, y: y,
                    radius: 0, life: 1.0, decay: 0.01,
                    color: '#a0e0ff', type: 'ripple'
                });
            }, i * 250);
        }
    }

    // --- Ambience Generators ---
    createRainParticle() {
        this.particles.push({
            x: Math.random() * this.canvas.width,
            y: -20,
            vx: -1 + Math.random() * 2,
            vy: FX_CONFIG.rainSpeedMin + Math.random() * (FX_CONFIG.rainSpeedMax - FX_CONFIG.rainSpeedMin),
            life: 1.0,
            decay: 0.02,
            color: 'rgba(174, 194, 224, 0.6)',
            size: 2,
            length: FX_CONFIG.rainLengthBase + Math.random() * FX_CONFIG.rainLengthVar,
            type: 'rain'
        });
    }

    createStarParticle() {
        this.particles.push({
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height, // Anywhere
            vx: 0,
            vy: 0,
            life: FX_CONFIG.starLife,
            decay: FX_CONFIG.starDecay,
            color: '#ffffcc',
            size: FX_CONFIG.starSizeBase + Math.random() * FX_CONFIG.starSizeVar,
            type: 'sparkle' // Re-use sparkle
        });
    }

    createSnowParticle() {
        this.particles.push({
            x: Math.random() * this.canvas.width,
            y: -10,
            vx: (Math.random() - 0.5) * FX_CONFIG.snowSway,
            vy: FX_CONFIG.snowSpeedY + Math.random() * FX_CONFIG.snowSpeedYVar,
            life: 1.0,
            decay: 0.005,
            color: '#ffffff',
            size: FX_CONFIG.snowSizeBase + Math.random() * FX_CONFIG.snowSizeVar,
            type: 'sparkle' // Re-use sparkle for snow
        });
    }

    createLeafParticle() {
        this.particles.push({
            x: Math.random() * this.canvas.width,
            y: -20,
            vx: (Math.random() - 0.5) * 3,
            vy: FX_CONFIG.leavesSpeedY + Math.random() * FX_CONFIG.leavesSpeedYVar,
            life: 1.0,
            decay: 0.005,
            color: `hsl(${20 + Math.random() * 40}, 100%, 50%)`,
            size: FX_CONFIG.leavesSize + Math.random() * FX_CONFIG.leavesSizeVar,
            rotation: Math.random() * Math.PI,
            vRot: (Math.random() - 0.5) * 0.2,
            type: 'leaf'
        });
    }

    _spawnAmbience(type, intensity, massConfig, creatorFn) {
        if (intensity <= 0.01) return;

        // Calculate how many particles to try and spawn this frame
        // Combine intensity (0-1) and mass config (scalar)
        const spawnAmount = intensity * massConfig;

        // Integer part: guaranteed spawns
        const count = Math.floor(spawnAmount);
        for (let i = 0; i < count; i++) {
            creatorFn();
        }

        // Fractional part: probability spawn
        const remainder = spawnAmount - count;
        if (Math.random() < remainder) {
            creatorFn();
        }
    }

    loop() {
        const hasParticles = this.particles.length > 0;
        const hasAmbience = this.ambience.rain > 0.01 || this.ambience.star > 0.01 || this.ambience.snow > 0.01 || this.ambience.leaves > 0.01;

        if (!hasParticles && this.darkness <= 0.01 && this.smoothStarLevel <= 0.01 && !hasAmbience) {
            this.isActive = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw Star Darkness (Night Sky)
        // Calculated based on star intensity. Drawn BEFORE particles so they shine through.
        // Target level based on star intensity
        const targetLevel = this.ambience.star;
        // Linear interpolation for smoothing (approx 0.05 speed)
        this.smoothStarLevel += (targetLevel - this.smoothStarLevel) * 0.05;

        if (this.smoothStarLevel > 0.001) {
            const nightOpacity = this.smoothStarLevel * FX_CONFIG.starDarknessMax;
            this.ctx.fillStyle = `rgba(0, 0, 0, ${nightOpacity})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Ambience Generation (Configurable)
        this._spawnAmbience('rain', this.ambience.rain, FX_CONFIG.rainMass, () => this.createRainParticle());
        this._spawnAmbience('star', this.ambience.star, FX_CONFIG.starMass, () => this.createStarParticle());
        this._spawnAmbience('snow', this.ambience.snow, FX_CONFIG.snowMass, () => this.createSnowParticle());
        this._spawnAmbience('leaves', this.ambience.leaves, FX_CONFIG.leavesMass, () => this.createLeafParticle());

        // Draw darkening overlay
        if (this.darkness > 0.01) {
            this.ctx.fillStyle = `rgba(0, 0, 0, ${this.darkness})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.darkness *= 0.98; // Slow fade back
        }

        this.ctx.globalCompositeOperation = 'lighter';

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            if (p.type === 'rain') {
                p.x += p.vx; p.y += p.vy;
                this.ctx.beginPath();
                this.ctx.moveTo(p.x, p.y);
                this.ctx.lineTo(p.x + p.vx * 2, p.y + p.length); // Streak
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = 1;
                this.ctx.globalAlpha = p.life;
                this.ctx.stroke();
            } else if (p.type === 'tornado_particle') {
                p.y += p.vy;
                p.angle += 0.2;
                const r = p.radius + Math.sin(p.y * 0.02) * 40 + (this.canvas.height - p.y) * 0.2; // Cone shape
                p.x = p.initialX + Math.cos(p.angle) * r;

                this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fillStyle = p.color; this.ctx.globalAlpha = p.life; this.ctx.fill();
            } else if (p.type === 'fire') {
                p.x += p.vx; p.y += p.vy; p.size *= 0.95;
                this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fillStyle = p.color; this.ctx.globalAlpha = p.life; this.ctx.fill();
            } else if (p.type === 'thunder_bolt') {
                this.ctx.beginPath(); this.ctx.moveTo(p.points[0].x, p.points[0].y);
                for (let pt of p.points) this.ctx.lineTo(pt.x, pt.y);
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${p.life})`;
                this.ctx.lineWidth = 3; this.ctx.stroke();
            } else if (p.type === 'flash') {
                this.ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.5})`;
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            } else if (p.type === 'sparkle') {
                p.x += p.vx; p.y += p.vy;
                this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fillStyle = p.color; this.ctx.globalAlpha = p.life; this.ctx.fill();
            } else if (p.type === 'slash') {
                this.ctx.save(); this.ctx.translate(p.x, p.y); this.ctx.rotate(p.rotation);
                this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.quadraticCurveTo(50, -50, 100, 0);
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${p.life})`;
                this.ctx.lineWidth = 8; this.ctx.stroke(); this.ctx.restore();
            } else if (p.type === 'ice_shard') {
                p.x += p.vx; p.y += p.vy; p.rotation += p.vRot;
                this.ctx.save(); this.ctx.translate(p.x, p.y); this.ctx.rotate(p.rotation);
                this.ctx.beginPath(); this.ctx.moveTo(0, -p.size);
                this.ctx.lineTo(p.size * 0.5, p.size); this.ctx.lineTo(-p.size * 0.5, p.size);
                this.ctx.closePath(); this.ctx.fillStyle = p.color; this.ctx.globalAlpha = p.life; this.ctx.fill();
                this.ctx.restore();
            } else if (p.type === 'shuriken') {
                p.x += p.vx; p.rotation += p.vRot;
                this.ctx.save(); this.ctx.translate(p.x, p.y); this.ctx.rotate(p.rotation);
                this.ctx.fillStyle = '#cccccc'; this.ctx.beginPath();
                for (let j = 0; j < 4; j++) {
                    this.ctx.lineTo(Math.cos(j * Math.PI / 2) * p.size, Math.sin(j * Math.PI / 2) * p.size);
                    this.ctx.lineTo(Math.cos(j * Math.PI / 2 + Math.PI / 4) * p.size / 3, Math.sin(j * Math.PI / 2 + Math.PI / 4) * p.size / 3);
                }
                this.ctx.closePath(); this.ctx.fill(); this.ctx.restore();
            } else if (p.type === 'sakura' || p.type === 'leaf') {
                p.x += p.vx + Math.sin(p.y * p.swaySpeed || 0.1) * 2; p.y += p.vy;
                if (p.type === 'leaf') p.rotation = (p.rotation || 0) + (p.vRot || 0);
                this.ctx.save(); this.ctx.translate(p.x, p.y);
                if (p.type === 'leaf') this.ctx.rotate(p.rotation);
                this.ctx.beginPath();
                this.ctx.ellipse(0, 0, p.size, p.size * 0.5, p.type === 'sakura' ? 45 : 0, 0, 2 * Math.PI);
                this.ctx.fillStyle = p.color; this.ctx.globalAlpha = p.life; this.ctx.fill(); this.ctx.restore();
            } else if (p.type === 'ripple') {
                p.radius += 5;
                this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = p.color; this.ctx.lineWidth = 3; this.ctx.globalAlpha = p.life; this.ctx.stroke();
            }
        }

        this.ctx.globalAlpha = 1.0;
        this.ctx.globalCompositeOperation = 'source-over';

        requestAnimationFrame(() => this.loop());
    }
}
window.VisualFX = VisualFX;
