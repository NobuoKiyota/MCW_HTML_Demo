import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 行動グラフの MoveTo ノードから参照する「移動先ポイント」マーカー。
 * Ingameシーンの "MovePoints" コンテナ配下に子ノードとして配置し、Scene View上で
 * 位置を確認しながらドラッグして配置する(GameManager.resolveInGameReferences が
 * 起動時にこのコンポーネントを持つ子ノードを走査してID→座標のマップを作る)。
 * ID "0" は「現在地」を表す予約語としてMoveTo側で特別扱いするため、実際に配置する
 * ポイントには "0" 以外のIDを付ける。
 */
@ccclass('MovePoint')
export class MovePoint extends Component {
    @property({ tooltip: "MoveToノードのfrom/toから参照するID (例: 1, 2, P1, TopLeft など任意の文字列。'0'は予約済みなので使わないこと)" })
    public pointId: string = "";
}
