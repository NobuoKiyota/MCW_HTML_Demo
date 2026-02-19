import { _decorator, Component, Node, game } from 'cc';
import { GameManager } from './GameManager';
import { OptionsUI } from './OptionsUI';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('TitleUI')
export class TitleUI extends Component {

    /**
     * Homeボタンクリック（ホーム画面へ遷移）
     */
    public onHomeClicked() {
        SoundManager.instance.playSE("click");
        if (GameManager.instance) {
            GameManager.instance.goToHome();
        }
    }

    /**
     * Optionボタンクリック（設定メニュー表示）
     */
    public onOptionClicked() {
        SoundManager.instance.playSE("click");
        if (OptionsUI.instance) {
            OptionsUI.instance.toggle();
        } else {
            console.warn("[TitleUI] OptionsUI instance not found.");
        }
    }

    /**
     * Exitボタンクリック（ゲーム終了）
     */
    public onExitClicked() {
        console.log("[TitleUI] Exit Clicked (Disabled for now)");
        // game.end(); // 実行環境によって不具合が出る可能性があるため一旦無効化
    }
}
