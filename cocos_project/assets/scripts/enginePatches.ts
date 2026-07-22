// This module applies runtime patches to engine classes to prevent known editor/preview
// errors such as "Cannot read properties of null (reading '_uiProps')" or "reading 'emit'".
// Because this script is imported at module load time, the patch applies even during 
// editor preview, before any component onLoad runs.

import { Sprite } from 'cc';

// Immediately execute patch
(function applySpritePatches() {
    try {
        const proto: any = Sprite.prototype as any;
        if (!proto.__patched_v2) {
            // Guard _applySrpiteSize and _applySpriteFrame
            const origSize = proto._applySpriteSize;
            proto._applySpriteSize = function () {
                if (!this || !this._uiProps || !this.node) return;
                return origSize.apply(this, arguments);
            };

            const origFrame = proto._applySpriteFrame;
            proto._applySpriteFrame = function () {
                if (!this || !this._uiProps || !this.node) return;
                return origFrame.apply(this, arguments);
            };

            // Patch spriteFrame setter to prevent emit of null error
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'spriteFrame');
            if (descriptor && descriptor.set) {
                const originalSetter = descriptor.set;
                descriptor.set = function (value) {
                    // If node is null or not fully initialized, the engine's internal call 
                    // to this.node.emit will fail. We skip the setup if node is missing.
                    if (!this.node) {
                        // Just store the value internally if possible, or skip
                        this._spriteFrame = value;
                        return;
                    }
                    return originalSetter.call(this, value);
                };
                Object.defineProperty(proto, 'spriteFrame', descriptor);
                console.log("[enginePatches] Sprite.spriteFrame setter guarded.");
            }

            proto.__patched_v2 = true;
            console.log("[enginePatches] Sprite prototype patched (uiProps + emit guards)");
        }
    } catch (e) {
        console.warn("[enginePatches] failed to patch Sprite prototype", e);
    }
})();
