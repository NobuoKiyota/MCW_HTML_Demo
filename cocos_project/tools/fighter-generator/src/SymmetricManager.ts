import * as THREE from 'three';

export interface SymmetricPair {
  master: THREE.Object3D; // Left side part
  slave: THREE.Object3D;  // Right side part
}

export class SymmetricManager {
  private pairs: Map<string, SymmetricPair> = new Map();

  /**
   * 左右対称のペアを登録します。
   * @param nameBase パーツのベース名 (例: "MainWing")
   * @param master 左側パーツ (Object3D)
   * @param slave 右側パーツ (Object3D)
   */
  registerPair(nameBase: string, master: THREE.Object3D, slave: THREE.Object3D): void {
    this.pairs.set(nameBase, { master, slave });
    this.sync(nameBase);
  }

  /**
   * 登録されているすべてのペアをクリアします。
   */
  clear(): void {
    this.pairs.clear();
  }

  /**
   * 指定したベース名のペアの同期を行います。
   * @param nameBase パーツのベース名
   */
  sync(nameBase: string): void {
    const pair = this.pairs.get(nameBase);
    if (!pair) return;

    const { master, slave } = pair;

    // 1. Position 同期 (X軸反転)
    slave.position.set(
      -master.position.x,
      master.position.y,
      master.position.z
    );

    // 2. Rotation 同期 (Euler角のX軸鏡面反転)
    // 鏡面反射では、ロール(Z回転)とヨー(Y回転)が反転し、ピッチ(X回転)はそのままになります
    slave.rotation.set(
      master.rotation.x,
      -master.rotation.y,
      -master.rotation.z,
      master.rotation.order
    );

    // 3. Scale 同期 (X軸のみ反転を維持して鏡像化)
    slave.scale.copy(master.scale);
    slave.scale.x *= -1;

    // 4. Material 同期
    // 左側と右側で別々のマテリアルを持つ場合にプロパティを同期
    if (
      master instanceof THREE.Mesh && 
      slave instanceof THREE.Mesh && 
      master.material && 
      slave.material
    ) {
      const masterMat = master.material as THREE.MeshStandardMaterial;
      const slaveMat = slave.material as THREE.MeshStandardMaterial;

      if (masterMat.color && slaveMat.color) {
        slaveMat.color.copy(masterMat.color);
      }
      if (masterMat.emissive && slaveMat.emissive) {
        slaveMat.emissive.copy(masterMat.emissive);
      }
      
      slaveMat.roughness = masterMat.roughness;
      slaveMat.metalness = masterMat.metalness;
      slaveMat.opacity = masterMat.opacity;
      slaveMat.transparent = masterMat.transparent;
      slaveMat.emissiveIntensity = masterMat.emissiveIntensity;
      
      if (slaveMat.needsUpdate) {
        slaveMat.needsUpdate = true;
      }
    }
  }

  /**
   * すべてのペアを同期します。
   */
  syncAll(): void {
    for (const nameBase of this.pairs.keys()) {
      this.sync(nameBase);
    }
  }

  /**
   * 与えられたオブジェクトがスレーブ（右側パーツ）であるか判定します。
   * 編集不可制限をかけるために使用します。
   */
  isSlave(object: THREE.Object3D): boolean {
    for (const pair of this.pairs.values()) {
      if (pair.slave === object || pair.slave.uuid === object.uuid) {
        return true;
      }
      // 子要素もスレーブ扱いにする
      let parent = object.parent;
      while (parent) {
        if (pair.slave === parent) return true;
        parent = parent.parent;
      }
    }
    return false;
  }

  /**
   * オブジェクト名からペアのベース名を取得します。
   * (例: "MainWing_L" -> "MainWing", "MainWing_R" -> "MainWing")
   */
  static getBaseName(name: string): string {
    if (name.endsWith('_L') || name.endsWith('_R')) {
      return name.slice(0, -2);
    }
    return name;
  }
}
