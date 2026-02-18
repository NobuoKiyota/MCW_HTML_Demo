import { _decorator, Component, Node, Graphics, Color, math, v3, UITransform } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('BuffVisualEffect')
export class BuffVisualEffect extends Component {

    @property(Color)
    public starColor: Color = new Color(255, 255, 255, 255);

    @property
    public orbitRadius: number = 60;

    @property
    public orbitSpeed: number = 180; // Degrees per second

    @property
    public starCount: number = 3;

    @property
    public starScale: number = 1.0;

    private stars: Node[] = [];
    private angles: number[] = [];

    onLoad() {
        // Apply Additive Blending for Glow Effect
        const g = this.node.getComponent(Graphics);
        if (g) {
            const gAny = g as any;
            // SRC_ALPHA = 2, ONE = 1 in Cocos Creator
            if (gAny.srcBlendFactor !== undefined) {
                gAny.srcBlendFactor = 2; // SRC_ALPHA
                gAny.dstBlendFactor = 1; // ONE
            }
        }
        this.createStars();
    }

    private createStars() {
        for (let i = 0; i < this.starCount; i++) {
            const starNode = new Node(`Star_${i}`);
            const g = starNode.addComponent(Graphics);

            // Draw Star
            this.drawStar(g, 0, 0, 5, 12 * this.starScale, 6 * this.starScale);

            this.node.addChild(starNode);
            this.stars.push(starNode);

            // Distribute angles evenly
            this.angles.push((360 / this.starCount) * i);
        }
    }

    private drawStar(g: Graphics, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
        // --- 1. Draw Glow (Blurred background) ---
        const glowLayers = 4;
        const glowColor = new Color(this.starColor.r, this.starColor.g, this.starColor.b, 20);

        for (let l = 1; l <= glowLayers; l++) {
            const rOffset = l * 4;
            this.renderStarPath(g, cx, cy, spikes, outerRadius + rOffset, innerRadius + rOffset, glowColor);
        }

        // --- 2. Draw Main Star Body ---
        this.renderStarPath(g, cx, cy, spikes, outerRadius, innerRadius, this.starColor);

        // --- 3. Draw Core (Brighter center) ---
        const coreColor = new Color(255, 255, 255, 200);
        this.renderStarPath(g, cx, cy, spikes, outerRadius * 0.4, innerRadius * 0.4, coreColor);
    }

    private renderStarPath(g: Graphics, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: Color) {
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        let step = Math.PI / spikes;

        g.fillColor = color;
        g.moveTo(cx, cy - outerRadius);

        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            g.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            g.lineTo(x, y);
            rot += step;
        }
        g.lineTo(cx, cy - outerRadius);
        g.close();
        g.fill();
    }

    update(dt: number) {
        for (let i = 0; i < this.stars.length; i++) {
            // Update Orbit Angle
            this.angles[i] += this.orbitSpeed * dt;
            const rad = this.angles[i] * (Math.PI / 180);

            // Set Position
            const x = Math.cos(rad) * this.orbitRadius;
            const y = Math.sin(rad) * this.orbitRadius;
            this.stars[i].setPosition(x, y, 0);

            // Self Rotation
            const currentRot = this.stars[i].angle;
            this.stars[i].angle = currentRot + 200 * dt;

            // Pulsing Scale
            const pulse = 1.0 + Math.sin(Date.now() / 200) * 0.2;
            this.stars[i].setScale(pulse, pulse, 1);
        }
    }
}
