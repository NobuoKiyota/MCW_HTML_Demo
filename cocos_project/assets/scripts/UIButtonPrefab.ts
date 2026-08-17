import { Node, UITransform, Graphics, Button, Label, UIOpacity, Color, Prefab, resources, instantiate, tween } from 'cc';

/**
 * assets/resources/Prefabs/Canvas/Button-*.prefab(Home/Next/Yes/No、全て同じ構造)を
 * 読み込んで配置する共通ヘルパー。HomeUI.ts/MissionUI.ts/UpgradeUI.ts/ResultUI.tsそれぞれに
 * 似た内容の確認ダイアログ用ボタン生成コードが重複していたのをここに一元化する。
 *
 * これらのPrefabは全て「ルートnode(コンポーネント無し)の直下に、実際にクリックできる
 * node本体がローカルY=-200オフセットで入っている(240x60)」という同じ構造なので、
 * 指定した(x,y)にボタン本体がちょうど来るようルート位置を補正して配置する。
 * また、Prefab保存時のlayer値をそのまま持ち込む(instantiate()は親のlayerに自動で
 * 合わせてくれない)ため、layerSourceNodeと同じlayerへ強制的に揃える
 * (揃っていないと他のUIより奥に描画され、隠れて見えることがある)。
 */
export function instantiatePrefabButton(
    prefabPath: string,
    parent: Node,
    x: number,
    y: number,
    onClick: () => void,
    layerSourceNode: Node,
    fallbackText: string,
    fallbackColor: Color,
    fadeInDuration: number = 0.5,
    scale: number = 1,
    interactable: boolean = true,
    onReady?: (interactiveNode: Node) => void,
) {
    resources.load(prefabPath, Prefab, (err, prefab) => {
        let rootNode: Node;
        let interactiveNode: Node;

        if (!err && prefab) {
            rootNode = instantiate(prefab);
            interactiveNode = rootNode.children[0] || rootNode;
            const offset = interactiveNode.position;
            rootNode.setPosition(x - offset.x, y - offset.y, 0);
            // 元プレハブは全て240x60固定。呼び出し側の間隔が狭い(Yes/Noを±90等)場合は
            // scale<1を渡してもらい、はみ出し/重なりを防ぐ(中心位置はx,yのまま、見た目だけ縮小)。
            if (scale !== 1) interactiveNode.setScale(scale, scale, 1);
            // ロード成功時はfallbackTextを無視していた(=常にPrefab自体に焼き込まれたラベル文字列
            // (YES/NO等)がそのまま出ていた)のを修正: 呼び出し側が同じPrefabを別ラベルで使い回せる
            // よう、ここでも明示的に上書きする(EJECT/LEVEL UP等、Button-Yes/No/Reselectの使い回しに必要)。
            const lbl = interactiveNode.getComponentInChildren(Label);
            if (lbl) lbl.string = fallbackText;
        } else {
            console.warn(`[UIButtonPrefab] Failed to load ${prefabPath}. Using fallback.`, err);
            rootNode = new Node("ButtonFallback");
            interactiveNode = rootNode;
            rootNode.setPosition(x, y, 0);

            const w = 240;
            const h = 60;
            const trans = rootNode.addComponent(UITransform);
            trans.setContentSize(w, h);

            const gr = rootNode.addComponent(Graphics);
            gr.fillColor = fallbackColor;
            gr.roundRect(-w / 2, -h / 2, w, h, 10);
            gr.fill();

            const lblNode = new Node("Label");
            rootNode.addChild(lblNode);
            const lbl = lblNode.addComponent(Label);
            lbl.string = fallbackText;
            lbl.fontSize = 28;
            lbl.color = Color.WHITE;

            rootNode.addComponent(Button).transition = Button.Transition.SCALE;
        }

        parent.addChild(rootNode);
        forceLayerRecursive(rootNode, layerSourceNode.layer);

        const opacity = rootNode.getComponent(UIOpacity) || rootNode.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).to(fadeInDuration, { opacity: 255 }).start();

        interactiveNode.on(Button.EventType.CLICK, onClick);

        if (!interactable) {
            const btn = interactiveNode.getComponent(Button) || interactiveNode.getComponentInChildren(Button);
            if (btn) btn.interactable = false;
        }
        if (onReady) onReady(interactiveNode);
    });
}

function forceLayerRecursive(node: Node, layer: number) {
    node.layer = layer;
    for (const child of node.children) {
        forceLayerRecursive(child, layer);
    }
}
