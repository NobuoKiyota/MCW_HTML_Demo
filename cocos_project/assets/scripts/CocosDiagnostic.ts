import { _decorator, Component, director, Node, Camera, Canvas, sys } from 'cc';

const { ccclass } = _decorator;

export interface NodeSnapshot {
    name: string;
    active: boolean;
    activeInHierarchy: boolean;
    components: string[];
    childrenCount: number;
    children?: NodeSnapshot[];
}

/**
 * シーン・ノード構造のスナップショットを自動収集する診断クラス
 */
@ccclass('CocosDiagnostic')
export class CocosDiagnostic extends Component {
    private static _instance: CocosDiagnostic | null = null;

    onLoad() {
        if (!CocosDiagnostic._instance) {
            CocosDiagnostic._instance = this;
        }
    }

    start() {
        this.runDiagnostic();
    }

    /**
     * シーン全体のノード階層と状態を分析・出力
     */
    public runDiagnostic() {
        const scene = director.getScene();
        if (!scene) {
            console.warn('[CocosDiagnostic] Scene is not active yet.');
            return;
        }

        console.log(`[CocosDiagnostic] === Running Scene Diagnostic: ${scene.name} ===`);

        const rootSnapshot = this.inspectNode(scene, 0, 3); // 最大深度3まで走査
        const jsonStr = JSON.stringify(rootSnapshot, null, 2);

        // コンソールとlocalStorageへの結果格納
        console.log('[CocosDiagnostic] Node Hierarchy Snapshot:');
        console.log(jsonStr);

        try {
            sys.localStorage.setItem('cocos_ai_scene_snapshot', jsonStr);
        } catch (e) {
            // 無視
        }

        // カメラ判定チェック
        const cameras = scene.getComponentsInChildren(Camera);
        console.log(`[CocosDiagnostic] Active Cameras Count: ${cameras.filter(c => c.enabled && c.node.activeInHierarchy).length} / Total: ${cameras.length}`);
        cameras.forEach(cam => {
            console.log(`  - Camera [${cam.node.name}]: enabled=${cam.enabled}, activeInHierarchy=${cam.node.activeInHierarchy}, priority=${cam.priority}`);
        });

        // 主要Manager判定チェック
        const managers = ['GameManager', 'UIManager', 'SoundManager', 'MasterManager', 'GameDatabase'];
        managers.forEach(mgrName => {
            const found = scene.getComponentInChildren(mgrName);
            console.log(`  - Manager [${mgrName}]: ${found ? 'FOUND (' + (found.enabled ? 'Enabled' : 'Disabled') + ')' : 'NOT FOUND'}`);
        });

        console.log(`[CocosDiagnostic] === Diagnostic Complete ===`);
    }

    private inspectNode(node: Node, currentDepth: number, maxDepth: number): NodeSnapshot {
        const components = node.components.map(c => c.constructor.name);
        const snapshot: NodeSnapshot = {
            name: node.name,
            active: node.active,
            activeInHierarchy: node.activeInHierarchy,
            components: components,
            childrenCount: node.children.length
        };

        if (currentDepth < maxDepth && node.children.length > 0) {
            snapshot.children = node.children.map(child => this.inspectNode(child, currentDepth + 1, maxDepth));
        }

        return snapshot;
    }
}
