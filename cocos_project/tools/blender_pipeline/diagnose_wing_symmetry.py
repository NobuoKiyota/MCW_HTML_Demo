"""
3Dビューでの確認: 翼の左右対称性を複数アングルからレンダリング
"""
import sys, os, math
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

s.assemble_subwing_enable = False
s.assemble_aileron_enable = False
s.assemble_tail_enable = True
s.assemble_canopy_enable = False
s.use_bend = False
s.use_twist = False
s.use_taper = False
s.use_remesh = False
s.use_solidify = False
s.seed = 777

print("=== Testing wing shape and tail ===")
bpy.ops.fightergen.assemble_fighter()

coll = bpy.data.collections.get(fighter_gen_addon.ASSEMBLY_COLLECTION)
fuse = next((o for o in coll.objects if o.name.endswith('_fuselage')), None)
wing = next((o for o in coll.objects if o.name.endswith('_wing_r')), None)
tail = next((o for o in coll.objects if o.name.endswith('_tail_r')), None)

print(f"Fuselage: dims={fuse.dimensions if fuse else 'N/A'}")
if wing:
    print(f"Wing: dims={wing.dimensions}")
    xs = [v.co.x for v in wing.data.vertices]
    print(f"Wing vertex X: {min(xs):.3f} .. {max(xs):.3f}  (should be symmetric ±)")
if tail:
    print(f"Tail: dims={tail.dimensions}")
    print(f"  Modifiers: {[m.name for m in tail.modifiers]}")

fuse_len = fuse.dimensions.y if fuse else 4.0
cam_data = bpy.data.cameras.new("TestCam")
cam_obj = bpy.data.objects.new("TestCam", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj
light_data = bpy.data.lights.new("TestLight", 'SUN')
light_obj = bpy.data.objects.new("TestLight", light_data)
scene.collection.objects.link(light_obj)
light_obj.location = (3, -3, 8)

scene.render.resolution_x = 1280
scene.render.resolution_y = 720
os.makedirs(os.path.join(script_dir, "previews"), exist_ok=True)

# TOP view: see wing symmetry
cam_obj.location = (0, 0, fuse_len * 2.0)
cam_obj.rotation_euler = (0, 0, 0)
scene.render.filepath = os.path.join(script_dir, "previews", "sym_top.png")
bpy.ops.render.render(write_still=True)

# ISOMETRIC-style from front-left
cam_obj.location = (fuse_len * 1.0, -fuse_len * 1.2, fuse_len * 0.8)
cam_obj.rotation_euler = (math.radians(65), 0, math.radians(-30))
scene.render.filepath = os.path.join(script_dir, "previews", "sym_iso.png")
bpy.ops.render.render(write_still=True)

# FRONT view
cam_obj.location = (0, -fuse_len * 1.5, fuse_len * 0.2)
cam_obj.rotation_euler = (math.radians(90), 0, 0)
scene.render.filepath = os.path.join(script_dir, "previews", "sym_front.png")
bpy.ops.render.render(write_still=True)

print(f"Rendered to previews/sym_*.png")
print("\n=== Done ===")
sys.exit(0)
