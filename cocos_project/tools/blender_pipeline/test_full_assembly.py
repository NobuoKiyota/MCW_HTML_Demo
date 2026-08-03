import sys
import os
import bpy

# Ensure script directory is in path
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

# Enable all assembly options
s.assemble_subwing_enable = True
s.assemble_aileron_enable = True
s.assemble_tail_enable = True
s.assemble_canopy_enable = True

print("=== Starting Full Assembly (Wings + Tails + Canopy) Test ===")

success_count = 0
total_trials = 10

for i in range(total_trials):
    s.seed = 2000 + i * 43
    print(f"\n--- Testing Full Assembly Trial {i+1}/{total_trials} (Seed: {s.seed}) ---")

    res = bpy.ops.fightergen.assemble_fighter()
    if 'FINISHED' not in res:
        print(f"FAILED: assemble_fighter returned {res}")
        continue

    coll = bpy.data.collections.get(fighter_gen_addon.ASSEMBLY_COLLECTION)
    if not coll:
        print("FAILED: Assembly collection not found!")
        continue

    obj_names = [o.name for o in coll.objects]
    print(f"Generated objects: {obj_names}")

    has_fuse = any('_fuselage' in name for name in obj_names)
    has_wing = any('_wing_r' in name for name in obj_names)
    has_sub = any('_subwing_r' in name for name in obj_names)
    has_aileron = any('_wing_aileron_r' in name for name in obj_names)
    has_tail = any('_tail_r' in name for name in obj_names)
    has_canopy = any('_canopy' in name for name in obj_names)

    if all([has_fuse, has_wing, has_sub, has_aileron, has_tail, has_canopy]):
        print(f"SUCCESS: Trial {i+1} generated full ship parts correctly.")
        success_count += 1
    else:
        print(f"WARNING: Trial {i+1} missing parts! fuse={has_fuse}, wing={has_wing}, sub={has_sub}, aileron={has_aileron}, tail={has_tail}, canopy={has_canopy}")

# Test Reroll Operators
print("\n--- Testing Reroll Operators ---")
res_tail = bpy.ops.fightergen.reroll_tail()
res_canopy = bpy.ops.fightergen.reroll_canopy()
print(f"Reroll Tail result: {res_tail}, Reroll Canopy result: {res_canopy}")

print(f"\n=== Test Summary: {success_count}/{total_trials} Full Assembly Trials Passed ===")
if success_count == total_trials and 'FINISHED' in res_tail and 'FINISHED' in res_canopy:
    print("ALL FULL ASSEMBLY TESTS PASSED SUCCESSFULLY!")
    sys.exit(0)
else:
    print(f"TEST FAILED: {success_count}/{total_trials} passed.")
    sys.exit(1)
