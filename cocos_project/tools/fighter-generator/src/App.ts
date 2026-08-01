import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GUI from 'lil-gui';
import { SymmetricManager } from './SymmetricManager';
import { FighterGenerator, FighterType } from './FighterGenerator';

export class App {
  private canvas!: HTMLCanvasElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  
  // ライティング＆ヘルパー
  private ambientLight!: THREE.AmbientLight;
  private dirLight1!: THREE.DirectionalLight;
  private dirLight2!: THREE.DirectionalLight;
  private gridHelper!: THREE.GridHelper;
  
  // ジェネレーター＆モデル
  private generator!: FighterGenerator;
  private symmetricManager!: SymmetricManager;
  private currentFighterGroup: THREE.Group | null = null;
  private currentFighterType: FighterType = 'PLAYER';

  // GLBビューア関連
  private glbViewerGroup: THREE.Group | null = null;
  private isViewerMode: boolean = false;
  private originGizmo: THREE.AxesHelper | null = null;
  private viewerFileBuffer: ArrayBuffer | null = null;
  private viewerSizeController: any = null;
  private viewerOffsetController: any = null;
  private viewerConfig = {
    filename: 'No file loaded',
    sizeText: '-',
    originOffsetText: '-',
    autoRotate: false,
    resetView: () => this.resetViewerCamera(),
    recenterToOrigin: () => this.recenterViewerModel(),
    resetToOriginal: () => this.resetViewerModelToOriginal(),
    exportCategory: 'fuselage',
    exportFilename: '',
    exportToLibrary: () => this.exportViewerModelToLibrary(),
    downloadFixed: () => this.downloadViewerModel(),
    exitViewer: () => this.exitViewerMode()
  };

  // アセット管理
  private partCache: Map<string, THREE.Group> = new Map();
  private partsInventory: Record<string, string[]> = {};
  private selectedParts: Record<string, string> = {};

  // GUI関連
  private gui: GUI | null = null;
  private editableParts: THREE.Object3D[] = [];
  private selectedPartName: string = '';
  private currentPartFolder: any = null;
  private targetNodeController: any = null;
  private selectionBoxHelper: THREE.BoxHelper | null = null;
  private pointerDownPos: { x: number, y: number } = { x: 0, y: 0 };

  // グローバルマテリアルカラー設定
  private materialsConfig = {
    primaryColor: '#ffffff',
    secondaryColor: '#333333',
    canopyColor: '#00f0ff',
    emissiveColor: '#00ffff'
  };

  constructor() {
    this.initThree();
    this.initGenerator();
    this.bindEvents();

    // DEBUG: allows forcing a single render frame from outside the rAF loop
    (window as any).__fighterApp = this;
    (window as any).__forceRender = () => this.renderer.render(this.scene, this.camera);
    
    // 非同期でアセットをロードしてから初期機体を生成
    this.initAndLoadParts().then(() => {
      this.generateFighter('PLAYER');
      this.animate();
    });
  }

  /**
   * Three.js初期化
   */
  private initThree(): void {
    this.canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d19);
    this.scene.fog = new THREE.FogExp2(0x0b0d19, 0.05);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(5, 4, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;

    this.gridHelper = new THREE.GridHelper(20, 20, 0x5865f2, 0x1e2342);
    this.gridHelper.position.y = -1.5;
    this.scene.add(this.gridHelper);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    this.dirLight1.position.set(5, 10, 7);
    this.dirLight1.castShadow = true;
    this.dirLight1.shadow.mapSize.width = 2048;
    this.dirLight1.shadow.mapSize.height = 2048;
    this.dirLight1.shadow.camera.near = 0.5;
    this.dirLight1.shadow.camera.far = 25;
    this.dirLight1.shadow.camera.left = -6;
    this.dirLight1.shadow.camera.right = 6;
    this.dirLight1.shadow.camera.top = 6;
    this.dirLight1.shadow.camera.bottom = -6;
    this.dirLight1.shadow.bias = -0.0005;
    this.scene.add(this.dirLight1);

    this.dirLight2 = new THREE.DirectionalLight(0x5865f2, 0.5);
    this.dirLight2.position.set(-5, 5, -5);
    this.scene.add(this.dirLight2);
  }

  /**
   * ジェネレーター初期化
   */
  private initGenerator(): void {
    this.symmetricManager = new SymmetricManager();
    this.generator = new FighterGenerator(this.symmetricManager);
  }

  /**
   * UIイベント・ドラッグ＆ドロップのバインディング
   */
  private bindEvents(): void {
    window.addEventListener('resize', () => this.onWindowResize());

    // --- 3Dキャンバスクリックでのパーツ選択 ---
    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', (e) => {
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
      });

      this.canvas.addEventListener('pointerup', (e) => {
        const dx = Math.abs(e.clientX - this.pointerDownPos.x);
        const dy = Math.abs(e.clientY - this.pointerDownPos.y);
        // ドラッグ（カメラ操作）ではなくクリックと判定された場合のみパーツを選択
        if (dx < 5 && dy < 5) {
          this.onCanvasClick(e);
        }
      });
    }

    // プリセット変更
    const typeSelect = document.getElementById('fighter-type') as HTMLSelectElement;
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value as FighterType;
        this.generateFighter(val);
      });
    }

    // ランダム・ジェネレートボタン
    const btnGen = document.getElementById('btn-generate');
    if (btnGen) {
      btnGen.addEventListener('click', () => {
        const select = document.getElementById('fighter-type') as HTMLSelectElement;
        const presetType = select ? select.value as FighterType : 'PLAYER';
        this.generateFighter(presetType);
      });
    }

    // 保存ボタン
    const btnSave = document.getElementById('btn-save-cocos');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveToCocos());
    }

    // ダウンロードボタン
    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => this.downloadGLB());
    }

    // --- HTML5 Drag and Drop ビューア登録 ---
    const dropArea = document.body;
    
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      this.showDragOverlay(true);
    });

    dropArea.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });

    dropArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      // bodyの外に完全に離脱したときのみ非表示
      if (!e.relatedTarget) {
        this.showDragOverlay(false);
      }
    });

    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.showDragOverlay(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (ext === '.glb' || ext === '.gltf') {
          this.loadUserGLB(file);
        } else {
          alert('サポートされている形式は .glb または .gltf のみです。');
        }
      }
    });
  }

  /**
   * ドラッグ中オーバーレイの表示制御
   */
  private showDragOverlay(show: boolean): void {
    const overlay = document.getElementById('drag-overlay');
    if (overlay) {
      if (show) {
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
      }
    }
  }

  /**
   * ローカルアセット（パーツ素材）の読み込みとロード
   */
  private async initAndLoadParts(): Promise<void> {
    try {
      this.showStatus('Scanning catalog inventory...', '');
      let response = await fetch('/api/list-parts');
      if (!response.ok) {
        throw new Error(`Failed to fetch inventory from server (Status ${response.status})`);
      }
      let inventory = await response.json();

      // いずれかのカテゴリが空ならブートストラップ（ダミーGLB自動作成）を実行
      const isEmpty = Object.values(inventory).some((arr: any) => arr.length === 0);
      if (isEmpty) {
        this.showStatus('Creating default placeholder parts...', '');
        await this.bootstrapDummyParts();
        
        // 再取得
        response = await fetch('/api/list-parts');
        inventory = await response.json();
      }

      this.partsInventory = inventory;
      this.showStatus('Loading GLB assets...', '');

      // GLTFLoaderによる全アセットの並列プリロード
      const loader = new GLTFLoader();
      const promises: Promise<void>[] = [];

      for (const cat in inventory) {
        const files = inventory[cat] as string[];
        for (const file of files) {
          const url = `/parts/${cat}/${file}`;
          const promise = new Promise<void>((resolve) => {
            loader.load(
              url,
              (gltf) => {
                this.partCache.set(`${cat}/${file}`, gltf.scene);
                resolve();
              },
              undefined,
              (err) => {
                console.error(`Failed to load GLB: ${url}`, err);
                resolve(); // エラーが起きても処理を阻害しない
              }
            );
          });
          promises.push(promise);
        }
      }

      await Promise.all(promises);
      this.generator.setPartCache(this.partCache);
      this.showStatus('Ready', 'success');
    } catch (err: any) {
      console.error('[LoadParts] Error:', err);
      this.showStatus(`Initialization error: ${err.message}. Running fallback mode.`, 'error');
    }
  }

  /**
   * 初期ダミーGLBを自動作成してサーバーに保存（ブートストラップ）
   */
  private async bootstrapDummyParts(): Promise<void> {
    const exporter = new GLTFExporter();
    const categories = ['fuselage', 'nose', 'wings', 'engines', 'canopy', 'tails', 'weapons'];

    for (const cat of categories) {
      let mesh: THREE.Mesh;
      
      // 簡易ダミーメッシュのモデリング
      if (cat === 'fuselage') {
        const geo = new THREE.CylinderGeometry(0.4, 0.5, 2.2, 4);
        geo.rotateX(Math.PI / 2);
        geo.rotateZ(Math.PI / 4);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
      } else if (cat === 'nose') {
        const geo = new THREE.ConeGeometry(0.35, 1.2, 4);
        geo.rotateX(-Math.PI / 2);
        geo.rotateZ(Math.PI / 4);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
      } else if (cat === 'canopy') {
        const geo = new THREE.SphereGeometry(0.3, 8, 8);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 }));
      } else if (cat === 'wings') {
        const geo = new THREE.BoxGeometry(1.8, 0.05, 0.8);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
      } else if (cat === 'engines') {
        const geo = new THREE.CylinderGeometry(0.18, 0.18, 0.9, 8);
        geo.rotateX(Math.PI / 2);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
      } else if (cat === 'tails') {
        const geo = new THREE.BoxGeometry(0.08, 0.8, 0.5);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xbbbbbb }));
      } else { // weapons
        const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6);
        geo.rotateX(Math.PI / 2);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x555555 }));
      }

      mesh.name = `dummy_${cat}`;

      await new Promise<void>((resolve, reject) => {
        exporter.parse(
          mesh,
          (gltf) => {
            const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
            fetch('/api/save-part', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-part-category': cat,
                'x-file-name': `default_${cat}.glb`
              },
              body: blob
            })
            .then(res => {
              if (res.ok) resolve();
              else reject(new Error(`Failed to save: ${cat}`));
            })
            .catch(reject);
          },
          (err) => reject(err),
          { binary: true }
        );
      });
    }
  }

  /**
   * 現在のパーツ選択情報とカラー設定から戦闘機を生成して再描画
   */
  private generateFighter(type: FighterType, regenerateParams: boolean = true): void {
    if (this.isViewerMode) return; // ビューアモード中は無視

    this.currentFighterType = type;

    // 初回・ランダム生成時は、インベントリから自動アセット選択
    const categories = ['fuselage', 'nose', 'wings', 'engines', 'canopy', 'tails', 'weapons'];
    categories.forEach(cat => {
      const files = this.partsInventory[cat] || [];
      if (files.length > 0) {
        if (!this.selectedParts[cat] || type === 'RANDOM' || type !== this.currentFighterType) {
          this.selectedParts[cat] = files[Math.floor(Math.random() * files.length)];
        }
      }
    });

    // 既存機体のクリーンアップ
    if (this.currentFighterGroup) {
      this.scene.remove(this.currentFighterGroup);
      this.currentFighterGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }

    // 機体組み立て
    this.currentFighterGroup = this.generator.generate(type, this.selectedParts, this.materialsConfig, regenerateParams);
    this.scene.add(this.currentFighterGroup);

    // 出力名の自動生成
    const filenameInput = document.getElementById('export-filename') as HTMLInputElement;
    if (filenameInput) {
      const typeLower = type === 'RANDOM' ? 'custom' : type.toLowerCase();
      const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const randId = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      filenameInput.value = `fighter_${typeLower}_${dateStr}_${randId}`;
    }

    this.collectEditableParts();
    this.rebuildGUI();
  }

  /**
   * 編集可能なパーツノードを収集 (右側パーツを除く)
   */
  private collectEditableParts(): void {
    this.editableParts = [];
    if (!this.currentFighterGroup) return;

    const traverse = (obj: THREE.Object3D) => {
      if (obj.name && !obj.name.endsWith('_R') && obj.name !== 'FighterGroup') {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
          this.editableParts.push(obj);
        }
      }
      obj.children.forEach(child => traverse(child));
    };

    traverse(this.currentFighterGroup);
    
    // パーツ選択が維持されているか確認
    if (this.editableParts.length > 0) {
      const exists = this.editableParts.some(p => p.name === this.selectedPartName);
      if (!exists) {
        this.selectedPartName = this.editableParts[0].name;
      }
    } else {
      this.selectedPartName = '';
    }
  }

  /**
   * ドロップされたGLBファイルのパースと読み込み
   */
  private loadUserGLB(file: File): void {
    this.showStatus(`Loading dropped model: ${file.name}...`, '');
    const reader = new FileReader();

    reader.onload = (e) => {
      const contents = e.target?.result as ArrayBuffer;
      this.viewerFileBuffer = contents; // kept for "Reset to Original"
      const loader = new GLTFLoader();

      loader.parse(
        contents,
        '',
        (gltf) => {
          this.enterViewerMode(gltf.scene, file.name);
          this.showStatus(`Model loaded successfully: ${file.name}`, 'success');
        },
        (error) => {
          console.error('[Viewer] Parse error:', error);
          this.showStatus(`Failed to parse GLB: ${error.message}`, 'error');
        }
      );
    };

    reader.onerror = (err) => {
      console.error('[Viewer] FileReader error:', err);
      this.showStatus('FileReader failed to read the file.', 'error');
    };

    reader.readAsArrayBuffer(file);
  }

  /**
   * プレビューアモードへの移行
   */
  private enterViewerMode(model: THREE.Group, filename: string): void {
    this.isViewerMode = true;
    this.viewerConfig.filename = filename;
    this.viewerConfig.exportFilename = filename.replace(/\.(glb|gltf)$/i, '');
    this.viewerConfig.autoRotate = false;

    // 左側のフローティング機体ジェネレータ操作パネルを完全に隠す
    const uiPanel = document.getElementById('ui-container');
    if (uiPanel) uiPanel.classList.add('hidden');

    // シーンから戦闘機アセットを一旦取り除く
    if (this.currentFighterGroup) {
      this.scene.remove(this.currentFighterGroup);
    }

    // 古いビューアモデルがあれば削除
    if (this.glbViewerGroup) {
      this.scene.remove(this.glbViewerGroup);
    }

    this.glbViewerGroup = new THREE.Group();
    this.glbViewerGroup.add(model);
    this.scene.add(this.glbViewerGroup);

    this.applyViewerMaterialTweaks(model);
    this.updateViewerDiagnostics();
    this.resetViewerCamera();
    this.rebuildGUI();
  }

  /**
   * ドロップしたモデルにテクスチャやライティング影設定を自動適用
   */
  private applyViewerMaterialTweaks(model: THREE.Object3D): void {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // メッシュマテリアル調整 (反射やライティングを綺麗にする)
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: any) => {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.roughness = Math.min(m.roughness, 0.7);
              m.metalness = Math.max(m.metalness, 0.1);
            }
          });
        }
      }
    });
  }

  /**
   * サイズ・原点オフセットの読み取り、および原点ギズモの再配置
   * (モデル自体は動かさない = 本来の原点がどこにあるかをそのまま可視化する)
   */
  private updateViewerDiagnostics(): void {
    if (!this.glbViewerGroup) return;
    const model = this.glbViewerGroup.children[0];
    if (!model) return;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const offsetDist = center.length(); // ワールド原点(0,0,0)からバウンディングボックス中心までの距離

    this.viewerConfig.sizeText = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
    this.viewerConfig.originOffsetText = offsetDist < 0.05
      ? `${offsetDist.toFixed(3)} (OK)`
      : `${offsetDist.toFixed(3)} (!! far from origin)`;

    if (this.originGizmo) {
      this.scene.remove(this.originGizmo);
      this.originGizmo.dispose();
    }
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    this.originGizmo = new THREE.AxesHelper(Math.max(maxDim * 0.25, 0.05));
    this.scene.add(this.originGizmo);

    if (this.viewerSizeController) this.viewerSizeController.updateDisplay();
    if (this.viewerOffsetController) this.viewerOffsetController.updateDisplay();
  }

  /**
   * モデルのバウンディングボックス中心をワールド原点に合わせ直す（実際に修正する操作）
   */
  private recenterViewerModel(): void {
    if (!this.glbViewerGroup) return;
    const model = this.glbViewerGroup.children[0];
    if (!model) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    this.updateViewerDiagnostics();
    this.resetViewerCamera();
    this.showStatus('Recentered model origin to its bounding-box center.', 'success');
  }

  /**
   * 元のファイル内容から読み直し、Recenter等の編集を取り消す
   */
  private resetViewerModelToOriginal(): void {
    if (!this.viewerFileBuffer || !this.glbViewerGroup) return;

    const loader = new GLTFLoader();
    loader.parse(
      this.viewerFileBuffer,
      '',
      (gltf) => {
        while (this.glbViewerGroup!.children.length > 0) {
          this.glbViewerGroup!.remove(this.glbViewerGroup!.children[0]);
        }
        this.glbViewerGroup!.add(gltf.scene);
        this.applyViewerMaterialTweaks(gltf.scene);
        this.updateViewerDiagnostics();
        this.resetViewerCamera();
        this.showStatus('Reset to original (undid edits).', 'success');
      },
      (error) => {
        console.error('[Viewer] Reset parse error:', error);
        this.showStatus('Failed to reset model.', 'error');
      }
    );
  }

  /**
   * 修正済みモデルをパーツライブラリ (public/parts/{category}) に直接保存
   */
  private exportViewerModelToLibrary(): void {
    if (!this.glbViewerGroup) return;
    const model = this.glbViewerGroup.children[0];
    if (!model) return;

    const category = this.viewerConfig.exportCategory;
    let filename = this.viewerConfig.exportFilename.trim();
    if (!filename) {
      this.showStatus('Filename cannot be empty.', 'error');
      return;
    }
    if (!filename.toLowerCase().endsWith('.glb')) filename += '.glb';

    const exporter = new GLTFExporter();
    exporter.parse(
      model,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
        fetch('/api/save-part', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-part-category': category,
            'x-file-name': filename
          },
          body: blob
        })
          .then(async (res) => {
            if (res.ok) {
              this.showStatus(`Saved to parts/${category}/${filename}`, 'success');
            } else {
              const errText = await res.text();
              this.showStatus(`Failed to save: ${errText}`, 'error');
            }
          })
          .catch((err) => {
            console.error('Fetch error:', err);
            this.showStatus('Failed to connect to Vite helper API.', 'error');
          });
      },
      (error) => {
        console.error('Export error:', error);
        this.showStatus('Export failed: ' + error, 'error');
      },
      { binary: true }
    );
  }

  /**
   * 修正済みモデルをローカルにダウンロード
   */
  private downloadViewerModel(): void {
    if (!this.glbViewerGroup) return;
    const model = this.glbViewerGroup.children[0];
    if (!model) return;

    let filename = this.viewerConfig.exportFilename.trim() || 'fixed_part';
    if (!filename.toLowerCase().endsWith('.glb')) filename += '.glb';

    const exporter = new GLTFExporter();
    exporter.parse(
      model,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        this.showStatus('Downloaded fixed GLB.', 'success');
      },
      (error) => {
        console.error('Export error:', error);
        this.showStatus('Export failed: ' + error, 'error');
      },
      { binary: true }
    );
  }

  /**
   * ビューアモードのカメラとターゲットを最適化（原点とモデルの両方が入るようフィッティング）
   */
  private resetViewerCamera(): void {
    if (!this.glbViewerGroup) return;
    const model = this.glbViewerGroup.children[0];
    if (!model) return;

    // モデルは動かさず、原点(0,0,0)とモデルの両方が画角に入るようにフィットする
    // -> 原点からズレているパーツは一目でわかる
    const box = new THREE.Box3().setFromObject(model);
    box.expandByPoint(new THREE.Vector3(0, 0, 0));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraDist *= 1.8; // フィット用マージン

    const dir = new THREE.Vector3(0.9, 0.7, 1).normalize();
    this.camera.position.copy(center).addScaledVector(dir, cameraDist);
    this.controls.target.copy(center);
    this.controls.update();
  }

  /**
   * ビューアモードから抜け、元の戦闘機生成モードに戻す
   */
  private exitViewerMode(): void {
    this.isViewerMode = false;

    // ビューアモデルのクリーンアップ
    if (this.glbViewerGroup) {
      this.scene.remove(this.glbViewerGroup);
      this.glbViewerGroup = null;
    }
    if (this.originGizmo) {
      this.scene.remove(this.originGizmo);
      this.originGizmo.dispose();
      this.originGizmo = null;
    }
    this.viewerFileBuffer = null;
    this.viewerSizeController = null;
    this.viewerOffsetController = null;

    // 左側の操作パネルを再表示
    const uiPanel = document.getElementById('ui-container');
    if (uiPanel) uiPanel.classList.remove('hidden');

    // 戦闘機モデルを再表示
    if (this.currentFighterGroup) {
      this.scene.add(this.currentFighterGroup);
    }

    // カメラ位置をデフォルトに戻す
    this.camera.position.set(5, 4, 8);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.showStatus('Ready', 'success');
    this.rebuildGUI();
  }

  /**
   * lil-gui の再構築
   */
  private rebuildGUI(): void {
    if (this.gui) this.gui.destroy();

    if (this.isViewerMode) {
      // --- GLBビューア専用 GUI (プレビュー & 再編集) ---
      this.gui = new GUI({ title: '🔍 GLB Model Viewer' });

      this.gui.add(this.viewerConfig, 'filename').name('File name').disable();
      this.viewerSizeController = this.gui.add(this.viewerConfig, 'sizeText').name('Size (X x Y x Z)').disable();
      this.viewerOffsetController = this.gui.add(this.viewerConfig, 'originOffsetText').name('Origin offset').disable();
      this.gui.add(this.viewerConfig, 'autoRotate').name('🔄 Auto Spin');
      this.gui.add(this.viewerConfig, 'resetView').name('🎥 Reset Camera');

      const editFolder = this.gui.addFolder('🛠️ Re-edit');
      editFolder.add(this.viewerConfig, 'recenterToOrigin').name('📍 Recenter to Origin');
      editFolder.add(this.viewerConfig, 'resetToOriginal').name('↩️ Undo (Reset to Original)');

      const exportFolder = this.gui.addFolder('💾 Export');
      exportFolder.add(this.viewerConfig, 'exportCategory', ['fuselage', 'nose', 'wings', 'engines', 'canopy', 'tails', 'weapons']).name('Category');
      exportFolder.add(this.viewerConfig, 'exportFilename').name('File name');
      exportFolder.add(this.viewerConfig, 'exportToLibrary').name('💾 Save to Parts Library');
      exportFolder.add(this.viewerConfig, 'downloadFixed').name('📥 Download GLB');

      const exitBtn = this.gui.add(this.viewerConfig, 'exitViewer').name('🔙 Exit Viewer');
      // ボタンの見た目を目立たせる
      exitBtn.domElement.style.setProperty('--focus-color', '#ff4757');
      return;
    }

    // --- 通常の戦闘機組み立て用 GUI ---
    this.gui = new GUI({ title: '🛠️ Fighter Assembly' });

    // --- 1. アセット合成 (GLB選択) フォルダ ---
    const assetFolder = this.gui.addFolder('GLB Parts Inventory');
    const categories = ['fuselage', 'nose', 'wings', 'engines', 'canopy', 'tails', 'weapons'];
    
    categories.forEach(cat => {
      const files = this.partsInventory[cat] || [];
      if (files.length > 0) {
        const controller = assetFolder.add(this.selectedParts, cat, files)
          .name(`${cat.toUpperCase()} model`)
          .onChange(() => {
            // 個別パーツの差し替えなので、機体全体の構造パラメータ（配色・カナード有無等）は据え置く
            this.generateFighter(this.currentFighterType, false);
            this.autoSelectPartForCategory(cat);
          });

        // DOMの行全体をクリックした際も対応するパーツをアクティブターゲットに切り替え
        const rowDom = controller.domElement.parentElement;
        if (rowDom) {
          rowDom.style.cursor = 'pointer';
          rowDom.addEventListener('click', (e: Event) => {
            if ((e.target as HTMLElement).tagName !== 'SELECT') {
              e.stopPropagation();
              this.autoSelectPartForCategory(cat);
            }
          });
        }
      }
    });

    // --- 2. カラーマテリアル (Global) フォルダ ---
    const colorFolder = this.gui.addFolder('Global Colors');
    colorFolder.addColor(this.materialsConfig, 'primaryColor')
      .name('Fuselage color')
      .onChange(() => this.updateMaterials());
    colorFolder.addColor(this.materialsConfig, 'secondaryColor')
      .name('Wing color')
      .onChange(() => this.updateMaterials());
    colorFolder.addColor(this.materialsConfig, 'canopyColor')
      .name('Canopy glass')
      .onChange(() => this.updateMaterials());
    colorFolder.addColor(this.materialsConfig, 'emissiveColor')
      .name('Engine flame')
      .onChange(() => this.updateMaterials());

    // --- 3. パーツ個別微調整 (Transform) フォルダ ---
    if (this.editableParts.length > 0) {
      const tuningFolder = this.gui.addFolder('Part Fine Tuning');
      const partNames = this.editableParts.map(p => p.name);
      
      const config = { selectedPart: this.selectedPartName };
      this.targetNodeController = tuningFolder.add(config, 'selectedPart', partNames)
        .name('Target node')
        .onChange((name: string) => {
          this.selectedPartName = name;
          this.updatePartFolder();
          this.updateSelectionHighlight();
        });

      this.currentPartFolder = tuningFolder.addFolder('Transform Adjust');
      this.updatePartFolder();
      this.updateSelectionHighlight();
    }
  }

  /**
   * カテゴリ名から対応するパーツノードを自動選択
   */
  private autoSelectPartForCategory(cat: string): void {
    const catMap: Record<string, string[]> = {
      'fuselage': ['MainFuselage'],
      'nose': ['NoseCone'],
      'canopy': ['Canopy'],
      'wings': ['MainWing_L', 'Canard_L'],
      'engines': ['Engine_L', 'SingleEngine'],
      'tails': ['VerticalTail_L', 'VerticalTail'],
      'weapons': ['Weapon_L']
    };

    const targets = catMap[cat] || [];
    for (const t of targets) {
      const part = this.editableParts.find(p => p.name === t);
      if (part) {
        this.selectPartByName(t);
        break;
      }
    }
  }

  /**
   * 3Dキャンバスクリック時の Raycast パーツ選択
   */
  private onCanvasClick = (e: MouseEvent): void => {
    if (this.isViewerMode || !this.currentFighterGroup) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const intersects = raycaster.intersectObjects(this.currentFighterGroup.children, true);
    if (intersects.length > 0) {
      let hit: THREE.Object3D | null = intersects[0].object;
      
      // ルートの FighterGroup 直下のパーツノードまで遡る
      while (hit && hit.parent && hit.parent.name !== 'FighterGroup') {
        hit = hit.parent;
      }

      if (hit) {
        let targetName = hit.name;
        // スレーブ(_R)がクリックされた場合はマスター(_L)を選択
        if (targetName.endsWith('_R')) {
          targetName = targetName.replace('_R', '_L');
        }

        const exists = this.editableParts.some(p => p.name === targetName);
        if (exists) {
          this.selectPartByName(targetName);
        }
      }
    }
  };

  /**
   * パーツ名でアクティブターゲットを選択し、GUI・ハイライト枠を自動同期
   */
  private selectPartByName(partName: string): void {
    this.selectedPartName = partName;
    
    if (this.targetNodeController) {
      this.targetNodeController.setValue(partName);
    }
    
    this.updatePartFolder();
    this.updateSelectionHighlight();
  }

  /**
   * 選択パーツのバウンディングハイライト枠を表示
   */
  private updateSelectionHighlight(): void {
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
      this.selectionBoxHelper = null;
    }

    const part = this.editableParts.find(p => p.name === this.selectedPartName);
    if (part && this.currentFighterGroup) {
      this.selectionBoxHelper = new THREE.BoxHelper(part, 0x00f0ff);
      (this.selectionBoxHelper.material as THREE.LineBasicMaterial).linewidth = 2;
      this.scene.add(this.selectionBoxHelper);
    }
  }

  /**
   * パーツ個別のトランスフォームスライダーを構築
   */
  private updatePartFolder(): void {
    if (!this.currentPartFolder) return;
    this.currentPartFolder.children.slice().forEach((c: any) => c.destroy());

    const part = this.editableParts.find(p => p.name === this.selectedPartName);
    if (!part) return;

    const baseName = SymmetricManager.getBaseName(part.name);
    const isSymmetric = part.name.endsWith('_L');

    const posMax = 5;
    this.currentPartFolder.add(part.position, 'x', isSymmetric ? -posMax : 0, isSymmetric ? 0 : 0, 0.01)
      .name('Offset X')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });
    this.currentPartFolder.add(part.position, 'y', -posMax, posMax, 0.01)
      .name('Offset Y')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });
    this.currentPartFolder.add(part.position, 'z', -posMax, posMax, 0.01)
      .name('Offset Z')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });

    const rotMax = Math.PI;
    this.currentPartFolder.add(part.rotation, 'x', -rotMax, rotMax, 0.01)
      .name('Rotate X (Pitch)')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });
    this.currentPartFolder.add(part.rotation, 'y', -rotMax, rotMax, 0.01)
      .name('Rotate Y (Yaw)')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });
    this.currentPartFolder.add(part.rotation, 'z', -rotMax, rotMax, 0.01)
      .name('Rotate Z (Roll)')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });

    this.currentPartFolder.add(part.scale, 'x', 0.1, 4.0, 0.01)
      .name('Scale X')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });
    this.currentPartFolder.add(part.scale, 'y', 0.1, 4.0, 0.01)
      .name('Scale Y')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });
    this.currentPartFolder.add(part.scale, 'z', 0.1, 4.0, 0.01)
      .name('Scale Z')
      .onChange(() => {
        if (isSymmetric) this.symmetricManager.sync(baseName);
      });
  }

  /**
   * 色設定の変更をリアルタイム反映 (再生成なし)
   */
  private updateMaterials(): void {
    if (!this.currentFighterGroup) return;
    
    this.currentFighterGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat && !Array.isArray(mat)) {
          let parentName = child.name;
          let p = child.parent;
          while (p && p.name !== 'FighterGroup') {
            parentName = p.name;
            p = p.parent;
          }

          const baseParent = SymmetricManager.getBaseName(parentName);
          
          if (baseParent === 'MainFuselage' || baseParent === 'NoseCone' || baseParent === 'Intake') {
            mat.color.set(this.materialsConfig.primaryColor);
          } else if (baseParent === 'MainWing' || baseParent === 'Canard' || baseParent === 'VerticalTail') {
            mat.color.set(this.materialsConfig.secondaryColor);
          } else if (baseParent === 'Canopy') {
            mat.color.set(this.materialsConfig.canopyColor);
          } else if (child.name.includes('Core')) {
            mat.emissive.set(this.materialsConfig.emissiveColor);
          } else if (child.name.includes('Shell')) {
            mat.color.set(this.materialsConfig.primaryColor);
          }
        }
      }
    });

    this.symmetricManager.syncAll();
  }

  private exportGLB(callback: (blob: Blob) => void): void {
    if (!this.currentFighterGroup) return;

    const exporter = new GLTFExporter();
    const exportOptions = {
      binary: true,
      animations: [],
      includeCustomExtensions: false
    };

    exporter.parse(
      this.currentFighterGroup,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
        callback(blob);
      },
      (error) => {
        console.error('An error occurred during GLB export:', error);
        this.showStatus('Export failed: ' + error, 'error');
      },
      exportOptions
    );
  }

  private saveToCocos(): void {
    const filenameInput = document.getElementById('export-filename') as HTMLInputElement;
    const filename = filenameInput ? filenameInput.value.trim() : 'custom_fighter';
    
    if (!filename) {
      this.showStatus('Filename cannot be empty.', 'error');
      return;
    }

    this.showStatus('Saving to Cocos...', '');

    this.exportGLB((blob) => {
      fetch('/api/save-glb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-name': `${filename}.glb`
        },
        body: blob
      })
      .then(async (response) => {
        if (response.ok) {
          const resJson = await response.json();
          this.showStatus(`Saved successfully! Asset auto-imported to: ${resJson.relative}`, 'success');
        } else {
          const errText = await response.text();
          this.showStatus(`Failed to save: ${errText}`, 'error');
        }
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        this.showStatus(`Failed to connect to Vite helper API.`, 'error');
      });
    });
  }

  private downloadGLB(): void {
    const filenameInput = document.getElementById('export-filename') as HTMLInputElement;
    const filename = filenameInput ? filenameInput.value.trim() : 'custom_fighter';

    this.exportGLB((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.glb`;
      link.click();
      URL.revokeObjectURL(url);
      this.showStatus('Downloaded GLB successfully.', 'success');
    });
  }

  private showStatus(msg: string, type: 'success' | 'error' | ''): void {
    const statusDiv = document.getElementById('status-message');
    if (!statusDiv) return;

    statusDiv.textContent = msg;
    statusDiv.className = 'status-message';
    
    if (type === 'success') statusDiv.classList.add('success');
    else if (type === 'error') statusDiv.classList.add('error');
    
    if (msg) statusDiv.classList.remove('hidden');
    else statusDiv.classList.add('hidden');
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();

    // ビューアモードの自動回転
    if (this.isViewerMode && this.glbViewerGroup && this.viewerConfig.autoRotate) {
      this.glbViewerGroup.rotation.y += 0.005;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
