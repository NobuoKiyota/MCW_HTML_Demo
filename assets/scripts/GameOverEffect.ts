import { _decorator, Component, Label, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameOverEffect')
export class GameOverEffect extends Component {

    @property(Label)
    public label: Label = null;

    @property
    public duration: number = 2.0;

    @property
    public targetHeight: number = 80.0;

    onEnable() {
        if (!this.label) {
            this.label = this.getComponent(Label);
        }

        if (this.label) {
            this.label.lineHeight = 0.1;

            tween(this.label)
                .to(this.duration, { lineHeight: this.targetHeight }, { easing: 'cubicOut' })
                .start();
        }
    }
}
