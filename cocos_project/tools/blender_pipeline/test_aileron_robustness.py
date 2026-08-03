import sys
import os
import bpy

# Ensure current directory is in path
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

import fighter_gen_addon

# Register addon if needed
try:
    fighter_gen_addon.register()
except Exception:
    pass

scene = bpy.context.scene
s = scene.fightergen_settings

# Enable assembly options including subwing and ailerons
s.assemble_subwing_enable = True
s.assemble_aileron_enable = True

# Extreme parameters for testing robustness under heavy Twist/Taper/Sweep
s.use_twist = True
s.twist_angle_min = 45.0
s.twist_angle_max = 90.0

s.use_taper = True
s.taper_factor_min = -0.8
s.taper_factor_max = -0.4

s.wing_sweep_min = 10.0
s.wing_sweep_max = 45.0
s.wing_dihedral_min = -15.0
s.wing_dihedral_max = 25.0

print("=== Starting Aileron Attachment Robustness Test ===")

preview_dir = os.path.join(script_dir, "previews")
os.makedirs(preview_dir, exist_ok=True)

success_count = 0
total_trials = 10

for i in range(total_trials):
    s.seed = 1000 + i * 37
    print(f"\n--- Testing Trial {i+1}/{total_trials} (Seed: {s.seed}) ---")
    
    # Run assemble operator
    res = bpy.ops.fightergen.assemble_fighter()
    if 'FINISHED' not in res:
        print(f"FAILED: assemble_fighter operator returned {res}")
        continue

    coll = bpy.data.collections.get(fighter_gen_addon.ASSEMBLY_COLLECTION)
    if not coll:
        print("FAILED: Assembly collection not found!")
        continue

    obj_names = [o.name for o in coll.objects]
    print(f"Generated objects: {obj_names}")

    # Verify main wing aileron
    has_main_aileron = any('_wing_aileron_r' in name for name in obj_names)
    has_sub_aileron = any('_subwing_aileron_r' in name for name in obj_names)

    if has_main_aileron and has_sub_aileron:
        print(f"SUCCESS: Trial {i+1} generated both main-wing and sub-wing ailerons correctly.")
        success_count += 1
    else:
        print(f"WARNING: Trial {i+1} missing aileron object! main={has_main_aileron}, sub={has_sub_aileron}")

print(f"\n=== Test Summary: {success_count}/{total_trials} Trials Passed Successfully ===")
if success_count == total_trials:
    print("ALL AILERON ROBUSTNESS TESTS PASSED!")
    sys.exit(0)
else:
    print(f"TEST FAILED: Only {success_count}/{total_trials} passed.")
    sys.exit(1)
