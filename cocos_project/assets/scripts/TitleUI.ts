import { _decorator, Component, Node, game, director } from 'cc';
import { GameManager } from './GameManager';
import { OptionsUI } from './OptionsUI';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('TitleUI')
export class TitleUI extends Component {

    /**
     * Homeボタンクリック（ホーム画面へ遷移）
     */
    start() {
        // Hide SideBar if present in Title Scene
        const sideBar = this.node.scene.getComponentInChildren("SideBarUI");
        if (sideBar) {
            sideBar.node.active = false;
        }

        // Apply Layout to Buttons
        // Assuming structure: Canvas -> TitleUI -> Buttons or similar
        // We look for buttons by likely names under this node or its children
        this.applyButtonLayout("BtnHome", 0, 160);
        this.applyButtonLayout("BtnOption", 0, 80);
        this.applyButtonLayout("BtnExit", 0, 0);
    }

    private applyButtonLayout(name: string, y: number, x: number = 0) {
        // Try to find the node. If the script is on "TitleUI" node, buttons might be children.
        // Or if TitleUI is manager, buttons might be anywhere. 
        // Let's assume buttons are children of this node or we find them globally if needed.
        // Based on "TitleUI" class, likely it is attached to a wrapper node.

        let btnNode = this.node.getChildByName(name);
        if (!btnNode) {
            // Try searching recursively or standard names if "Btn" prefix is guess
            // Fallback to "Home", "Option", "Exit"
            const simpleName = name.replace("Btn", "");
            btnNode = this.node.getChildByName(simpleName);
        }

        if (btnNode) {
            btnNode.setPosition(x, y);
            const uiTrans = btnNode.getComponent("UITransform") as any;
            if (uiTrans) {
                uiTrans.setContentSize(300, 60);
            }
        } else {
            // console.warn(`[TitleUI] Button '${name}' not found.`);
        }
    }

    /**
     * Homeボタンクリック（ホーム画面へ遷移）
     */
    public onHomeClicked() {
        SoundManager.instance.playSE("click");
        if (GameManager.instance) {
            GameManager.instance.goToHome();
        } else {
            console.error("[TitleUI] GameManager not ready.");
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
            console.warn("[TitleUI] OptionsUI instance not found. attempting to find...");
            const opt = director.getScene().getComponentInChildren(OptionsUI);
            if (opt) {
                opt.toggle();
            } else {
                console.error("[TitleUI] OptionsUI truly not found.");
            }
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
