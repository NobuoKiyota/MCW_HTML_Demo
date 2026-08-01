import bpy
import os
import sys

# Load the local script directly
script_path = r"z:\HTMLShooterCocos\cocos_project\tools\blender_pipeline\fighter_gen_addon.py"
with open(script_path, 'r', encoding='utf-8') as f:
    exec(f.read(), globals())

# Register classes if needed
try:
    register()
except Exception as e:
    print(f"Register note: {e}")

def generate_all_categories():
    scene = bpy.context.scene
    s = scene.fightergen_settings
    s.export_glb = True
    s.variant_count = 6  # Generate 6 unique variants for each category

    categories = [
        ('FUSELAGE', 'fuselage'),
        ('WINGS', 'wings'),
        ('ENGINES', 'engines'),
        ('CANOPY', 'canopy'),
        ('TAILS', 'tails'),
        ('WEAPONS', 'weapons')
    ]

    for part_enum, folder_name in categories:
        s.part_type = part_enum
        print(f"================ GENERATING {part_enum} ================")
        
        if part_enum == 'WEAPONS':
            for wp_type in ['CANNON', 'GATLING', 'RAILGUN']:
                s.wp_type = wp_type
                s.name_prefix = f"Weapons_{wp_type.capitalize()}"
                bpy.ops.fightergen.generate_variants()
        else:
            s.name_prefix = f"{folder_name.capitalize()}"
            bpy.ops.fightergen.generate_variants()

    print("================ ALL PARTS BATCH GENERATED SUCCESSFULLY ================")

if __name__ == '__main__':
    generate_all_categories()
