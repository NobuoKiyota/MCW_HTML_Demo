import { _decorator, Component } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('GlowPulse')
export class GlowPulse extends Component {
    @property
    baseScale = 1.0;

    @property
    pulseAmount = 0.1;

    @property
    pulseSpeed = 8.0;

    private time = 0;

    update(deltaTime: number) {
        this.time += deltaTime;

        const value =
            this.baseScale +
            Math.sin(this.time * this.pulseSpeed) * this.pulseAmount;

        this.node.setScale(value, value, value);
    }
}