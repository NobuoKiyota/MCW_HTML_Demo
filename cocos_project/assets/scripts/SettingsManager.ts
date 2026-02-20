import { _decorator, Component, view, screen, ResolutionPolicy, log } from 'cc';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

export interface GameSettings {
    bgmVolume: number;
    seVolume: number;
    voiceVolume: number;
    language: string;
    resolution: { width: number, height: number };
}

@ccclass('SettingsManager')
export class SettingsManager {
    private static _instance: SettingsManager = null;
    public static get instance(): SettingsManager {
        if (!this._instance) this._instance = new SettingsManager();
        return this._instance;
    }

    private static readonly STORAGE_KEY = 'SHOOTER_SETTINGS';

    public settings: GameSettings = {
        bgmVolume: 0.8,
        seVolume: 0.8,
        voiceVolume: 1.0,
        language: 'JP',
        resolution: { width: 1280, height: 720 }
    };

    constructor() {
        this.load();
    }

    public save() {
        log("[SettingsManager] Saving settings...");
        // Sync from SoundManager before saving
        const sm = SoundManager.instance;
        if (sm) {
            this.settings.bgmVolume = sm.bgmVolume;
            this.settings.seVolume = sm.seVolume;
            this.settings.voiceVolume = sm.voiceVolume;
        }

        localStorage.setItem(SettingsManager.STORAGE_KEY, JSON.stringify(this.settings));
        log("[SettingsManager] Settings Saved.");
    }

    public load() {
        const stored = localStorage.getItem(SettingsManager.STORAGE_KEY);
        if (stored) {
            try {
                this.settings = JSON.parse(stored);
                log("[SettingsManager] Settings Loaded.");
                this.applySettings();
            } catch (e) {
                console.error("[SettingsManager] Failed to parse settings", e);
            }
        }
    }

    public applySettings() {
        log("[SettingsManager] Applying settings...");
        // Apply Audio
        const sm = SoundManager.instance;
        if (sm) {
            sm.bgmVolume = this.settings.bgmVolume;
            sm.seVolume = this.settings.seVolume;
            sm.voiceVolume = this.settings.voiceVolume;
            log("[SettingsManager] Audio settings applied.");
        } else {
            console.warn("[SettingsManager] SoundManager instance not found during applySettings.");
        }

        // Apply Resolution
        this.applyResolution(this.settings.resolution.width, this.settings.resolution.height);
    }

    public applyResolution(width: number, height: number) {
        log(`[SettingsManager] Applying Resolution: ${width}x${height}`);

        // 1. Set Design Resolution (Internal coordinate logic)
        view.setDesignResolutionSize(width, height, ResolutionPolicy.SHOW_ALL);

        // 2. Adjust Screen/Canvas if on Web/Desktop
        // Note: CC 3.x uses screen.windowSize or view.setFrameSize depending on context
        // This affects the actual pixel size of the canvas container.
        if (screen.windowSize.width !== width || screen.windowSize.height !== height) {
            view.setCanvasSize(width, height);
        }

        this.settings.resolution = { width, height };
    }

    public setLanguage(lang: string) {
        this.settings.language = lang;
        log(`[SettingsManager] Language set to: ${lang}`);
    }
}
