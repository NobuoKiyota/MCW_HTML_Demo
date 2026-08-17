import { Node, Label, RichText, Color, Prefab, resources, instantiate, UITransform, director, Layers } from 'cc';
import { instantiatePrefabButton } from './UIButtonPrefab';

/**
 * assets/resources/Prefabs/Canvas/DialogWindow.prefab(背景暗転+BlockInputEvents+Windowの
 * 3層構造、詳細はDialogWindow.prefab作成時のドキュメント参照)を読み込んで確認ダイアログを組む
 * 共通ヘルパー。UpgradeUI/HomeUI/MissionUI等がこれまでGraphics+RichTextで毎回スクリプト直描き
 * していたダイアログ背景を、エディタ側で見た目調整できるPrefabに置き換えるためのもの
 * (UIButtonPrefab.tsのボタン版と同じ役割分担)。
 *
 * DialogWindow.prefab未作成/ロード失敗時はコンソール警告のみでダイアログを開かない
 * (CLAUDE.mdの「Prefab欠如に対して防御的に」の方針、ここでは即席フォールバック生成はしない
 * ボタン単体と違い背景+レイアウトが無いと成立しないダイアログ全体を代替するのは非現実的なため)。
 */

export interface DialogButtonSpec {
    prefabPath: string; // 例: "Prefabs/Canvas/Button-Yes"
    x: number;
    y: number;
    label: string;
    color: Color;
    onClick: () => void;
    scale?: number;
    interactable?: boolean; // falseならグレーアウトして押せなくする(MaxLv到達時のLvUpボタン等)
}

const DIALOG_PREFAB_PATH = "Prefabs/Canvas/DialogWindow";

/**
 * ダイアログを開く。parentに1つだけDialogWindowインスタンスを追加し、Title/Bodyへ文字列を
 * 流し込み、buttonsで指定した各ボタンをWindow配下に生成する。戻り値は生成したルートNode
 * (呼び出し側がキャンセル等で明示的に閉じたい場合、destroy()すればよい)。
 * sizeを指定するとWindowノードのUITransform.contentSizeをその都度上書きする(ダイアログの
 * 種類によってボタン数/本文行数が違うため、呼び出し側が必要なサイズを都度渡す想定。省略時は
 * Prefab側に設定済みのサイズのまま)。
 */
export function showDialogPrefab(
    parent: Node,
    title: string,
    body: string,
    buttons: DialogButtonSpec[],
    onLoaded?: (dialogNode: Node) => void,
    size?: { width: number; height: number },
): void {
    resources.load(DIALOG_PREFAB_PATH, Prefab, (err, prefab) => {
        if (err || !prefab) {
            console.warn(`[DialogPrefab] Failed to load ${DIALOG_PREFAB_PATH}. Dialog will not be shown. See CLAUDE.mdの手順に沿ってPrefabを作成してください。`, err);
            return;
        }
        if (!parent || !parent.isValid) return;

        const dialogNode = instantiate(prefab);
        // HomeUI.ts(RESET確認ダイアログ等)と同じ方式: 呼び出し元(CustomizeUI等)自身の階層に
        // ぶら下げると、SideBarUIや他パネルより奥のsibling indexになって背面に隠れることがある。
        // Canvas直下に付け替えることで、常に最前面(sibling順で末尾=最後に描画)に出るようにする。
        const canvasNode = director.getScene()?.getChildByName("Canvas");
        const actualParent = canvasNode || parent;
        actualParent.addChild(dialogNode);
        // sibling indexを明示的に末尾へ強制(addChildは通常末尾に入るはずだが、
        // 他コードがCanvas直下で順序操作している可能性を潰すための保険)
        dialogNode.setSiblingIndex(actualParent.children.length - 1);
        // UpgradeUI.ts等の既存ダイアログはparentのlayerを継いでいるのではなく、
        // Layers.Enum.UI_2D固定で塗っている。CustomizeUIのルートがUI_2D以外の
        // layerだった場合、parent.layerを継ぐとレンダリングされるカメラのpass自体が
        // ずれてSideBarUI等の裏に消える可能性があるため、既存の動作実績があるほうに合わせる。
        forceLayerRecursive(dialogNode, Layers.Enum.UI_2D);
        console.log(`[DialogPrefab] attached to ${actualParent.name}, siblingIndex=${dialogNode.getSiblingIndex()}/${actualParent.children.length}, layer=${dialogNode.layer}, parent.layer(unused)=${parent.layer}`);

        const windowNode = dialogNode.getChildByName('Window');
        if (!windowNode) {
            console.warn("[DialogPrefab] DialogWindow.prefab is missing its 'Window' child node.");
        }
        if (windowNode && size) {
            const windowUiT = windowNode.getComponent(UITransform);
            if (windowUiT) windowUiT.setContentSize(size.width, size.height);
        }

        const titleNode = windowNode ? windowNode.getChildByName('Title') : null;
        const titleLabel = titleNode ? titleNode.getComponent(Label) : null;
        if (titleLabel) titleLabel.string = title;
        else console.warn("[DialogPrefab] DialogWindow.prefab is missing Window/Title (Label).");

        const bodyNode = windowNode ? windowNode.getChildByName('Body') : null;
        const bodyRichText = bodyNode ? bodyNode.getComponent(RichText) : null;
        if (bodyRichText) bodyRichText.string = body;
        else console.warn("[DialogPrefab] DialogWindow.prefab is missing Window/Body (RichText).");

        const buttonParent = windowNode || dialogNode;
        for (const btn of buttons) {
            instantiatePrefabButton(
                btn.prefabPath, buttonParent, btn.x, btn.y, btn.onClick, dialogNode,
                btn.label, btn.color, 0.3, btn.scale !== undefined ? btn.scale : 1,
                btn.interactable !== undefined ? btn.interactable : true,
            );
        }

        if (onLoaded) onLoaded(dialogNode);
    });
}

function forceLayerRecursive(node: Node, layer: number) {
    node.layer = layer;
    for (const child of node.children) {
        forceLayerRecursive(child, layer);
    }
}
