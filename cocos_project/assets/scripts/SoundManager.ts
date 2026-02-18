import { _decorator, Component, Node, AudioSource, AudioClip, resources, director, math, input, Input, KeyCode, Vec3 } from 'cc';
import { SettingsManager } from './SettingsManager';
const { ccclass, property } = _decorator;

/**
 * SE Group settings
 */
export interface SEGroup {
    id: string;
    maxPolyphony: number;
    priority: number;
}

@ccclass('SoundManager')
export class SoundManager extends Component {
    private static _instance: SoundManager = null;
    public static get instance(): SoundManager {
        if (!this._instance) {
            console.warn("[SoundManager] Instance not initialized. Creating dummy node.");
            const node = new Node("SoundManager");
            this._instance = node.addComponent(SoundManager);
            director.addPersistRootNode(node);
        }
        return this._instance;
    }

    // BGM Players (for crossfade)
    private bgmSources: AudioSource[] = [];
    private activeBgmIndex: number = 0;

    // SE Management
    private seSources: AudioSource[] = [];
    private seGroups: Map<string, SEGroup> = new Map();
    private activeSEs: Map<string, AudioSource[]> = new Map(); // GroupID -> Active Sources

    private isMuted: boolean = false;
    private _bgmVolume: number = 0.8;
    private _seVolume: number = 0.8;
    private _voiceVolume: number = 1.0;

    public get bgmVolume(): number { return this._bgmVolume; }
    public set bgmVolume(v: number) { this._bgmVolume = v; this.updateBgmVolumes(); }

    public get seVolume(): number { return this._seVolume; }
    public set seVolume(v: number) { this._seVolume = v; }

    public get voiceVolume(): number { return this._voiceVolume; }
    public set voiceVolume(v: number) { this._voiceVolume = v; }

    onLoad() {
        if (SoundManager._instance && SoundManager._instance !== this) {
            this.node.destroy();
            return;
        }
        SoundManager._instance = this;
        director.addPersistRootNode(this.node);

        // Setup BGM Sources
        for (let i = 0; i < 2; i++) {
            const bgmNode = new Node(`BGM_Source_${i}`);
            bgmNode.parent = this.node;
            const source = bgmNode.addComponent(AudioSource);
            source.loop = true;
            source.volume = 0;
            this.bgmSources.push(source);
        }

        // Default SE Groups
        this.addSEGroup({ id: "Player", maxPolyphony: 3, priority: 10 });
        this.addSEGroup({ id: "Enemy", maxPolyphony: 5, priority: 5 });
        this.addSEGroup({ id: "System", maxPolyphony: 2, priority: 20 });

        // Keyboard listener for Mute (M key)
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);

        // Load and Apply Initial Settings
        SettingsManager.instance.load();
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: any) {
        if (event.keyCode === KeyCode.KEY_M) {
            this.toggleMute();
            console.log(`[SoundManager] Mute Toggled: ${this.isMuted}`);
        }
    }

    // --- BGM Methods ---

    /**
     * Play BGM with optional crossfade
     * @param path Path relative to resources/
     * @param fadeTime Fade time in seconds
     */
    public playBGM(path: string, fadeTime: number = 1.0) {
        resources.load(path, AudioClip, (err, clip) => {
            if (err) {
                console.error(`[SoundManager] Failed to load BGM: ${path}`, err);
                return;
            }
            this.crossfadeBGM(clip, fadeTime);
        });
    }

    private crossfadeBGM(newClip: AudioClip, fadeTime: number) {
        const nextIndex = (this.activeBgmIndex + 1) % 2;
        const currentSource = this.bgmSources[this.activeBgmIndex];
        const nextSource = this.bgmSources[nextIndex];

        nextSource.clip = newClip;
        nextSource.play();

        // Simple fade logic using tweens or manual update
        // Here we use a basic lerp-based approach in a separate method or update
        this.activeBgmIndex = nextIndex;

        // Internal fade state
        const startActiveVol = currentSource.volume;
        const targetNextVol = this.isMuted ? 0 : this._bgmVolume;

        let elapsed = 0;
        const timerCallback = (dt: number) => {
            elapsed += dt;
            const ratio = math.clamp01(elapsed / fadeTime);

            if (currentSource.playing) {
                currentSource.volume = math.lerp(startActiveVol, 0, ratio);
            }
            nextSource.volume = math.lerp(0, targetNextVol, ratio);

            if (ratio >= 1.0) {
                currentSource.stop();
                this.unschedule(timerCallback);
            }
        };

        this.schedule(timerCallback, 0);
    }

    public stopBGM(fadeTime: number = 1.0) {
        const currentSource = this.bgmSources[this.activeBgmIndex];
        if (!currentSource.playing) return;

        let elapsed = 0;
        const startVol = currentSource.volume;
        const timerCallback = (dt: number) => {
            elapsed += dt;
            const ratio = math.clamp01(elapsed / fadeTime);
            currentSource.volume = math.lerp(startVol, 0, ratio);

            if (ratio >= 1.0) {
                currentSource.stop();
                this.unschedule(timerCallback);
            }
        };
        this.schedule(timerCallback, 0);
    }

    // --- SE Methods ---

    public addSEGroup(group: SEGroup) {
        this.seGroups.set(group.id, group);
        this.activeSEs.set(group.id, []);
    }

    /**
     * Play Sound Effect
     * @param path Path relative to resources/
     * @param groupId Group ID for polyphony control
     */
    public playSE(path: string, groupId: string = "System") {
        console.log(`[SoundManager] playSE called: ${path}\nStack: ${new Error().stack}`);
        if (this.isMuted) return;

        resources.load(path, AudioClip, (err, clip) => {
            if (err) {
                console.error(`[SoundManager] Failed to load SE: ${path}`, err);
                return;
            }
            this.executePlaySE(clip, groupId);
        });
    }
    /**
     * Play 3D Sound Effect (Stereo Pan & Volume Attenuation)
     * @param path Path relative to resources/
     * @param worldPos World position of the sound source
     * @param groupId Group ID for polyphony control
     */
    public play3dSE(path: string, worldPos: Vec3, groupId: string = "System") {
        if (this.isMuted) return;

        // 1. Calculate Volume based on Player Position (Distance Attenuation)
        let volScale = 1.0;

        const listenerInfo = this.getListenerInfo();
        if (listenerInfo) {
            const dx = worldPos.x - listenerInfo.position.x;
            const dy = worldPos.y - listenerInfo.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Volume: 1.0 (Near) to 0.0 (Far)
            volScale = 1.0 - math.clamp01(dist / listenerInfo.volDropoff);
        }

        if (volScale <= 0.01) return; // Too far to hear

        resources.load(path, AudioClip, (err, clip) => {
            if (err) {
                console.error(`[SoundManager] Failed to load SE: ${path}`, err);
                return;
            }
            this.executePlaySE(clip, groupId, volScale, worldPos);
        });
    }

    // Helper to get listener info (Player) safely
    private getListenerInfo(): { position: Vec3, volDropoff: number } | null {
        // Method 1: Ask GameManager (Most reliable if singleton exists)
        // We use 'any' to avoid circular dependency import issues if GameManager imports SoundManager
        const gm = (window as any)['GameManager'] || director.getScene()?.getComponentInChildren("GameManager");

        let player: any = null;

        if (gm && gm.instance && gm.instance.playerNode) {
            player = gm.instance.playerNode;
        } else {
            // Method 2: Fallback Search
            const canvas = director.getScene()?.getChildByName("Canvas");
            if (canvas) player = canvas.getChildByName("Player");
        }

        if (!player) return null;

        const pCtrl = player.getComponent("PlayerController") as any;

        return {
            position: player.worldPosition,
            // panRange removed
            volDropoff: (pCtrl && pCtrl.audioVolDropoff) ? pCtrl.audioVolDropoff : 800
        };
    }

    private executePlaySE(clip: AudioClip, groupId: string, volScale: number = 1.0, worldPos: Vec3 = null) {
        const group = this.seGroups.get(groupId);
        if (!group) return;

        let activeList = this.activeSEs.get(groupId);

        // Polyphony control
        if (activeList.length >= group.maxPolyphony) {
            const oldest = activeList.shift();
            oldest.stop();
        }

        const source = this.getAvailableSESource();
        source.clip = clip;
        source.volume = this._seVolume * volScale;
        source.loop = false;

        // 3D Audio Logic
        if (worldPos) {
            // Enable 3D
            source.node.setWorldPosition(worldPos);

            // Force 3D spatialization
            // In Cocos Creator, 1.0 is full 3D, 0.0 is 2D.
            if ('spatialBlend' in source) {
                (source as any).spatialBlend = 1.0;
            }
        } else {
            // 2D Audio
            source.node.setPosition(0, 0, 0);
            if ('spatialBlend' in source) {
                (source as any).spatialBlend = 0.0;
            }
        }

        // Manual Pan Fallback (if the engine supports stereoPan property)
        // (source as any).stereoPan = pan; 

        source.play();

        activeList.push(source);

        this.scheduleOnce(() => {
            const index = activeList.indexOf(source);
            if (index > -1) activeList.splice(index, 1);
        }, clip.getDuration());
    }

    private getAvailableSESource(): AudioSource {
        for (let s of this.seSources) {
            if (!s.playing) return s;
        }
        // Expand pool
        const seNode = new Node(`SE_Source_${this.seSources.length}`);
        seNode.parent = this.node;
        const source = seNode.addComponent(AudioSource);
        this.seSources.push(source);
        return source;
    }

    /**
     * Play looping SE (e.g. engine, laser)
     */
    public playLoopSE(path: string, groupId: string, fadeTime: number = 0.5): AudioSource | null {
        if (this.isMuted) return null;

        const source = this.getAvailableSESource();
        resources.load(path, AudioClip, (err, clip) => {
            if (err) return;
            source.clip = clip;
            source.loop = true;
            source.volume = 0;
            source.play();

            // Fade in
            let elapsed = 0;
            const timer = (dt: number) => {
                elapsed += dt;
                source.volume = math.lerp(0, this._seVolume, math.clamp01(elapsed / fadeTime));
                if (elapsed >= fadeTime) this.unschedule(timer);
            };
            this.schedule(timer, 0);
        });

        return source;
    }

    public stopLoopSE(source: AudioSource, fadeTime: number = 0.5) {
        if (!source || !source.playing) return;

        let elapsed = 0;
        const startVol = source.volume;
        const timer = (dt: number) => {
            elapsed += dt;
            source.volume = math.lerp(startVol, 0, math.clamp01(elapsed / fadeTime));
            if (elapsed >= fadeTime) {
                source.stop();
                this.unschedule(timer);
            }
        };
        this.schedule(timer, 0);
    }

    // --- Voice Methods ---

    /**
     * Play Voice Clip (English narration prepared by user)
     */
    public playVoice(path: string) {
        if (this.isMuted) return;

        resources.load(path, AudioClip, (err, clip) => {
            if (err) return;
            const source = this.getAvailableSESource(); // Use SE pool for Voices too
            source.clip = clip;
            source.volume = this._voiceVolume;
            source.loop = false;
            source.play();
        });
    }

    private updateBgmVolumes() {
        if (this.isMuted) return;
        this.bgmSources.forEach(s => {
            if (s.playing) s.volume = this._bgmVolume;
        });
    }

    // --- Global Controls ---

    public setMute(muted: boolean) {
        this.isMuted = muted;
        if (muted) {
            this.bgmSources.forEach(s => s.volume = 0);
            this.seSources.forEach(s => s.stop()); // Immediate stop SEs on mute
        } else {
            // Restore BGM volume
            this.bgmSources[this.activeBgmIndex].volume = this._bgmVolume;
        }
    }

    public toggleMute() {
        this.setMute(!this.isMuted);
    }
}
