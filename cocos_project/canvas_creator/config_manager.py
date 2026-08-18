import os
import json

CONFIG_FILE = "config.json"

DEFAULT_CONFIG = {
    "size_w": 512,
    "size_h": 512,
    "global_style": "Ink",
    "invert_enabled": False,
    "sides_count": 4,
    "parts": {
        "4Corners": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0},
        "4CornersDec": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0},
        "4Sides": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0},
        "4SidesDec": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0},
        "Center": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0},
        "CenterDec": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0},
        "Center2": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0},
        "Center2Dec": {"visible": True, "keep": False, "genre": "Geometry", "pattern": "P1", "style": "Ink", "intensity": 0.5, "range": 1.0}
    },
    "effects": {
        "hologram_enabled": False,
        "hologram_intensity": 0.5,
        "smooth_enabled": False,
        "smooth_intensity": 0.5,
        "kaleidoscope_enabled": False,
        "kaleidoscope_divisions": 8,
        "sharp_enabled": False,
        "sharp_intensity": 0.5,
        "ripple_enabled": False,
        "ripple_intensity": 0.5,
        "glow_enabled": False,
        "glow_intensity": 0.5,
        "metal_enabled": False,
        "metal_intensity": 0.5,
        "chromatic_enabled": False,
        "chromatic_intensity": 0.5,
        "white_balance_enabled": False,
        "white_balance_intensity": 0.5,
        "vignette_enabled": False,
        "vignette_intensity": 0.5,
        "bleed_enabled": False,
        "bleed_intensity": 0.5,
        "illust_enabled": False,
        "illust_intensity": 0.5
    }
}

def load_config():
    """Load config from config.json, returning defaults if not exists or invalid."""
    if not os.path.exists(CONFIG_FILE):
        return DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            
            # Merge with default config to ensure all keys exist (schema migration safety)
            merged = DEFAULT_CONFIG.copy()
            for key in DEFAULT_CONFIG:
                if key in data:
                    if isinstance(DEFAULT_CONFIG[key], dict) and isinstance(data[key], dict):
                        sub_merged = DEFAULT_CONFIG[key].copy()
                        if key == "parts":
                            for part_name, part_defaults in DEFAULT_CONFIG[key].items():
                                part_data = data[key].get(part_name, {})
                                part_merged = part_defaults.copy()
                                part_merged.update(part_data)
                                sub_merged[part_name] = part_merged
                        else:
                            sub_merged.update(data[key])
                        merged[key] = sub_merged
                    else:
                        merged[key] = data[key]
            return merged
    except Exception as e:
        print(f"Error loading config: {e}. Using defaults.")
        return DEFAULT_CONFIG.copy()

def save_config(config_data):
    """Save config to config.json."""
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving config: {e}")
