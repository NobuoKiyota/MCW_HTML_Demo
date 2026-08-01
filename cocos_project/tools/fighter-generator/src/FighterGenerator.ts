import * as THREE from 'three';
import { SymmetricManager } from './SymmetricManager';

export type FighterType = 'PLAYER' | 'ENEMY_STANDARD' | 'ENEMY_HEAVY' | 'RANDOM';

export class FighterGenerator {
  private symmetricManager: SymmetricManager;
  private partCache: Map<string, THREE.Group> = new Map();
  // Cached structural params (canard/dual-tail/dual-engine/colors/etc.) from the last
  // generateParams() call, so swapping a single part's GLB doesn't reroll the whole airframe.
  private lastParams: any = null;

  constructor(symmetricManager: SymmetricManager) {
    this.symmetricManager = symmetricManager;
  }

  /**
   * ロード済みアセットのキャッシュを設定します。
   */
  setPartCache(cache: Map<string, THREE.Group>): void {
    this.partCache = cache;
  }

  /**
   * プリセットタイプ、選択されたGLBパーツ、およびマテリアル設定から戦闘機モデルを生成します。
   */
  generate(
    type: FighterType,
    selectedParts: Record<string, string>,
    materialsConfig?: Record<string, any>,
    regenerateParams: boolean = true
  ): THREE.Group {
    this.symmetricManager.clear();
    const fighterGroup = new THREE.Group();
    fighterGroup.name = 'FighterGroup';

    // 1. 基本パラメータと色の決定
    // regenerateParams=false のときは前回の構造パラメータ（カナード有無・双尾翼・双発・配色等）を
    // 再利用します。個別パーツのGLB切り替えだけで機体構成全体が変わってしまう不具合の対策。
    const params = (regenerateParams || !this.lastParams) ? this.generateParams(type) : this.lastParams;
    this.lastParams = params;

    // 2. マテリアルの作成 (フォールバック用 & 上書き用)
    const materials = this.createMaterials(params);

    // GUI/引数からのカスタムマテリアル上書き設定
    if (materialsConfig) {
      if (materialsConfig.primaryColor) materials.fuselage.color.set(materialsConfig.primaryColor);
      if (materialsConfig.secondaryColor) materials.wing.color.set(materialsConfig.secondaryColor);
      if (materialsConfig.canopyColor) materials.canopy.color.set(materialsConfig.canopyColor);
      if (materialsConfig.emissiveColor) {
        materials.engineCore.emissive.set(materialsConfig.emissiveColor);
        materials.engineShield.color.set(materialsConfig.emissiveColor);
      }
    }

    // 3. 各パーツのロードと組み立て
    
    // --- 胴体 (Fuselage) ---
    const fuselageFilename = selectedParts['fuselage'] || '';
    const fuselage = this.getPartInstance('fuselage', fuselageFilename, () => {
      // フォールバック: プロシージャル生成
      const geo = new THREE.CylinderGeometry(params.fuselageWidth * 0.7, params.fuselageWidth, params.fuselageLength, 4);
      geo.rotateX(Math.PI / 2);
      geo.rotateZ(Math.PI / 4);
      const mesh = new THREE.Mesh(geo, materials.fuselage);
      mesh.scale.set(1.0, params.fuselageHeight / params.fuselageWidth, 1.0);
      return mesh;
    });
    fuselage.name = 'MainFuselage';
    this.applyMaterialToAllMeshes(fuselage, materials.fuselage, materials.engineCore);
    fighterGroup.add(fuselage);

    // -------------------------------------------------------------
    // 【重要】実バウンディングボックスの測定
    // ロードされた胴体アセットの「実際のサイズ」を測り、これ以降の接合位置の基準とします。
    // -------------------------------------------------------------
    const fuselageBox = new THREE.Box3().setFromObject(fuselage);
    const fuselageSize = new THREE.Vector3();
    fuselageBox.getSize(fuselageSize);
    
    const actualLength = fuselageSize.z > 0 ? fuselageSize.z : params.fuselageLength;
    const actualWidth = fuselageSize.x > 0 ? fuselageSize.x : params.fuselageWidth;
    const actualHeight = fuselageSize.y > 0 ? fuselageSize.y : params.fuselageHeight;

    // --- 機首 (NoseCone) ---
    const noseFilename = selectedParts['nose'] || '';
    const nose = this.getPartInstance('nose', noseFilename, () => {
      const geo = new THREE.ConeGeometry(params.fuselageWidth * 0.7, params.noseLength, 4);
      geo.rotateX(-Math.PI / 2);
      geo.rotateZ(Math.PI / 4);
      const mesh = new THREE.Mesh(geo, materials.fuselage);
      mesh.scale.set(1.0, params.fuselageHeight / params.fuselageWidth, 1.0);
      return mesh;
    });
    nose.name = 'NoseCone';
    // 胴体の実長を基準に、先端にピッタリ配置
    const noseLength = params.noseLength; 
    nose.position.set(0, 0, actualLength / 2 + noseLength / 2);
    this.applyMaterialToAllMeshes(nose, materials.fuselage, materials.engineCore);
    fighterGroup.add(nose);

    // --- キャノピー (Canopy) ---
    if (params.hasCanopy) {
      const canopyFilename = selectedParts['canopy'] || '';
      const canopy = this.getPartInstance('canopy', canopyFilename, () => {
        const geo = new THREE.SphereGeometry(1, 8, 8);
        const mesh = new THREE.Mesh(geo, materials.canopy);
        mesh.scale.set(params.canopyWidth / 2, params.canopyHeight / 2, params.canopyLength / 2);
        return mesh;
      });
      canopy.name = 'Canopy';
      // 胴体の実高・実長に基づいて配置
      canopy.position.set(0, actualHeight * 0.4, actualLength * 0.12);
      this.applyMaterialToAllMeshes(canopy, materials.canopy, materials.engineCore);
      fighterGroup.add(canopy);
    }

    // --- 左右対称パーツ (SymmetricManagerで管理) ---
    // 【重要】Blender側で-X方向（左翼）に伸びてモデリングされるアセットに合わせるため、
    // マスター（_L）の配置オフセットX座標をマイナスにし、スレーブ（_R）を鏡像反転してプラス側に配置します。
    
    // 主翼 (Wings_L / Wings_R)
    const wingsFilename = selectedParts['wings'] || '';
    const [wingL, wingR] = this.createSymmetricPartPair(
      'MainWing',
      'wings',
      wingsFilename,
      new THREE.Vector3(-actualWidth * 0.4, 0, -actualLength * 0.1),
      materials.wing,
      materials.engineCore,
      () => {
        return this.createProceduralWingGeometry(
          params.wingSpan,
          params.wingRootChord,
          params.wingTipChord,
          params.wingSweep,
          params.wingThickness,
          params.stealthAngle
        );
      }
    );
    fighterGroup.add(wingL, wingR);

    // カナード (前翼)
    if (params.hasCanard) {
      const [canardL, canardR] = this.createSymmetricPartPair(
        'Canard',
        'wings',
        selectedParts['canard'] || wingsFilename,
        new THREE.Vector3(-actualWidth * 0.3, 0.1, actualLength * 0.25),
        materials.wing,
        materials.engineCore,
        () => {
          return this.createProceduralWingGeometry(
            params.canardSpan,
            params.canardRootChord,
            params.canardTipChord,
            params.canardSweep,
            params.canardThickness,
            params.stealthAngle
          );
        }
      );
      if (selectedParts['canard'] || wingsFilename) {
        canardL.scale.multiplyScalar(0.5);
      }
      fighterGroup.add(canardL, canardR);
    }

    // インテーク
    const [intakeL, intakeR] = this.createSymmetricPartPair(
      'Intake',
      'fuselage',
      selectedParts['intake'] || '',
      new THREE.Vector3(-(actualWidth * 0.45 + (params.fuselageWidth * 0.35) / 2), 0, actualLength * 0.1),
      materials.fuselage,
      materials.engineCore,
      () => {
        const length = params.fuselageLength * 0.25;
        const width = params.fuselageWidth * 0.35;
        const height = params.fuselageHeight * 0.5;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(width, 0);
        shape.lineTo(width, -length);
        shape.lineTo(0, -length * 0.7);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.01 });
        geo.center();
        geo.rotateX(Math.PI / 2);
        geo.rotateY(Math.PI);
        return geo;
      }
    );
    fighterGroup.add(intakeL, intakeR);

    // エンジン (単発 or 双発)
    const engineFilename = selectedParts['engines'] || '';
    if (params.isDualEngine) {
      // 双発 (左右対称配置、マスターは左-X)
      const [engL, engR] = this.createSymmetricEnginePair(
        params,
        engineFilename,
        materials,
        new THREE.Vector3(-actualWidth * 0.45, 0, -actualLength / 2 - params.engineLength * 0.2)
      );
      fighterGroup.add(engL, engR);
    } else {
      // 単発 (中心配置)
      const eng = this.createSingleEngineInstance(params, engineFilename, materials);
      eng.position.set(0, 0, -actualLength / 2 - params.engineLength / 2);
      fighterGroup.add(eng);
    }

    // 垂直尾翼 (Tails)
    const tailFilename = selectedParts['tails'] || '';
    if (params.isDualTail) {
      // 双尾翼
      const [tailL, tailR] = this.createSymmetricPartPair(
        'VerticalTail',
        'tails',
        tailFilename,
        new THREE.Vector3(-actualWidth * 0.4, actualHeight * 0.4 + params.tailSpan * 0.4, -actualLength * 0.35),
        materials.wing,
        materials.engineCore,
        () => {
          return this.createProceduralTailGeometry(params);
        }
      );
      tailL.rotation.z = -params.tailTiltAngle;
      fighterGroup.add(tailL, tailR);
    } else {
      // 単尾翼
      const tail = this.getPartInstance('tails', tailFilename, () => {
        const geo = this.createProceduralTailGeometry(params);
        const mesh = new THREE.Mesh(geo, materials.wing);
        return mesh;
      });
      tail.name = 'VerticalTail';
      tail.position.set(0, actualHeight * 0.5 + params.tailSpan * 0.4, -actualLength * 0.35);
      this.applyMaterialToAllMeshes(tail, materials.wing, materials.engineCore);
      fighterGroup.add(tail);
    }

    // ウェポン (Weapons)
    const weaponFilename = selectedParts['weapons'] || '';
    const [weaponL, weaponR] = this.createSymmetricPartPair(
      'Weapon',
      'weapons',
      weaponFilename,
      new THREE.Vector3(-actualWidth * 0.6, -actualHeight * 0.2, actualLength * 0.0),
      materials.fuselage,
      materials.engineCore,
      () => {
        const length = 1.0;
        const radius = 0.12;
        const group = new THREE.Group();
        const bodyGeo = new THREE.CylinderGeometry(radius, radius, length, 6);
        bodyGeo.rotateX(Math.PI / 2);
        const body = new THREE.Mesh(bodyGeo, materials.fuselage);
        group.add(body);
        const muzzleGeo = new THREE.ConeGeometry(radius, 0.2, 6);
        muzzleGeo.rotateX(Math.PI / 2);
        const muzzle = new THREE.Mesh(muzzleGeo, materials.engineCore);
        muzzle.position.set(0, 0, length / 2 + 0.1);
        group.add(muzzle);
        return group;
      }
    );
    fighterGroup.add(weaponL, weaponR);

    // 鏡面同期の初期化
    this.symmetricManager.syncAll();

    return fighterGroup;
  }

  /**
   * キャッシュまたはフォールバックからパーツのインスタンスを取得します。
   */
  private getPartInstance(category: string, filename: string, fallback: () => THREE.Object3D): THREE.Object3D {
    if (!filename) return fallback();
    const cacheKey = `${category}/${filename}`;
    const cached = this.partCache.get(cacheKey);
    if (cached) {
      const inst = cached.clone();
      this.centerPartObject(inst, category);
      return inst;
    }
    return fallback();
  }

  /**
   * GLBアセットの重心・基準軸アライメント補正
   */
  private centerPartObject(obj: THREE.Object3D, category: string): void {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);

    // カテゴリごとに中心軸のオフセットを適正化
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (category === 'fuselage' || category === 'nose') {
          child.position.x -= center.x;
          child.position.y -= center.y;
        } else if (category === 'wings') {
          child.position.y -= center.y;
        } else if (category === 'engines' || category === 'tails' || category === 'canopy' || category === 'weapons') {
          child.position.x -= center.x;
          child.position.y -= center.y;
          child.position.z -= center.z;
        }
      }
    });
  }

  /**
   * オブジェクト内のすべてのメッシュに指定したマテリアルを再帰的に適用します。
   * マルチマテリアルスロット対応のため、マテリアル名に glow/emissive/light が含まれる場合は
   * coreEmissiveMaterial を適用して発光ディテールを保護します。
   */
  private applyMaterialToAllMeshes(obj: THREE.Object3D, material: THREE.Material, coreEmissiveMaterial?: THREE.Material): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material && !Array.isArray(child.material)) {
          const m = child.material as THREE.MeshStandardMaterial;
          
          // マテリアル名に発光系ワードが含まれる場合は、coreEmissiveMaterialから色や強度をコピー
          const isGlow = m.name && (
            m.name.toLowerCase().includes('glow') || 
            m.name.toLowerCase().includes('emissive') || 
            m.name.toLowerCase().includes('light')
          );
          
          const target = (isGlow && coreEmissiveMaterial) 
            ? (coreEmissiveMaterial as THREE.MeshStandardMaterial) 
            : (material as THREE.MeshStandardMaterial);

          if (m.color && target.color && !isGlow) {
            m.color.copy(target.color);
          }
          if (m.roughness !== undefined) m.roughness = target.roughness;
          if (m.metalness !== undefined) m.metalness = target.metalness;
          if (m.opacity !== undefined) {
            m.opacity = target.opacity;
            m.transparent = target.transparent;
          }
          if (m.emissive && target.emissive) {
            m.emissive.copy(target.emissive);
            m.emissiveIntensity = target.emissiveIntensity;
          }
        } else {
          child.material = material;
        }
      }
    });
  }

  /**
   * 左右対称のパーツペアをロード、またはフォールバック生成して配置します。
   * スレーブ（右側）は scale.x *= -1 を施して鏡像化し、ポリゴン巻き順反転による
   * 面の裏返りを防ぐため、全メッシュマテリアルを DoubleSide に設定します。
   */
  private createSymmetricPartPair(
    nameBase: string,
    category: string,
    filename: string,
    offset: THREE.Vector3,
    material: THREE.Material,
    emissiveMaterial: THREE.Material,
    fallbackGeo: () => THREE.BufferGeometry | THREE.Object3D
  ): [THREE.Object3D, THREE.Object3D] {
    
    let master: THREE.Object3D;
    let slave: THREE.Object3D;

    const cacheKey = `${category}/${filename}`;
    const cached = filename ? this.partCache.get(cacheKey) : null;

    if (cached) {
      // アセットからロード
      master = cached.clone();
      this.centerPartObject(master, category);
      master.name = `${nameBase}_L`;
      master.position.copy(offset);
      this.applyMaterialToAllMeshes(master, material, emissiveMaterial);

      slave = cached.clone();
      this.centerPartObject(slave, category);
      slave.name = `${nameBase}_R`;
      this.applyMaterialToAllMeshes(slave, material, emissiveMaterial);
    } else {
      // フォールバック
      const res = fallbackGeo();
      if (res instanceof THREE.BufferGeometry) {
        master = new THREE.Mesh(res, material);
      } else {
        master = res;
      }
      master.name = `${nameBase}_L`;
      master.position.copy(offset);

      if (res instanceof THREE.BufferGeometry) {
        slave = new THREE.Mesh(res, material);
      } else {
        slave = res.clone();
      }
      slave.name = `${nameBase}_R`;
    }

    // スレーブに鏡像（Xスケール反転）を適用
    slave.scale.x *= -1;
    
    // ポリゴン巻き順反転に伴う法線の裏返り対策として、スレーブの全メッシュマテリアルをDoubleSideにする
    slave.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => { m.side = THREE.DoubleSide; });
          } else {
            child.material.side = THREE.DoubleSide;
          }
        }
      }
    });

    // SymmetricManagerへ登録（初期同期も自動で行われます）
    this.symmetricManager.registerPair(nameBase, master, slave);

    return [master, slave];
  }

  /**
   * 単発エンジンの生成 (キャッシュ対応)
   */
  private createSingleEngineInstance(params: any, filename: string, materials: any): THREE.Object3D {
    const engine = this.getPartInstance('engines', filename, () => {
      const engineGroup = new THREE.Group();
      const radius = params.engineRadius;
      const length = params.engineLength;

      const shellGeo = new THREE.CylinderGeometry(radius, radius * 1.1, length, 4);
      shellGeo.rotateX(Math.PI / 2);
      shellGeo.rotateZ(Math.PI / 4);
      const shell = new THREE.Mesh(shellGeo, materials.engineShield);
      engineGroup.add(shell);

      const coreGeo = new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, length * 0.9, 8);
      coreGeo.rotateX(Math.PI / 2);
      const core = new THREE.Mesh(coreGeo, materials.engineCore);
      core.position.set(0, 0, -length * 0.05);
      engineGroup.add(core);

      const nozzleGeo = new THREE.CylinderGeometry(radius * 0.7, radius * 0.5, length * 0.25, 6);
      nozzleGeo.rotateX(Math.PI / 2);
      const nozzle = new THREE.Mesh(nozzleGeo, materials.engineExhaust);
      nozzle.position.set(0, 0, -length / 2 - length * 0.1);
      engineGroup.add(nozzle);

      return engineGroup;
    });

    engine.name = 'SingleEngine';
    
    if (!filename) {
      // 幾何学フォールバック時はマテリアルが設定済みなので何もしない
    } else {
      this.applyMaterialToAllMeshes(engine, materials.fuselage, materials.engineCore);
    }
    
    return engine;
  }

  /**
   * 双発エンジンの生成 (左右対称キャッシュ対応)
   */
  private createSymmetricEnginePair(
    params: any,
    filename: string,
    materials: any,
    offset: THREE.Vector3
  ): [THREE.Object3D, THREE.Object3D] {
    const nameBase = 'Engine';
    const radius = params.engineRadius * 0.85;
    const length = params.engineLength;

    return this.createSymmetricPartPair(
      nameBase,
      'engines',
      filename,
      offset,
      materials.fuselage,
      materials.engineCore,
      () => {
        const engineGroup = new THREE.Group();
        const shellGeo = new THREE.CylinderGeometry(radius, radius * 1.1, length, 4);
        shellGeo.rotateX(Math.PI / 2);
        shellGeo.rotateZ(Math.PI / 4);
        const shell = new THREE.Mesh(shellGeo, materials.engineShield);
        engineGroup.add(shell);

        const coreGeo = new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, length * 0.9, 8);
        coreGeo.rotateX(Math.PI / 2);
        const core = new THREE.Mesh(coreGeo, materials.engineCore);
        core.position.set(0, 0, -length * 0.05);
        engineGroup.add(core);

        const nozzleGeo = new THREE.CylinderGeometry(radius * 0.7, radius * 0.5, length * 0.25, 6);
        nozzleGeo.rotateX(Math.PI / 2);
        const nozzle = new THREE.Mesh(nozzleGeo, materials.engineExhaust);
        nozzle.position.set(0, 0, -length / 2 - length * 0.1);
        engineGroup.add(nozzle);

        return engineGroup;
      }
    );
  }

  /**
   * フォールバック用の主翼ジオメトリ生成
   */
  private createProceduralWingGeometry(
    span: number,
    rootChord: number,
    tipChord: number,
    sweep: number,
    thickness: number,
    stealthAngle: number
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const sweepOffset = span * Math.tan(stealthAngle) * sweep;

    shape.moveTo(0, 0);
    shape.lineTo(span, sweepOffset);
    shape.lineTo(span, sweepOffset - tipChord);
    shape.lineTo(0, -rootChord);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.2,
      bevelSize: thickness * 0.1,
      bevelSegments: 1
    });
    geo.center();
    // フォールバック形状も master 側に合わせて反転（左側に伸ばす）
    geo.rotateX(-Math.PI / 2);
    geo.scale(-1, 1, 1);
    return geo;
  }

  /**
   * フォールバック用の尾翼ジオメトリ生成
   */
  private createProceduralTailGeometry(params: any): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const sweepOffset = params.tailSpan * Math.tan(params.stealthAngle) * params.tailSweep;

    shape.moveTo(0, 0);
    shape.lineTo(params.tailSpan, sweepOffset);
    shape.lineTo(params.tailSpan, sweepOffset - params.tailTipChord);
    shape.lineTo(0, -params.tailRootChord);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: params.tailThickness,
      bevelEnabled: true,
      bevelThickness: params.tailThickness * 0.2,
      bevelSize: params.tailThickness * 0.1,
      bevelSegments: 1
    });
    geo.center();
    geo.rotateZ(Math.PI / 2);
    geo.rotateY(Math.PI / 2);
    return geo;
  }

  /**
   * プリセットパラメータの生成
   */
  private generateParams(type: FighterType) {
    const resolvedType = type === 'RANDOM'
      ? (['PLAYER', 'ENEMY_STANDARD', 'ENEMY_HEAVY'][Math.floor(Math.random() * 3)] as FighterType)
      : type;

    const stealthAngle = (35 + Math.random() * 15) * (Math.PI / 180);

    const p = {
      type: resolvedType,
      stealthAngle,
      fuselageLength: 4.0,
      fuselageWidth: 0.8,
      fuselageHeight: 0.6,
      noseLength: 1.5,
      hasCanopy: true,
      canopyLength: 1.2,
      canopyWidth: 0.5,
      canopyHeight: 0.4,
      canopyOffsetZ: 0.5,
      wingSpan: 2.5,
      wingRootChord: 1.8,
      wingTipChord: 0.4,
      wingThickness: 0.08,
      wingSweep: 0.5,
      hasCanard: false,
      canardSpan: 0.8,
      canardRootChord: 0.6,
      canardTipChord: 0.2,
      canardThickness: 0.04,
      canardSweep: 0.3,
      isDualTail: false,
      tailSpan: 1.0,
      tailRootChord: 0.9,
      tailTipChord: 0.3,
      tailThickness: 0.05,
      tailSweep: 0.6,
      tailTiltAngle: 0.0,
      isDualEngine: false,
      engineLength: 1.2,
      engineRadius: 0.35,
      primaryColor: '#ffffff',
      secondaryColor: '#333333',
      emissiveColor: '#00ffff',
      canopyColor: '#00aeff'
    };

    if (resolvedType === 'PLAYER') {
      p.fuselageLength = 4.2;
      p.fuselageWidth = 0.7;
      p.fuselageHeight = 0.55;
      p.hasCanopy = true;
      p.canopyLength = 1.4;
      p.canopyHeight = 0.45;
      p.wingSpan = 2.8;
      p.wingRootChord = 1.6;
      p.wingSweep = Math.random() > 0.4 ? 0.6 : -0.25;
      p.hasCanard = Math.random() > 0.3;
      p.isDualTail = Math.random() > 0.5;
      if (p.isDualTail) p.tailTiltAngle = (12 + Math.random() * 10) * (Math.PI / 180);
      p.isDualEngine = Math.random() > 0.5;
      
      const colors = ['#e63946', '#457b9d', '#ffb703', '#ffffff', '#70d6ff'];
      p.primaryColor = colors[Math.floor(Math.random() * colors.length)];
      p.secondaryColor = p.primaryColor === '#ffffff' ? '#1d3557' : '#ffffff';
      p.emissiveColor = '#00ffff';
      p.canopyColor = '#00f0ff';
    } else if (resolvedType === 'ENEMY_STANDARD') {
      p.fuselageLength = 3.2;
      p.fuselageWidth = 0.6;
      p.fuselageHeight = 0.5;
      p.hasCanopy = false;
      p.wingSpan = 2.0;
      p.wingRootChord = 1.4;
      p.wingTipChord = 0.3;
      p.wingSweep = 0.4;
      p.hasCanard = false;
      p.isDualTail = false;
      p.isDualEngine = false;

      const colors = ['#2b2d42', '#3a5a40', '#4a4e69', '#3f37c9', '#1a1a1a'];
      p.primaryColor = colors[Math.floor(Math.random() * colors.length)];
      p.secondaryColor = '#111111';
      p.emissiveColor = '#ff3333';
    } else if (resolvedType === 'ENEMY_HEAVY') {
      p.fuselageLength = 5.0;
      p.fuselageWidth = 1.2;
      p.fuselageHeight = 0.8;
      p.hasCanopy = false;
      p.wingSpan = 3.6;
      p.wingRootChord = 2.6;
      p.wingTipChord = 0.6;
      p.wingSweep = 0.7;
      p.hasCanard = Math.random() > 0.5;
      p.isDualTail = true;
      p.tailTiltAngle = (15 + Math.random() * 10) * (Math.PI / 180);
      p.isDualEngine = true;

      const colors = ['#1b1b1b', '#240046', '#03071e', '#0d1b2a'];
      p.primaryColor = colors[Math.floor(Math.random() * colors.length)];
      p.secondaryColor = '#3d3d3d';
      p.emissiveColor = '#9d4edd';
    }

    return p;
  }

  /**
   * デフォルトマテリアル作成
   */
  private createMaterials(params: any) {
    const isDark = params.type.startsWith('ENEMY');
    const roughness = isDark ? 0.6 : 0.3;
    const metalness = isDark ? 0.8 : 0.5;

    return {
      fuselage: new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.primaryColor),
        roughness: roughness,
        metalness: metalness
      }),
      wing: new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.secondaryColor),
        roughness: roughness,
        metalness: metalness
      }),
      canopy: new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.canopyColor),
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.65
      }),
      engineExhaust: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.5,
        metalness: 0.9
      }),
      engineCore: new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: new THREE.Color(params.emissiveColor),
        emissiveIntensity: 3.0
      }),
      engineShield: new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.primaryColor),
        transparent: true,
        opacity: 0.3,
        roughness: 0.2,
        metalness: 0.8
      })
    };
  }
}
