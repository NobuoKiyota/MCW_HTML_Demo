import json
import os

def scan_mask_conflicts(root_dir):
    print(f"Scanning for Mask conflicts in {root_dir}...")
    conflicts = []
    
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.scene') or file.endswith('.prefab'):
                full_path = os.path.join(root, file).replace("\\", "/")
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    if not isinstance(data, list): continue
                    
                    # 1. Map components to nodes
                    node_to_comps = {}
                    node_id_to_name = {}
                    
                    for i, obj in enumerate(data):
                        if not isinstance(obj, dict): continue
                        
                        # Identify Nodes
                        if obj.get("__type__") == "cc.Node":
                            node_id_to_name[i] = obj.get("_name", "Unknown")
                            node_to_comps[i] = []
                        
                        # Identify Components
                        node_ref = obj.get("node")
                        if node_ref and "__id__" in node_ref:
                            nid = node_ref["__id__"]
                            if nid in node_to_comps:
                                node_to_comps[nid].append(obj.get("__type__"))
                                
                    # 2. Check for conflicts
                    # Conflict: Mask + (Sprite or Label or Graphics or anything that adds its own renderer)
                    renderers = ["cc.Sprite", "cc.Label", "cc.Graphics", "cc.RichText"]
                    
                    for nid, comps in node_to_comps.items():
                        if "cc.Mask" in comps:
                            found_renderers = [c for c in comps if c in renderers]
                            if found_renderers:
                                conflicts.append({
                                    "file": full_path,
                                    "node": node_id_to_name.get(nid, "Unknown"),
                                    "components": comps
                                })
                                
                except Exception as e:
                    # print(f"Error reading {file}: {e}")
                    pass

    return conflicts

if __name__ == "__main__":
    results = scan_mask_conflicts("d:/ITANHTMl/cocos_project/assets")
    if not results:
        print("No Mask conflicts found!")
    else:
        print(f"\nFound {len(results)} potential Mask conflicts:")
        for r in results:
            print(f"- File: {r['file']}")
            print(f"  Node: {r['node']}")
            print(f"  Comps: {', '.join(r['components'])}")
