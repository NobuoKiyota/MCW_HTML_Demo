import { _decorator, Component, sys } from 'cc';

const { ccclass } = _decorator;

/**
 * AIがCocosのリアルタイムログ・エラーを正確に把握するためのロガーシステム
 */
@ccclass('CocosLogger')
export class CocosLogger extends Component {
    private static _instance: CocosLogger | null = null;
    private static _logs: string[] = [];
    private static _maxLogs: number = 200;
    private static _isInitialized: boolean = false;

    public static get instance(): CocosLogger | null {
        return CocosLogger._instance;
    }

    onLoad() {
        if (!CocosLogger._instance) {
            CocosLogger._instance = this;
            CocosLogger.initGlobalHook();
        }
    }

    /**
     * console.log / error / warn をフックし、ログ履歴に記録
     */
    public static initGlobalHook() {
        if (this._isInitialized) return;
        this._isInitialized = true;

        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args: any[]) => {
            originalLog.apply(console, args);
            CocosLogger.appendLog('LOG', args);
        };

        console.warn = (...args: any[]) => {
            originalWarn.apply(console, args);
            CocosLogger.appendLog('WARN', args);
        };

        console.error = (...args: any[]) => {
            originalError.apply(console, args);
            CocosLogger.appendLog('ERROR', args);
        };

        console.log('[CocosLogger] Global console hooks initialized.');
    }

    private static appendLog(type: string, args: any[]) {
        const timestamp = new Date().toISOString().substring(11, 23);
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        const entry = `[${timestamp}][${type}] ${msg}`;

        CocosLogger._logs.push(entry);
        if (CocosLogger._logs.length > CocosLogger._maxLogs) {
            CocosLogger._logs.shift();
        }

        // localStorageへの最新ログ保存（AIからアクセスのためのキャッシュ）
        try {
            sys.localStorage.setItem('cocos_ai_live_log', CocosLogger._logs.join('\n'));
        } catch (e) {
            // 無視
        }
    }

    /**
     * 蓄積された全ログを取得
     */
    public static getLogs(): string {
        return CocosLogger._logs.join('\n');
    }

    /**
     * 最新の指定件数のログを取得
     */
    public static getRecentLogs(count: number = 30): string {
        return CocosLogger._logs.slice(-count).join('\n');
    }
}
