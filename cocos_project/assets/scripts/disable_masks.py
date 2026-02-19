import json

def disable_masks(scene_path):
    with open(scene_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    count = 0
    for obj in data:
        if isinstance(obj, dict) and obj.get("__type__") == "cc.Mask":
            obj["_enabled"] = False
            count += 1
    
    if count > 0:
        with open(scene_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Disabled {count} Mask components.")
    else:
        print("No Mask components found.")

if __name__ == "__main__":
    disable_masks("d:/ITANHTMl/cocos_project/assets/Scences/scene-Title.scene")
