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

const SNOW_SPRITESource = [
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACt0lEQVRYhe2X25KjMBBDFcNM/v9zJwGzD4sqQnQbk/AYV7lsrj6obwb4tm/7tma7cbIsS3g+mN/svD64JKPPj8Fu/18/RteC+S3o3hRqwR7udhYyAszgisEV7CGrwVUD57tOQUYKOnCRUbsrSagKYBZovX4aUgEjX1PFhvV+zl1Fgs3r+UsgexUcBHCUY0Iq3Axgko+bEsiulgWJ+9oA4Mc61eSiBJvsHUggoyzQBeigVGpcwe4AfgWQ5qoAnmsvAB4GQMhTEd1rYpr1Z4W7r/NBFpvlvigNEa5gq2YTNgN0E6mC7HeDof9p8FBZTTszOs3bAlRQTTMMFJrY/VD9r1ofBJSq+Xga0B/SfEhYqlixD5oqoyrZ7YcZYKuGeuoZsFWaEBO2aWcQ4O5S2FJQX+JlTK8pGO+lGxBsFFiCFrySuX78BrJg3xxC/YiLEBgyetUpeOXLEdvE7rU9ivodoMvrcJP0J7aVQ32MjabXqqMu0QRjO/JBQtKPmIgf67OaLrLU4ZsNzhnNbtbNsQPqQhC4IoAPbJXge4o9V2XuG11XMM2LR0HCkaZ8AvjD1oeo8mDHjGJPLRHcqUoSqchdSVkBvVKwzBX7IEJqFgD2yqWtN1ET4hm8WOtwkfsZUB71EVzqh60gcZW4CS0rKK+7gmpmqqhRnv2zhO3IB93UwF49TUMaOFnuvPSfxEsQzen3cBulqUc/QIPF1fwI0CFrcI3nR7xKmJc+3Ty0TP0WYATs23cF9TTif3s9CqaJugXlkaaQGgj+S6rw6ovVrr+1H8xgHVIXiX7qo43H5Sb2qFYfc4ioSlS7R+HSlPOOggqri+v2PaoQ0X7y8iDRahD5ZQaoSkVzIAF9V0EHWmyeKRiNzfaJiYGtgp7QW7+W0eb4UkB9cQQSbaEOc17UPgXUBaII7302bf8AK4CD/00svIQAAAAASUVORK5CYII=',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAADNUlEQVRYhe2YyZbaMBBFnzHdkP//2DSDcRbRa12VS0aQRTZd5+jIg4ZLTSoj/ciP/F+ZJGld16Fx6CmHnfGUFf3aeb6R4xtgfEa4QzImg4ltCv0wYIRzfwDclFxz/iMBe5TG+y5kDzBu5Pu5XM8Fyr3BDfrAfEK5LYBU6BvIDDCDM5TbocwlqIWmNqiB7qoaMyjHbSCfmdjNMLOkT1x/qNWkNUj/WtDukm5l3C1AvRQk9C3DHAF3LvcfajXJHyW1mjMcg4vBJLU+O0laI+CkrVkN8ol2Ku2I9zPW8CaGWwrcpcB94f2s6o/DQSK1/vVR2knSr9KfC+xR1Sfpv6uqWe8YR3iDHVS11w0SLm5/sgaPqlo7A/Kkqj3Pobnse1dVF1jCuwlzN5ocMbEDw9pzO6ua2eMojtibWr+0ye+Y9whjvvNiL80wQGxe+p61GIPEspbnd2xqf/QcWok/oknwe4C9KDakA4YRbLF/WTuGZSrivOw8l1RNnJ259CtrkanFmrM2GL0HVV8jREwv8fyOJu6eJFO4pjl4mrBRVrWWyPYYkdQH4wIxAfdaBGQ0szCI1QzneO/dsziTdLJas1oe6OMxx/sIrNA3J4kfRKBYIi2hNwzP4AjGM9hJO1Y0PciNBjPTcMOoBZ8QXDQeb9fSuxk2/sjhYoGqJwwXdwQ7Z7EOfGDctbQLrr2O1yUky64NYDyss0rkS21aWdUmaWubgJ53Aai1mUHuFguGtFa82VU19/0GXFYEWNtu1uBFtaKhFjM/7AISNNMGE/KivyfKjGc9DV7wjI3aS9NPpkFrL0JeEpCb9k2cQfFdBNzIMw26PLon7xa1/kizs8xigMVskKWbhmMP0P4UkzH9jFWJ1OZLQtzCdfb5mX7A99KMA2VWzfoRPCsUmJ4M0/vcZDrj3s1176+P+O8BSy9W2nzPBN9r2T8Lmea+r3uAPUhWNtlXnBendiKcwnWEa+5HigUGDL95/Yw/JjvD94AyzQx/1bGA2FQZ2mouLv7UfHtgI4A9yGzBZ2N6UM/e7frgZtzAs9GNn25oeadgfXmTN8dLGgeMm4x+U3DOW/IqYNw0873N/yv/In8AJT3tg+KFGroAAAAASUVORK5CYII=',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAADEElEQVRYhe2Y27KiMBBFF94vM/P/HzrqQUHngd5mE0EEfZkquyoVCkNY6bvAV77ylf9bivzG7XZ763lg1AYPGxbtLRdT9yHB6Vpg15jfApVMASyAWcxzu74F3BWoY+3bkGMBBTcHljHmBlgBl1j7EcgpgILbAhtgFfeuwBn4iXEmafRmoKOAxwDK1xYB9wv4DaxptFoDZcCvgGNA1gZYM9JHx2pQ5l0D+wDcxn0BHIC/AVrSmPwacxVrqlchXwWU9mTeVYDtgV3sU8TLNzTaPZK0WGbz2cCfQg4BejpZkAJjGWDbmFckM+9JvniKUdr1KcALkgtMAnStzWjM6ppTBHs0SzYxtgF6jOfXsVYucbV5FGBuUm0ujSl69bJFDOXE2u7pgHNbAylg8ih/GXAWAPKpHY3mHHJpEBoFbdfwA3tSz32x0x+fmVgn3gXgn7jekcwtk+XaERS0K4yuz3FA+aenn0FA18AiIAS5p+1L0qDgZtle0uoyIFY2r2lrvVO6AKVm+aAHgvxxxaOPyXyQgqDI7uW+6H7rDcdd8hM7pEeZr/d67IDPWi/3wRzIu6IH6QOE1JVcSLW1oh1x7vh5YGBrfPaDd2rNpS9ItIkAVbLOJLPM6U8PXfc9WDxg3gKsAq6k0aI6F/fNRQbk2u0DV90e7HCepRltoh7vRCpp3hN2RaFrxzvtmnZ3kwfSg8mHarEgZd4fUnDkJU7BoufyDru2vZSch/x3MqBH8NzWetAJqCJZQXuUpICjD+4VwDxQPOd5eqlI/qmXOZw6mwNN4+CAvdobAtTpPNXkm+kAGxrtSKPSfE3S2iHGiZSyJjcLLuqGJe5HakC9cdABKtoa1NCz0rD/CxwN6BF4If1zq0jdSEm7aShIKepq6+vsWn8BvLMe1c04pDoNP7k0qNrsUezRq+Bxc+p5QfaaeOynD6+5qihuWu+UdTh/zlOP/4m6V5T808eUbzOet/Li7/XWGwF4rMUOdn/pJ77N+Am80exqCjT7b6P+yE/9eNSloWcv6mseBmUqYN+LP/457ivvyj+oIlupz86ZbQAAAABJRU5ErkJggg==',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABpElEQVRYhe2W7W6DMAxFDx+lXff+b7qtlIWyH/FVPLYVKDBpU65kpSkhOdixE8jKysrKyvrXKh55aRiGqfkKMz9wGPU/v1h8j1Ivx7sLVpoV1nqwm9ld0D0A5a3K7GDzCnQA3oFgrQfdHVBwtYEdgZO1tT3rgQ5ogatZbzYJuQbQwzXA2eDOBtgQvdgb1Csp7C3Ri0xBPgoouNLmOAFPZmczD6jf473YT0Gu9WBlizfEEAvwmehFhbgi7sETMdzBTKDjjN8MsHSQCqs82diYYJBKnoYY8oq0D3fxIKQQqz06O9iYgZTR/sMKZtThcmrAAlB5szarHMCNheVlC0BfgIeReSDVP9VChXwW7JoQKwsFEIgJ0JH2VwAupBoo0G4u5FrAmy2oAtzanMFBXog10IP6DIYdkkSloXeAb6RadyXVwA54sedvDnD3k0ST66QoXf8wAhSYwjz70rDFZaEnerO1BYMB+otCa6CL4LYA9KHWotp/ApQXfVL86nVLoEqYnq93Qf8Bi+rgFoD+LFXtK0bP1S6Cg209eK//039ZWVlZWX9dH7LguI6yCNZ8AAAAAElFTkSuQmCC',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACIElEQVRYhe2X7U7DMAxFT+nYGO//qgjWT37Ml9yGdstKkUCqJStbm6an146TwG677fa/rVq6MY5jaf8KmO1843p6uFpEAOBwb4AMRK17DjLMPHsXdMlKAB3sybyO1iEG89Ha1aClClYBVAPP4YdwQY5AN+MD0Mf9W+mwClBhrKPvEThFKxfkCLThF6CJtotrPfPh/xGgIKXcKfzF/Bj3CZgL8A58xDPvMUYTffKwrwaUeso5KXgMsFfgHMAC7OO/UqC2cQQmuCLI0hwUYE0K8zkgBVhxVfCZ77O8j3sK8yYKyvxlrqRC7QrqI6SUJkjPNcR1/C62EsDRXKAHpjNZgF56BtIEuTAN9yaAnit5qZDleeqlRHCtfYTXzR8DyjxMLSmX9NsVFIBmfEsKbf5hm02S0YBU2z645uGFpF5lreqm4N03C7HgVCJaUm3Ty/1lA6loD0zTweHVFqlYqiCkmfhmL+nNzwGvMDfhXYwhVeu4VmSldVATpeOqooBb84ZpydGq0pAmmKfD3E5oNaAG0otyQOXmC0nFzq639txDpeYRQEEqHzW7HfI1AFWsVQO1q/Gl7lcAHTLf/wlSKkJa4nzrtflStwQJUzV95fDJIqU761us5FpAh/SlUCD5yuGAUtLHWLRHD023xlg6Eji8djNfYb53aNoCMB/Hi/FkSGbCu+Wp7pblByMvKXN9im0rwNzmYFYfPXfbbbfddvvD9gl6XuAhzsNFLQAAAABJRU5ErkJggg=='
];

const SNOW_SPRITES = SNOW_SPRITESource.map(src => {
    const img = new Image();
    img.src = src;
    return img;
});

// Mapping sprites to match the reference quality [color, spriteIndex, sizeMin, sizeExtra]
// Reference: 
// 0: sprite2 (ref source 1), size 10-10
// 1: sprite3 (ref source 2), size 10-15
// 2: sprite1 (ref source 0), size 10-15
// 3: sprite5 (ref source 4), size 5-10
// 4: sprite4 (ref source 3), size 5-10
const SNOW_TYPES = [
    { spriteIndex: 1, sizeMin: 10, sizeVar: 0 },
    { spriteIndex: 2, sizeMin: 10, sizeVar: 5 },
    { spriteIndex: 0, sizeMin: 10, sizeVar: 5 },
    { spriteIndex: 4, sizeMin: 5, sizeVar: 5 },
    { spriteIndex: 3, sizeMin: 5, sizeVar: 5 }
];

class VisualFX {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.isActive = false;
        this.animationFrameId = null;
        this.animationFrameId = null;
        this.darkness = 0; // Screen darken intensity
        this.snowAngle = 0; // For snow sinusoidal movement
        this.starField = []; // High Quality Star Field Particles
        this.starTime = 0; // Time accumulator for stars

        // Ambient Intensities (0.0 - 1.0)
        this.ambience = {
            rain: 0,
            star: 0,
            snow: 0,
            leaves: 0
        };

        this.init();
        this.initStarField(); // Pre-calculate stars
    }

    initStarField() {
        // Reproducing the "Several layers of stars" from the GLSL sample
        // Layers: z=5, 10, 20, 30, 40 (roughly)
        // We will just creating a distribution of Z values
        this.starField = [];
        const count = 300;
        for (let i = 0; i < count; i++) {
            this.starField.push({
                x: Math.random() * 2000, // Wide range for scrolling
                y: Math.random() * 1000,
                z: 5 + Math.random() * 35, // Depth (determines speed and size)
                phase: Math.random() * Math.PI * 2, // Twinkle phase
                baseAlpha: 0.3 + Math.random() * 0.7,
                color: Math.random() < 0.1 ? '#ffffaa' : '#ffffff' // Slight yellow tint from sample
            });
        }
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
        const typeConfig = SNOW_TYPES[Math.floor(Math.random() * SNOW_TYPES.length)];
        const img = SNOW_SPRITES[typeConfig.spriteIndex];

        this.particles.push({
            x: Math.random() * this.canvas.width,
            y: -20,
            vx: 0, // Will be driven by snowAngle in loop
            vy: FX_CONFIG.snowSpeedY + Math.random() * FX_CONFIG.snowSpeedYVar,
            life: 1.0,
            decay: 0.005,
            color: '#ffffff',
            size: typeConfig.sizeMin + Math.random() * typeConfig.sizeVar,
            type: 'snow',
            sprite: img,
            rotation: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.1
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

        // Update Snow Angle
        this.snowAngle += 0.003;
        this.starTime += 0.01;

        // Draw Star Background (if active)
        if (this.ambience.star > 0.01) {
            this.updateAndDrawStarField();
        }

        // Ambience Generation (Configurable)
        this._spawnAmbience('rain', this.ambience.rain, FX_CONFIG.rainMass, () => this.createRainParticle());
        // this._spawnAmbience('star', this.ambience.star, FX_CONFIG.starMass, () => this.createStarParticle()); // Disabled: using Background Field now

        // Variable snow amount (Sine wave modulation for natural gusts)
        // Reference: "Quantity expression is not constant... but variable"
        const snowVar = 0.5 + 0.5 * Math.sin(this.snowAngle * 0.5); // 0 to 1 slow wave
        const dynamicSnowMass = FX_CONFIG.snowMass * (0.5 + snowVar * 2.5); // Fluctuates between 0.5x and 3x

        this._spawnAmbience('snow', this.ambience.snow, dynamicSnowMass, () => this.createSnowParticle());
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
                this.ctx.globalAlpha = p.life;
                this.ctx.stroke();
            } else if (p.type === 'snow') {
                // Sinusoidal movement
                p.vx = Math.sin(this.snowAngle) * Math.cos(this.snowAngle) * 5;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.vRot;

                if (p.sprite && p.sprite.complete) {
                    this.ctx.save();
                    this.ctx.translate(p.x, p.y);
                    this.ctx.rotate(p.rotation);
                    this.ctx.globalAlpha = p.life;
                    // Draw centered
                    this.ctx.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size);
                    this.ctx.restore();
                } else {
                    // Fallback
                    this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                    this.ctx.fillStyle = p.color; this.ctx.globalAlpha = p.life; this.ctx.fill();
                }
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

    updateAndDrawStarField() {
        // Reproducing the shader effect:
        // uv.x += _t / scale; -> x += speed / z
        // k = smoothstep(..., sin(f.x+f.y)*0.003) -> Twinkle

        const intensity = this.ambience.star; // 0.0 - 1.0 (Master fade)

        // We use 'lighter' composite for glowing effect
        this.ctx.globalCompositeOperation = 'lighter';

        for (let star of this.starField) {
            // Movement (Parallax)
            // Speed inversely proportional to Z
            const speed = 20 / star.z;
            star.x += speed;

            // Wrap around
            if (star.x > this.canvas.width) star.x = 0;

            // Draw
            // Size inversely proportional to Z
            // Sample uses 0.9, 0.8, 0.99 color or 1,1,0. We defined per-star.

            // Twinkle: sin(time + phase)
            const twinkle = Math.sin(this.starTime * 3 + star.phase);
            const alpha = star.baseAlpha * (0.5 + 0.5 * twinkle) * intensity;

            if (alpha <= 0.01) continue;

            const size = Math.max(0.5, 40 / star.z); // Perspective size

            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = star.color;
            this.ctx.globalAlpha = alpha;
            this.ctx.fill();
        }

        this.ctx.globalCompositeOperation = 'source-over';
    }
}
window.VisualFX = VisualFX;
