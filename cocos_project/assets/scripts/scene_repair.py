import json

def repair_scene(scene_path):
    with open(scene_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 1. Build a map of parent -> children based on the "_parent" property
    parent_to_actual_children = {}
    for i, obj in enumerate(data):
        if isinstance(obj, dict) and "_parent" in obj and obj["_parent"]:
            parent_id = obj["_parent"].get("__id__")
            if parent_id is not None:
                if parent_id not in parent_to_actual_children:
                    parent_to_actual_children[parent_id] = []
                parent_to_actual_children[parent_id].append({ "__id__": i })

    # 2. Update the "_children" property of every node to match the actual children found
    fixed_count = 0
    for i, obj in enumerate(data):
        if isinstance(obj, dict) and "__type__" == "cc.Node" or (isinstance(obj, dict) and "_children" in obj):
            actual_children = parent_to_actual_children.get(i, [])
            # Only update if there's a mismatch (to be safe)
            current_children = obj.get("_children", [])
            
            # Cocos Creator sometimes has specific orders, but usually we just want them all there.
            # If our collected children differ from current children, update it.
            if len(actual_children) != len(current_children):
                obj["_children"] = actual_children
                fixed_count += 1
                name = obj.get("_name", "Unknown")
                print(f"Fixed children for node [{i}] ({name}): {len(current_children)} -> {len(actual_children)}")

    if fixed_count > 0:
        with open(scene_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Repair complete. Fixed {fixed_count} nodes.")
    else:
        print("No mismatches found.")

if __name__ == "__main__":
    repair_scene("d:/ITANHTMl/cocos_project/assets/Scences/scene-Title.scene")
