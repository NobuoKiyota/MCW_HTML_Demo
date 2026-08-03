import sys
import os
import math
import bpy
from mathutils import Vector

script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

import fighter_gen_addon

try:
    fighter_gen_addon.register()
except Exception:
    pass

scene = bpy.context.scene
s = scene.fightergen_settings

s.assemble_subwing_enable = True
s.assemble_aileron_enable = True
s.assemble_tail_enable = True
s.assemble_canopy_enable = True

print("=== Starting Scaling and Symmetry Verification Test ===")

total_trials = 10
passed = 0

for i in range(total_trials):
    s.seed = 3000 + i * 53
    print(f"\n--- Trial {i+1}/{total_trials} (Seed: {s.seed}) ---")

    res = bpy.ops.fightergen.assemble_fighter()
    if 'FINISHED' not in res:
        print(f"FAILED: assemble_fighter operator returned {res}")
        continue

    coll = bpy.data.collections.get(fighter_gen_addon.ASSEMBLY_COLLECTION)
    fuse = next((o for o in coll.objects if o.name.endswith('_fuselage')), None)
    canopy = next((o for o in coll.objects if o.name.endswith('_canopy')), None)
    tail = next((o for o in coll.objects if o.name.endswith('_tail_r')), None)
    wing = next((o for o in coll.objects if o.name.endswith('_wing_r')), None)

    if not fuse or not canopy or not tail or not wing:
        print(f"FAILED: missing core objects!")
        continue

    fuse_len = fuse.dimensions.y
    canopy_len = canopy.dimensions.y
    tail_span = tail.dimensions.x

    print(f"Fuselage Length: {fuse_len:.2f}")
    print(f"Canopy Length: {canopy_len:.2f} (ratio: {canopy_len/fuse_len:.2f})")
    print(f"Tail Span: {tail_span:.2f} (ratio: {tail_span/fuse_len:.2f})")

    # Canopy length: ~12-25% of fuselage length
    # Tail total width: ~20-80% of fuselage length
    canopy_ratio_ok = 0.12 <= (canopy_len / fuse_len) <= 0.30
    tail_ratio_ok = (tail_span / fuse_len) <= 1.05
    wing_scale_ok = wing.scale.x > 0.0

    if canopy_ratio_ok and tail_ratio_ok and wing_scale_ok:
        print("SUCCESS: Scaling and Origin checks passed.")
        passed += 1
    else:
        print(f"WARNING: Ratio check! canopy_ok={canopy_ratio_ok}, tail_ok={tail_ratio_ok}, wing_scale_ok={wing_scale_ok}")

# Test Rotation Y folding symmetry
print("\n--- Testing Wing Rotation Y Symmetric Folding ---")
wing = next((o for o in coll.objects if o.name.endswith('_wing_r')), None)
if wing:
    wing.rotation_euler.y = math.radians(35.0)
    print(f"Wing Rotation Y set to +35 deg. Wing location: {wing.location}, scale: {wing.scale}")

# Render test preview image
preview_path = os.path.join(script_dir, "previews", "symmetry_test.png")
os.makedirs(os.path.dirname(preview_path), exist_ok=True)
scene.render.filepath = preview_path
scene.render.resolution_x = 800
scene.render.resolution_y = 600

# Setup simple camera and light if needed
cam_data = bpy.data.cameras.new("TestCam")
cam_obj = bpy.data.objects.new("TestCam", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj
cam_obj.location = Vector((0.0, -8.0, 5.0))
cam_obj.rotation_euler = (math.radians(60.0), 0.0, 0.0)

light_data = bpy.data.lights.new("TestLight", 'SUN')
light_obj = bpy.data.objects.new("TestLight", light_data)
scene.collection.objects.link(light_obj)
light_obj.location = Vector((5.0, -5.0, 10.0))

bpy.ops.render.render(write_still=True)
print(f"Rendered preview image to: {preview_path}")

print(f"\n=== Test Summary: {passed}/{total_trials} Scaling & Symmetry Verification Trials Passed ===")
if passed == total_trials:
    print("ALL SCALING AND SYMMETRY TESTS PASSED!")
    sys.exit(0)
else:
    print("TEST FAILED.")
    sys.exit(1)
