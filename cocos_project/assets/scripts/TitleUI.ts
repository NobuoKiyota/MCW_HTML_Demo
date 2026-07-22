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
        // SideBar visibility is now managed by UIManager.resolveReferences
        // and GameManager.switchContent based on State.

        // Apply Layout to Buttons
        // Assuming structure: Canvas -> TitleUI -> Buttons or similar
        // We look for buttons by likely names under this node or its children
        this.applyButtonLayout("BtnHome", 0, 160);
        this.applyButtonLayout("BtnOption", 0, 80);
        this.applyButtonLayout("BtnExit", 0, 0);

        // Register button click events
        this.registerButtonEvents();
    }

    private registerButtonEvents() {
        console.log("[TitleUI] Registering button click events...");
        
        // Find button nodes (try multiple naming conventions)
        const buttonNames = [
            { name: "Button-Home", handler: this.onHomeClicked },
            { name: "BtnHome", handler: this.onHomeClicked },
            { name: "Button-Option", handler: this.onOptionClicked },
            { name: "BtnOption", handler: this.onOptionClicked },
            { name: "Button-Exit", handler: this.onExitClicked },
            { name: "BtnExit", handler: this.onExitClicked }
        ];

        // Helper to attach multiple event types to a node
        const attachClick = (node: Node, handlerFn: Function, name?: string) => {
            const bound = handlerFn.bind(this);
            try {
                node.on(Node.EventType.TOUCH_END, bound);
                node.on(Node.EventType.MOUSE_UP, bound);
                // keep MOUSE_DOWN as well for Editor preview compatibility
                node.on(Node.EventType.MOUSE_DOWN, bound);
                console.log(`[TitleUI] Attached touch/mouse handlers to ${name || node.name}`);
            } catch (e) {
                console.warn(`[TitleUI] Failed attaching handlers to ${name || node.name}:`, e);
            }
        };

        // Search in Buttons node children first
        const buttonsNode = this.node.getChildByName("Buttons");
        if (buttonsNode) {
            console.log("[TitleUI] Found Buttons container node");
            buttonNames.forEach(btn => {
                const btnNode = buttonsNode.getChildByName(btn.name);
                if (btnNode) {
                    // If there's a Button component, prefer attaching to its node as well
                    const btnComp = (btnNode.getComponent as any) ? btnNode.getComponent('Button') : null;
                    if (btnComp) {
                        console.log(`[TitleUI] Found Button component on ${btn.name}`);
                    }
                    attachClick(btnNode, btn.handler, btn.name);
                } else {
                    console.log(`[TitleUI] Button ${btn.name} not found in Buttons node`);
                }
            });
        } else {
            console.log("[TitleUI] Buttons node not found, searching root children recursively");
            // Fallback: search recursively and attach handlers when name matches
            const searchRecursive = (node: Node) => {
                for (const child of node.children) {
                    buttonNames.forEach(btn => {
                        if (child.name === btn.name) {
                            attachClick(child, btn.handler, btn.name);
                        }
                    });
                    // if the child has a Button component, also attach to it
                    try {
                        const maybeButton = (child.getComponent as any) ? child.getComponent('Button') : null;
                        if (maybeButton) {
                            console.log(`[TitleUI] Found Button component on node ${child.name} - attaching handlers`);
                            // find which logical button it likely is
                            const match = buttonNames.find(b => child.name.includes(b.name) || b.name.includes(child.name));
                            if (match) attachClick(child, match.handler, child.name);
                            else attachClick(child, this.onHomeClicked, child.name);
                        }
                    } catch (e) {
                        // ignore
                    }
                    // recurse
                    if (child.children && child.children.length > 0) {
                        searchRecursive(child);
                    }
                }
            };
            searchRecursive(this.node);
        }
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
