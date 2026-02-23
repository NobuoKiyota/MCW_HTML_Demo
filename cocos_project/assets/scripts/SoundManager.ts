import { _decorator, Component, Node, AudioSource, AudioClip, resources, director, math, input, Input, KeyCode, Vec3, game } from 'cc';
import { SettingsManager } from './SettingsManager';
import { GameDatabase } from './GameDatabase';
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
        if (!this._instance || !this._instance.isValid) {
            // Priority 1: Search the current scene
            const scene = director.getScene();
            if (scene) {
                const existing = scene.getComponentInChildren(SoundManager);
                if (existing) {
                    this._instance = existing;
                    console.log("[SoundManager] Found existing instance in scene.");
                    return this._instance;
                }
            }

            // Priority 2: Create dummy node as fallback
            console.warn("[SoundManager] Instance not initialized and not found in scene. Creating dummy node.");
            const node = new Node("SoundManager_Dummy");
            this._instance = node.addComponent(SoundManager);

            if (scene) {
                scene.addChild(node);
            } else {
                game.addPersistRootNode(node);
            }
        }
        return this._instance;
    }

    // BGM Players (for crossfade)
    private bgmSources: AudioSource[] = [];
    private activeBgmIndex: number = 0;
    private pausedSources: Set<AudioSource> = new Set();

    // SE Management
    private seSources: AudioSource[] = [];
    private seGroups: Map<string, SEGroup> = new Map();
    private activeSEs: Map<string, AudioSource[]> = new Map(); // GroupID -> Active Sources
    private activeSoundSEs: Map<string, AudioSource[]> = new Map(); // Path/ID -> Active Sources
    private lastPlayTimes: Map<string, number> = new Map(); // Path/ID -> Last play time (ms)
    private clipCache: Map<string, AudioClip> = new Map(); // Path/ID -> Loaded Clip
    private pendingSounds: { type: 'BGM' | 'SE' | '3DSE', path: string, extra?: any }[] = [];
    private isDatabaseProcessing: boolean = false;

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
        console.log("[SoundManager] onLoad triggered.");
        if (!SoundManager._instance || !SoundManager._instance.isValid) {
            SoundManager._instance = this;
            console.log("[SoundManager] Singleton initialized.");
        } else if (SoundManager._instance !== this) {
            // Check for dummy hijacking
            if (SoundManager._instance.node.name.includes("Dummy")) {
                console.log("[SoundManager] Hijacking singleton from Dummy node.");
                const oldNode = SoundManager._instance.node;
                SoundManager._instance = this;
                oldNode.destroy();
            } else {
                console.warn("[SoundManager] Duplicate valid instance found, destroying this component.");
                this.destroy();
                return;
            }
        }
        // director.addPersistRootNode(this.node); // Removed for Single Scene

        // Setup BGM Sources (Increase to 3 for Pause/Resume safety)
        for (let i = 0; i < 3; i++) {
            const bgmNode = new Node(`BGM_Source_${i}`);
            bgmNode.parent = this.node;
            const source = bgmNode.addComponent(AudioSource);
            source.playOnAwake = false;
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

        this.schedule(this.checkDatabaseReady, 0.1);
    }

    private checkDatabaseReady() {
        if (GameDatabase.instance && GameDatabase.instance.isReady) {
            this.processPendingSounds();
            this.unschedule(this.checkDatabaseReady);
        }
    }

    private processPendingSounds() {
        if (this.pendingSounds.length === 0) return;
        console.log(`[SoundManager] Processing ${this.pendingSounds.length} pending sounds...`);
        const list = [...this.pendingSounds];
        this.pendingSounds = [];
        for (const item of list) {
            if (item.type === 'BGM') this.playBGM(item.path, item.extra);
            else if (item.type === 'SE') this.playSE(item.path, item.extra);
            else if (item.type === '3DSE') this.play3dSE(item.path, item.extra.pos, item.extra.groupId);
        }
    }

    onDestroy() {
        if (SoundManager._instance === this) {
            SoundManager._instance = null;
        }
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
        // Defensive initialization - ensure maps are ready
        if (!this.clipCache) this.clipCache = new Map();
        if (!this.bgmSources) this.bgmSources = [];

        // 0. Wait for Database if needed
        if (!GameDatabase.instance || !GameDatabase.instance.isReady) {
            console.log(`[SoundManager] Database not ready. Queuing BGM: ${path}`);
            this.pendingSounds.push({ type: 'BGM', path, extra: fadeTime });
            return;
        }

        // 1. Resolve Path if it's an ID
        let actualPath = path;
        let idKey = path;
        const soundData = GameDatabase.instance ? GameDatabase.instance.getSoundData(path) : null;
        if (soundData) {
            actualPath = soundData.path;
            idKey = soundData.id;
        } else {
            // console.log(`[SoundManager] No soundData for BGM: ${path}`);
        }

        // Check if same BGM is already playing
        const currentSource = this.bgmSources[this.activeBgmIndex];
        if (currentSource.playing && currentSource.clip) {
            if (currentSource.clip.name === actualPath.split('/').pop() || currentSource.clip.name === idKey) {
                console.log(`[SoundManager] BGM ${actualPath} is already playing. Skipping.`);
                // Ensure volume is restored if it was fading out (optional)
                currentSource.volume = this.isMuted ? 0 : this._bgmVolume;
                return;
            }
        }

        // 2. Check cache (Check by ID first, then Path)
        const cached = this.clipCache.get(idKey) || this.clipCache.get(actualPath);
        if (cached) {
            this.crossfadeBGM(cached, fadeTime);
            return;
        }

        // 3. Fallback to direct load
        resources.load(actualPath, AudioClip, (err, clip) => {
            if (err) {
                console.error(`[SoundManager] Failed to load BGM: ${actualPath} (Source: ${path})`, err);
                return;
            }
            this.clipCache.set(idKey, clip);
            this.clipCache.set(actualPath, clip);
            this.crossfadeBGM(clip, fadeTime);
        });
    }

    private crossfadeBGM(newClip: AudioClip, fadeTime: number) {
        const nextIndex = (this.activeBgmIndex + 1) % this.bgmSources.length;
        const currentSource = this.bgmSources[this.activeBgmIndex];
        const nextSource = this.bgmSources[nextIndex];

        // If next source is paused, we might want to stop it or reuse it
        // Actually, just overwrite it for simple crossfade
        this.pausedSources.delete(nextSource);
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
                this.pausedSources.delete(currentSource);
                this.unschedule(timerCallback);
            }
        };

        this.schedule(timerCallback, 0);
    }

    public stopBGM(fadeTime: number = 1.0) {
        const currentSource = this.bgmSources[this.activeBgmIndex];
        if (!currentSource || !currentSource.playing) return;

        let elapsed = 0;
        const startVol = currentSource.volume;
        const timerCallback = (dt: number) => {
            elapsed += dt;
            const ratio = math.clamp01(elapsed / fadeTime);
            currentSource.volume = math.lerp(startVol, 0, ratio);

            if (ratio >= 1.0) {
                currentSource.stop();
                this.pausedSources.delete(currentSource);
                this.unschedule(timerCallback);
            }
        };
        this.schedule(timerCallback, 0);
    }

    /**
     * Stop ALL BGM sources (useful for clean transitions)
     */
    public stopAllBGM(fadeTime: number = 1.0) {
        this.bgmSources.forEach(source => {
            if (source.playing || source.volume > 0) {
                let elapsed = 0;
                const startVol = source.volume;
                const timerCallback = (dt: number) => {
                    elapsed += dt;
                    const ratio = math.clamp01(elapsed / fadeTime);
                    source.volume = math.lerp(startVol, 0, ratio);
                    if (ratio >= 1.0) {
                        source.stop();
                        this.pausedSources.delete(source);
                        this.unschedule(timerCallback);
                    }
                };
                this.schedule(timerCallback, 0);
            }
        });
    }

    /**
     * Pause the current active BGM
     */
    public pauseBGM(fadeTime: number = 1.0) {
        const currentSource = this.bgmSources[this.activeBgmIndex];
        if (!currentSource || !currentSource.playing) return;

        let elapsed = 0;
        const startVol = currentSource.volume;
        const timerCallback = (dt: number) => {
            elapsed += dt;
            const ratio = math.clamp01(elapsed / fadeTime);
            currentSource.volume = math.lerp(startVol, 0, ratio);
            if (ratio >= 1.0) {
                currentSource.pause();
                this.pausedSources.add(currentSource);
                this.unschedule(timerCallback);
            }
        };
        this.schedule(timerCallback, 0);
    }

    /**
     * Resume the currently paused BGM (searches all sources if current isn't paused)
     * @returns true if a BGM was found and resumed
     */
    public resumeBGM(fadeTime: number = 1.0): boolean {
        let sourceToResume = this.bgmSources[this.activeBgmIndex];

        // If current isn't paused/ready, find one that is in pausedSources
        if (!sourceToResume || sourceToResume.playing || !this.pausedSources.has(sourceToResume)) {
            const found = this.bgmSources.find(s => !s.playing && this.pausedSources.has(s));
            if (found) {
                sourceToResume = found;
                this.activeBgmIndex = this.bgmSources.indexOf(found);
                console.log(`[SoundManager] Found explicitly paused BGM source at index ${this.activeBgmIndex}`);
            }
        }

        if (sourceToResume && !sourceToResume.playing && this.pausedSources.has(sourceToResume)) {
            sourceToResume.play();
            this.pausedSources.delete(sourceToResume);
            let elapsed = 0;
            const targetVol = this.isMuted ? 0 : this._bgmVolume;
            const timerCallback = (dt: number) => {
                elapsed += dt;
                const ratio = math.clamp01(elapsed / fadeTime);
                sourceToResume.volume = math.lerp(0, targetVol, ratio);
                if (ratio >= 1.0) {
                    this.unschedule(timerCallback);
                }
            };
            this.schedule(timerCallback, 0);
            return true;
        } else {
            console.log("[SoundManager] No BGM found to resume.");
            return false;
        }
    }

    // --- SE Methods ---

    /**
     * 再生中の全てのSEを停止する
     */
    public stopAllSE() {
        // 全てのグループのアクティブなSEを停止
        this.activeSEs.forEach((sources, groupId) => {
            sources.forEach(src => {
                if (src && src.isValid) src.stop();
            });
            sources.length = 0;
        });

        // 固有制限用のアクティブSEも停止
        this.activeSoundSEs.forEach((sources, path) => {
            sources.forEach(src => {
                if (src && src.isValid) src.stop();
            });
            sources.length = 0;
        });

        console.log("[SoundManager] All SE stopped.");
    }

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
        // Defensive initialization - ensure maps are ready
        if (!this.lastPlayTimes) this.lastPlayTimes = new Map();
        if (!this.activeSoundSEs) this.activeSoundSEs = new Map();
        if (!this.clipCache) this.clipCache = new Map();
        if (!this.seGroups) this.seGroups = new Map();
        if (!this.activeSEs) this.activeSEs = new Map();

        // 0. Wait for Database if needed
        if (!GameDatabase.instance || !GameDatabase.instance.isReady) {
            console.log(`[SoundManager] Database not ready. Queuing SE: ${path}`);
            this.pendingSounds.push({ type: 'SE', path, extra: groupId });
            return;
        }

        // 1. Check CSV Settings & Cooldown
        let soundData = null;
        try {
            soundData = GameDatabase.instance.getSoundData(path);
        } catch (e) {
            console.warn(`[SoundManager] Error getting sound data for ${path}:`, e);
        }

        // Variable declarations
        let cooldown = 0.05;
        let volMult = 1.0;
        let actualPath = path;

        if (soundData) {
            cooldown = soundData.cooldown;
            volMult = soundData.volume;
            actualPath = soundData.path;
        } else if (!path.includes("/")) {
            // Fallback: Try to load from default SE directory
            // console.warn(`[SoundManager] playSE: No sound data for ID '${path}'. Check Sounds.csv.`);
            actualPath = "sounds/" + path; // Assume it's in resources/sounds/
        }

        const now = game.totalTime; // In milliseconds
        const last = this.lastPlayTimes.get(path) || 0;
        if (now - last < (cooldown * 1000)) {
            // console.log(`[SoundManager] Cooldown active for: ${path}`);
            return;
        }

        // 2. Check Individual Limit (Polyphony)
        if (soundData && soundData.limit > 0) {
            let activeList = this.activeSoundSEs.get(actualPath);
            if (!activeList) {
                activeList = [];
                this.activeSoundSEs.set(actualPath, activeList);
            }
            if (activeList.length >= soundData.limit) {
                if (soundData.priority === 1) {
                    // Priority 1: Newest priority (Ignore new play request)
                    // console.log(`[SoundManager] Limit reached for ${path}. Ignoring new play.`);
                    return;
                } else {
                    // Priority 0: Oldest priority (Stop oldest)
                    const oldest = activeList.shift();
                    if (oldest && oldest.isValid) oldest.stop();
                }
            }
        }

        this.lastPlayTimes.set(path, now);

        // 3. Execution logic
        const onClipLoaded = (clip: AudioClip) => {
            const source = this.executePlaySE(clip, groupId, volMult);
            // Track for individual limit
            if (soundData && soundData.limit > 0 && source) {
                const activeList = this.activeSoundSEs.get(actualPath);
                if (activeList) {
                    activeList.push(source);
                    this.scheduleOnce(() => {
                        const idx = activeList.indexOf(source);
                        if (idx > -1) activeList.splice(idx, 1);
                    }, clip.getDuration());
                }
            }
        };

        // Check cache (Check by ID first, then Path)
        // Defensive: ensure clipCache is initialized
        if (!this.clipCache) this.clipCache = new Map();

        const cached = this.clipCache.get(path) || this.clipCache.get(actualPath);
        if (cached) {
            onClipLoaded(cached);
        } else {
            // Safety: If GameDatabase is not ready, 'actualPath' might be 'click' (the ID).
            // resources.load will fail for IDs without path.
            if (actualPath === path && !actualPath.includes("/")) {
                // Fallback again just in case previous logic didn't catch it
                actualPath = "sounds/" + path;
            }

            resources.load(actualPath, AudioClip, (err, clip) => {
                if (err) {
                    // Start of fallback retry if not found in sounds/
                    if (actualPath.startsWith("sounds/")) {
                        // Maybe it's directly in resources or another folder? 
                        // For now, just log error.
                    }
                    console.error(`[SoundManager] Failed to load SE: ${actualPath} (Source: ${path})`, err);
                    return;
                }
                this.clipCache.set(path, clip); // Cache by input key
                this.clipCache.set(actualPath, clip); // Also by path
                onClipLoaded(clip);
            });
        }
    }
    /**
     * Play 3D Sound Effect (Stereo Pan & Volume Attenuation)
     * @param path Path relative to resources/
     * @param worldPos World position of the sound source
     * @param groupId Group ID for polyphony control
     */
    public play3dSE(path: string, worldPos: Vec3, groupId: string = "System") {
        // Defensive initialization - ensure maps are ready
        if (!this.lastPlayTimes) this.lastPlayTimes = new Map();
        if (!this.activeSoundSEs) this.activeSoundSEs = new Map();
        if (!this.seGroups) this.seGroups = new Map();
        if (!this.activeSEs) this.activeSEs = new Map();

        if (this.isMuted) return;

        // 0. Wait for Database if needed
        if (!GameDatabase.instance || !GameDatabase.instance.isReady) {
            console.log(`[SoundManager] Database not ready. Queuing 3D SE: ${path}`);
            this.pendingSounds.push({ type: '3DSE', path, extra: { pos: worldPos.clone(), groupId } });
            return;
        }

        // 1. Check CSV Settings & Cooldown
        const soundData = GameDatabase.instance ? GameDatabase.instance.getSoundData(path) : null;
        const cooldown = soundData ? soundData.cooldown : 0.05;
        const volMult = soundData ? soundData.volume : 1.0;
        const actualPath = soundData ? soundData.path : path;

        const now = game.totalTime;
        const last = this.lastPlayTimes.get(path) || 0;
        if (now - last < (cooldown * 1000)) return;

        // 2. Check Individual Limit (Polyphony)
        if (soundData && soundData.limit > 0) {
            let activeList = this.activeSoundSEs.get(actualPath);
            if (!activeList) {
                activeList = [];
                this.activeSoundSEs.set(actualPath, activeList);
            }
            if (activeList.length >= soundData.limit) {
                if (soundData.priority === 1) return; // Skip new
                const oldest = activeList.shift();
                if (oldest && oldest.isValid) oldest.stop();
            }
        }

        this.lastPlayTimes.set(path, now);

        // 3. Calculate Volume based on Player Position (Distance Attenuation)
        let volScale = 1.0 * volMult;

        const listenerInfo = this.getListenerInfo();
        if (listenerInfo) {
            const dx = worldPos.x - listenerInfo.position.x;
            const dy = worldPos.y - listenerInfo.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Volume: 1.0 (Near) to 0.0 (Far)
            volScale = volMult * (1.0 - math.clamp01(dist / listenerInfo.volDropoff));
        }

        if (volScale <= 0.01) return; // Too far to hear

        // 4. Load & Play
        const onClipLoaded = (clip: AudioClip) => {
            const source = this.executePlaySE(clip, groupId, volScale, worldPos);

            // Track for individual limit
            if (soundData && soundData.limit > 0 && source) {
                const activeList = this.activeSoundSEs.get(actualPath);
                if (activeList) {
                    activeList.push(source);
                    this.scheduleOnce(() => {
                        const idx = activeList.indexOf(source);
                        if (idx > -1) activeList.splice(idx, 1);
                    }, clip.getDuration());
                }
            }
        };

        // Check cache (Check by ID first, then Path)
        const cached = this.clipCache.get(path) || this.clipCache.get(actualPath);
        if (cached) {
            onClipLoaded(cached);
        } else {
            // Safety: ID load prevention
            if (actualPath === path && !actualPath.includes("/")) {
                console.warn(`[SoundManager] play3dSE: ID lookup failed for '${path}'. check Sounds.csv.`);
                return;
            }

            resources.load(actualPath, AudioClip, (err, clip) => {
                if (err) {
                    console.error(`[SoundManager] Failed to load 3D SE: ${actualPath} (Source: ${path})`, err);
                    return;
                }
                this.clipCache.set(path, clip);
                this.clipCache.set(actualPath, clip);
                onClipLoaded(clip);
            });
        }
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

    private executePlaySE(clip: AudioClip, groupId: string, volScale: number = 1.0, worldPos: Vec3 = null): AudioSource {
        // Defensive initialization - ensure maps are ready
        if (!this.seGroups) this.seGroups = new Map();
        if (!this.activeSEs) this.activeSEs = new Map();
        if (!this.seSources) this.seSources = [];

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

        return source;
    }

    private getAvailableSESource(): AudioSource {
        for (let s of this.seSources) {
            if (!s.playing) return s;
        }
        // Expand pool
        const seNode = new Node(`SE_Source_${this.seSources.length}`);
        seNode.parent = this.node;
        const source = seNode.addComponent(AudioSource);
        source.playOnAwake = false;
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
        // Defensive initialization - ensure maps are ready
        if (!this.clipCache) this.clipCache = new Map();

        if (this.isMuted) return;

        const cached = this.clipCache.get(path);
        if (cached) {
            const source = this.getAvailableSESource();
            source.clip = cached;
            source.volume = this._voiceVolume;
            source.loop = false;
            source.play();
            return;
        }

        resources.load(path, AudioClip, (err, clip) => {
            if (err) return;
            this.clipCache.set(path, clip);
            const source = this.getAvailableSESource(); // Use SE pool for Voices too
            source.clip = clip;
            source.volume = this._voiceVolume;
            source.loop = false;
            source.play();
        });
    }

    /**
     * CSVに基づいたサウンドのプリロード
     */
    public preloadSounds(soundList: any[]) {
        // Defensive initialization - ensure maps are ready
        if (!this.clipCache) this.clipCache = new Map();

        console.log(`[SoundManager] Preloading ${soundList.length} sounds...`);
        let loadedCount = 0;
        for (const data of soundList) {
            const path = data.path;
            const id = data.id;
            if (!path) {
                loadedCount++;
                continue;
            }

            // Check if already cached
            if (this.clipCache.has(id) || this.clipCache.has(path)) {
                loadedCount++;
                continue;
            }

            resources.load(path, AudioClip, (err, clip) => {
                loadedCount++;
                if (!err) {
                    this.clipCache.set(id, clip);
                    this.clipCache.set(path, clip);
                }
                if (loadedCount === soundList.length) {
                    console.log("[SoundManager] All sounds preloaded and cached.");
                }
            });
        }
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
