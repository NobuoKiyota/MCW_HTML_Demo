import { _decorator, Component, Node, Label, Vec3, Color, tween, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DamagePopup')
export class DamagePopup extends Component {

    @property(Label)
    public label: Label = null;

    @property
    public lifeTime: number = 1.0;

    @property
    public moveSpeed: number = 50;

    @property
    public startScale: number = 1.0;

    @property
    public endScale: number = 1.5;

    private _timer: number = 0;
    private _uiOpacity: UIOpacity = null;

    onLoad() {
        if (!this.label) {
            this.label = this.getComponent(Label);
            if (!this.label) {
                this.label = this.addComponent(Label);
            }
        }

        this._uiOpacity = this.getComponent(UIOpacity);
        if (!this._uiOpacity) {
            this._uiOpacity = this.addComponent(UIOpacity);
        }
    }

    public init(amount: number, color: Color) {
        if (this.label) {
            this.label.string = Math.floor(amount).toString();
            this.label.color = color;
        }

        this.node.setScale(new Vec3(this.startScale, this.startScale, 1));
        this._uiOpacity.opacity = 255;
        this._timer = 0;
    }

    update(dt: number) {
        this._timer += dt;

        if (this._timer >= this.lifeTime) {
            this.node.destroy();
            return;
        }

        // 1. Move Up
        const pos = this.node.position;
        this.node.setPosition(pos.x, pos.y + (this.moveSpeed * dt), pos.z);

        // 2. Scale (Lerp)
        const progress = this._timer / this.lifeTime;
        const currentScale = this.startScale + (this.endScale - this.startScale) * progress;
        this.node.setScale(new Vec3(currentScale, currentScale, 1));

        // 3. Fade Out (Last 30%)
        if (progress > 0.7) {
            const fadeProgress = (progress - 0.7) / 0.3; // 0 to 1
            this._uiOpacity.opacity = 255 * (1 - fadeProgress);
        }
    }
}
