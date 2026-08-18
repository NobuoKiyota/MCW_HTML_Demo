import os
import random
import datetime
import tkinter as tk
from tkinter import messagebox
import customtkinter as ctk
from PIL import Image
import numpy as np
import cv2

from config_manager import load_config, save_config
from preview_canvas import PreviewCanvas
from effects import apply_all_effects
from frame_generator import generate_frame_composite
from history_manager import HistoryManager

# Set standard aesthetics
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

class FrameGeneratorApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("White-Black Frame Generator")
        self.geometry("1100x900")
        self.minsize(980, 800)
        
        # Load config
        self.config = load_config()
        
        # Setup history manager
        self.history = HistoryManager()
        
        # Current active preview image (original PIL) and render image
        self.base_pil_image = None
        self.final_pil_image = None
        
        # Parts list
        self.part_names = [
            "4Corners", "4CornersDec", "4Sides", "4SidesDec", 
            "Center", "CenterDec", "Center2", "Center2Dec"
        ]
        self.genres = ["Geometry", "SF", "Fantasy", "Steampunk", "Japanese", "Gothic", "Organic", "Baroque"]
        self.patterns = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"]
        self.styles = ["Ink", "Dot", "Spray", "Sketch", "Neon"]
        
        # Build UI
        self.create_widgets()
        
        # Bind close event
        self.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        # Bind Undo/Redo global keyboard shortcuts
        self.bind("<Control-z>", lambda e: self.trigger_undo())
        self.bind("<Control-y>", lambda e: self.trigger_redo())
        
        # Generate initial frame
        self.update_generator()
        
    def create_widgets(self):
        # Master grid configuration:
        # Row 0: Top Operation Panel (fixed size, collapse prevention)
        # Row 1: Preview Canvas (expands to fill vertical space)
        self.grid_rowconfigure(0, weight=0)
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)
        
        # =========================================================================
        # 1. TOP OPERATION PANEL
        # =========================================================================
        self.top_panel = ctk.CTkFrame(self, fg_color="#1e1e1e", corner_radius=0)
        self.top_panel.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)
        
        # Inner padding for top panel
        self.top_panel.grid_columnconfigure(0, weight=1)
        
        # --- Row 1.1: Size Setting and Global Style ---
        self.settings_bar = ctk.CTkFrame(self.top_panel, fg_color="transparent")
        self.settings_bar.grid(row=0, column=0, sticky="ew", padx=10, pady=5)
        
        ctk.CTkLabel(self.settings_bar, text="Size W:", font=("Arial", 12, "bold")).pack(side=tk.LEFT, padx=(5, 2))
        self.ent_w = ctk.CTkEntry(self.settings_bar, width=60, height=25)
        self.ent_w.insert(0, str(self.config["size_w"]))
        self.ent_w.pack(side=tk.LEFT, padx=2)
        self.ent_w.bind("<FocusOut>", self.on_size_changed)
        self.ent_w.bind("<Return>", self.on_size_changed)
        
        ctk.CTkLabel(self.settings_bar, text="H:", font=("Arial", 12, "bold")).pack(side=tk.LEFT, padx=(8, 2))
        self.ent_h = ctk.CTkEntry(self.settings_bar, width=60, height=25)
        self.ent_h.insert(0, str(self.config["size_h"]))
        self.ent_h.pack(side=tk.LEFT, padx=2)
        self.ent_h.bind("<FocusOut>", self.on_size_changed)
        self.ent_h.bind("<Return>", self.on_size_changed)
        
        ctk.CTkLabel(self.settings_bar, text=" |  Global Style:", font=("Arial", 12, "bold")).pack(side=tk.LEFT, padx=(15, 2))
        self.cb_global_style = ctk.CTkOptionMenu(
            self.settings_bar, 
            values=self.styles, 
            width=90, 
            height=25,
            command=self.on_global_style_changed
        )
        self.cb_global_style.set(self.config.get("global_style", "Ink"))
        self.cb_global_style.pack(side=tk.LEFT, padx=2)
        
        # Invert Checkbox
        self.var_invert = tk.BooleanVar(value=self.config.get("invert_enabled", False))
        self.chk_invert = ctk.CTkCheckBox(
            self.settings_bar, 
            text="Invert Color", 
            variable=self.var_invert,
            font=("Arial", 12, "bold"),
            width=100,
            checkbox_width=16,
            checkbox_height=16,
            command=self.on_invert_changed
        )
        self.chk_invert.pack(side=tk.LEFT, padx=(15, 2))
        
        # Sides Count
        self.var_sides = tk.StringVar(value=str(self.config.get("sides_count", 4)))
        ctk.CTkLabel(self.settings_bar, text=" |  Sides:", font=("Arial", 12, "bold")).pack(side=tk.LEFT, padx=(15, 2))
        self.cb_sides = ctk.CTkOptionMenu(
            self.settings_bar, 
            values=["3", "4", "5", "6"], 
            width=60, 
            height=25,
            command=self.on_sides_changed
        )
        self.cb_sides.set(str(self.config.get("sides_count", 4)))
        self.cb_sides.pack(side=tk.LEFT, padx=2)
        
        # --- Row 1.2: Parts Grid (8 rows of controls) ---
        self.parts_frame = ctk.CTkFrame(self.top_panel, fg_color="#2b2b2b", corner_radius=6)
        self.parts_frame.grid(row=1, column=0, sticky="ew", padx=10, pady=5)
        
        # Columns configuration inside parts frame to keep clean alignment
        self.parts_frame.grid_columnconfigure(6, weight=1) # Intensity slider takes extra space
        self.parts_frame.grid_columnconfigure(7, weight=1) # Range slider takes extra space
        
        # Grid Header Row for clarity
        headers = [
            ("On/Off", 0, 45, "center"),
            ("Keep", 1, 35, "center"),
            ("Part Name", 2, 95, "w"),
            ("Genre", 3, 95, "w"),
            ("Pattern", 4, 55, "w"),
            ("Style", 5, 75, "w"),
            ("Intensity", 6, 120, "center"),
            ("Range", 7, 120, "center"),
            ("Gacha", 8, 45, "center")
        ]
        
        # Header Row index is 0, parts start at index 1
        for text, col, min_w, anchor in headers:
            self.parts_frame.grid_columnconfigure(col, minsize=min_w)
            
        self.part_widgets = {}
        for idx, part in enumerate(self.part_names):
            row_idx = idx
            part_cfg = self.config["parts"][part]
            
            # 0. Visible Checkbox (On/Off)
            var_visible = tk.BooleanVar(value=part_cfg.get("visible", True))
            chk_visible = ctk.CTkCheckBox(
                self.parts_frame, 
                text="", 
                variable=var_visible, 
                width=18, 
                checkbox_width=18, 
                checkbox_height=18,
                command=lambda p=part: self.on_part_widget_changed(p, "visible")
            )
            chk_visible.grid(row=row_idx, column=0, padx=(8, 2), pady=2)
            
            # 1. Keep Checkbox
            var_keep = tk.BooleanVar(value=part_cfg.get("keep", False))
            chk_keep = ctk.CTkCheckBox(
                self.parts_frame, 
                text="", 
                variable=var_keep, 
                width=18, 
                checkbox_width=18, 
                checkbox_height=18,
                command=lambda p=part: self.on_part_widget_changed(p, "keep")
            )
            chk_keep.grid(row=row_idx, column=1, padx=2, pady=2)
            
            # 2. Part Label
            lbl_name = ctk.CTkLabel(self.parts_frame, text=part, font=("Arial", 12, "bold"), width=95, anchor="w")
            lbl_name.grid(row=row_idx, column=2, padx=2, pady=2, sticky="w")
            
            # 3. Genre Dropdown
            cb_genre = ctk.CTkOptionMenu(
                self.parts_frame, 
                values=self.genres, 
                width=90, 
                height=22,
                font=("Arial", 11),
                command=lambda val, p=part: self.on_part_widget_changed(p, "genre", val)
            )
            cb_genre.set(part_cfg.get("genre", "Geometry"))
            cb_genre.grid(row=row_idx, column=3, padx=2, pady=2, sticky="w")
            
            # 4. Pattern Dropdown
            cb_pattern = ctk.CTkOptionMenu(
                self.parts_frame,
                values=self.patterns,
                width=50,
                height=22,
                font=("Arial", 11),
                command=lambda val, p=part: self.on_part_widget_changed(p, "pattern", val)
            )
            cb_pattern.set(part_cfg.get("pattern", "P1"))
            cb_pattern.grid(row=row_idx, column=4, padx=2, pady=2, sticky="w")
            
            # 5. Style Dropdown
            cb_style = ctk.CTkOptionMenu(
                self.parts_frame, 
                values=self.styles, 
                width=70, 
                height=22,
                font=("Arial", 11),
                command=lambda val, p=part: self.on_part_widget_changed(p, "style", val)
            )
            cb_style.set(part_cfg.get("style", "Ink"))
            cb_style.grid(row=row_idx, column=5, padx=2, pady=2, sticky="w")
            
            # 6. Intensity Slider Group (Slider + Label)
            intensity_frame = ctk.CTkFrame(self.parts_frame, fg_color="transparent")
            intensity_frame.grid(row=row_idx, column=6, padx=4, pady=2, sticky="ew")
            intensity_frame.grid_columnconfigure(0, weight=1)
            
            val_intensity = part_cfg.get("intensity", 0.5)
            slider_intensity = ctk.CTkSlider(
                intensity_frame, 
                from_=0.0, 
                to=1.0, 
                number_of_steps=100, 
                height=15,
                command=lambda val, p=part: self.on_slider_move(p, "intensity", val)
            )
            slider_intensity.set(val_intensity)
            slider_intensity.grid(row=0, column=0, sticky="ew", padx=(2, 4))
            slider_intensity.bind("<ButtonRelease-1>", lambda e, p=part: self.on_slider_release(p))
            
            lbl_intensity = ctk.CTkLabel(intensity_frame, text=f"I:{int(val_intensity*100)}%", font=("Arial", 10), width=35, anchor="e")
            lbl_intensity.grid(row=0, column=1, sticky="e", padx=(0, 2))
            
            # 7. Range Slider Group
            range_frame = ctk.CTkFrame(self.parts_frame, fg_color="transparent")
            range_frame.grid(row=row_idx, column=7, padx=4, pady=2, sticky="ew")
            range_frame.grid_columnconfigure(0, weight=1)
            
            val_range = part_cfg.get("range", 1.0)
            slider_range = ctk.CTkSlider(
                range_frame,
                from_=0.1,
                to=1.5,
                number_of_steps=140,
                height=15,
                command=lambda val, p=part: self.on_slider_move(p, "range", val)
            )
            slider_range.set(val_range)
            slider_range.grid(row=0, column=0, sticky="ew", padx=(2, 4))
            slider_range.bind("<ButtonRelease-1>", lambda e, p=part: self.on_slider_release(p))
            
            lbl_range = ctk.CTkLabel(range_frame, text=f"R:{int(val_range*100)}%", font=("Arial", 10), width=38, anchor="e")
            lbl_range.grid(row=0, column=1, sticky="e", padx=(0, 2))
            
            # 8. Part Individual Gacha Button
            btn_gacha = ctk.CTkButton(
                self.parts_frame,
                text="🎲",
                width=24,
                height=22,
                font=("Arial", 11),
                fg_color="#34495e",
                hover_color="#5d6d7e",
                command=lambda p=part: self.trigger_gacha_part(p)
            )
            btn_gacha.grid(row=row_idx, column=8, padx=(2, 8), pady=2)
            
            self.part_widgets[part] = {
                "var_visible": var_visible,
                "chk_visible": chk_visible,
                "var_keep": var_keep,
                "chk_keep": chk_keep,
                "cb_genre": cb_genre,
                "cb_pattern": cb_pattern,
                "cb_style": cb_style,
                "slider_intensity": slider_intensity,
                "lbl_intensity": lbl_intensity,
                "slider_range": slider_range,
                "lbl_range": lbl_range,
                "btn_gacha": btn_gacha
            }
            
        # --- Row 1.3: Effects Panel (Grid structure for 3 rows of effects) ---
        self.effects_frame = ctk.CTkFrame(self.top_panel, fg_color="#2b2b2b", corner_radius=6)
        self.effects_frame.grid(row=2, column=0, sticky="ew", padx=10, pady=5)
        
        for col in range(4):
            self.effects_frame.grid_columnconfigure(col, weight=1)
            
        eff_cfg = self.config["effects"]
        
        def build_eff_subframe(parent, text, var, slider_attr, val, toggle_cmd, slider_cmd, release_cmd, r, c):
            sub = ctk.CTkFrame(parent, fg_color="transparent")
            sub.grid(row=r, column=c, padx=8, pady=4, sticky="ew")
            sub.grid_columnconfigure(1, weight=1)
            
            chk = ctk.CTkCheckBox(
                sub, text=text, variable=var,
                font=("Arial", 11, "bold"), width=90, checkbox_width=16, checkbox_height=16,
                command=toggle_cmd
            )
            chk.grid(row=0, column=0, sticky="w", padx=(2, 4))
            
            slider = ctk.CTkSlider(
                sub, from_=0.0, to=1.0, height=12,
                command=slider_cmd
            )
            slider.set(val)
            slider.grid(row=0, column=1, sticky="ew", padx=(4, 2))
            slider.bind("<ButtonRelease-1>", release_cmd)
            
            return chk, slider

        # Row 0: Hologram, Smooth, Kaleido, Sharp
        self.var_hologram = tk.BooleanVar(value=eff_cfg.get("hologram_enabled", False))
        self.chk_hologram, self.slider_hologram = build_eff_subframe(
            self.effects_frame, "Hologram", self.var_hologram, "hologram_intensity", eff_cfg.get("hologram_intensity", 0.5),
            lambda: self.on_effect_widget_changed("hologram_enabled"),
            lambda val: self.on_effect_slider_move("hologram_intensity", val),
            lambda e: self.on_effect_slider_release("hologram_intensity"),
            0, 0
        )
        
        self.var_smooth = tk.BooleanVar(value=eff_cfg.get("smooth_enabled", False))
        self.chk_smooth, self.slider_smooth = build_eff_subframe(
            self.effects_frame, "Smooth", self.var_smooth, "smooth_intensity", eff_cfg.get("smooth_intensity", 0.5),
            lambda: self.on_effect_widget_changed("smooth_enabled"),
            lambda val: self.on_effect_slider_move("smooth_intensity", val),
            lambda e: self.on_effect_slider_release("smooth_intensity"),
            0, 1
        )
        
        sub_kaleido = ctk.CTkFrame(self.effects_frame, fg_color="transparent")
        sub_kaleido.grid(row=0, column=2, padx=8, pady=4, sticky="ew")
        sub_kaleido.grid_columnconfigure(1, weight=1)
        
        self.var_kaleido = tk.BooleanVar(value=eff_cfg["kaleidoscope_enabled"])
        self.chk_kaleido = ctk.CTkCheckBox(
            sub_kaleido, text="Kaleido", variable=self.var_kaleido,
            font=("Arial", 11, "bold"), width=85, checkbox_width=16, checkbox_height=16,
            command=lambda: self.on_effect_widget_changed("kaleidoscope_enabled")
        )
        self.chk_kaleido.grid(row=0, column=0, sticky="w", padx=(2, 4))
        
        # Kaleidoscope divisions: 2 to 20
        self.cb_kaleido_divs = ctk.CTkOptionMenu(
            sub_kaleido, values=[str(i) for i in range(2, 21)], height=22,
            font=("Arial", 11),
            command=lambda val: self.on_effect_widget_changed("kaleidoscope_divisions", int(val))
        )
        self.cb_kaleido_divs.set(str(eff_cfg["kaleidoscope_divisions"]))
        self.cb_kaleido_divs.grid(row=0, column=1, sticky="ew", padx=(4, 2))
        
        self.var_sharp = tk.BooleanVar(value=eff_cfg.get("sharp_enabled", False))
        self.chk_sharp, self.slider_sharp = build_eff_subframe(
            self.effects_frame, "Sharp", self.var_sharp, "sharp_intensity", eff_cfg.get("sharp_intensity", 0.5),
            lambda: self.on_effect_widget_changed("sharp_enabled"),
            lambda val: self.on_effect_slider_move("sharp_intensity", val),
            lambda e: self.on_effect_slider_release("sharp_intensity"),
            0, 3
        )
        
        # Row 1: Ripple, Glow, Metal, Chromatic (RGB Split)
        self.var_ripple = tk.BooleanVar(value=eff_cfg.get("ripple_enabled", False))
        self.chk_ripple, self.slider_ripple = build_eff_subframe(
            self.effects_frame, "Ripple", self.var_ripple, "ripple_intensity", eff_cfg.get("ripple_intensity", 0.5),
            lambda: self.on_effect_widget_changed("ripple_enabled"),
            lambda val: self.on_effect_slider_move("ripple_intensity", val),
            lambda e: self.on_effect_slider_release("ripple_intensity"),
            1, 0
        )
        
        self.var_glow = tk.BooleanVar(value=eff_cfg.get("glow_enabled", False))
        self.chk_glow, self.slider_glow = build_eff_subframe(
            self.effects_frame, "Glow", self.var_glow, "glow_intensity", eff_cfg.get("glow_intensity", 0.5),
            lambda: self.on_effect_widget_changed("glow_enabled"),
            lambda val: self.on_effect_slider_move("glow_intensity", val),
            lambda e: self.on_effect_slider_release("glow_intensity"),
            1, 1
        )
        
        self.var_metal = tk.BooleanVar(value=eff_cfg.get("metal_enabled", False))
        self.chk_metal, self.slider_metal = build_eff_subframe(
            self.effects_frame, "Metallic", self.var_metal, "metal_intensity", eff_cfg.get("metal_intensity", 0.5),
            lambda: self.on_effect_widget_changed("metal_enabled"),
            lambda val: self.on_effect_slider_move("metal_intensity", val),
            lambda e: self.on_effect_slider_release("metal_intensity"),
            1, 2
        )
        
        self.var_chromatic = tk.BooleanVar(value=eff_cfg.get("chromatic_enabled", False))
        self.chk_chromatic, self.slider_chromatic = build_eff_subframe(
            self.effects_frame, "Chromatic", self.var_chromatic, "chromatic_intensity", eff_cfg.get("chromatic_intensity", 0.5),
            lambda: self.on_effect_widget_changed("chromatic_enabled"),
            lambda val: self.on_effect_slider_move("chromatic_intensity", val),
            lambda e: self.on_effect_slider_release("chromatic_intensity"),
            1, 3
        )

        # Row 2: White Balance, Vignette, Vector Bleed, Bilateral Illust
        self.var_white_balance = tk.BooleanVar(value=eff_cfg.get("white_balance_enabled", False))
        self.chk_white_balance, self.slider_white_balance = build_eff_subframe(
            self.effects_frame, "W.Balance", self.var_white_balance, "white_balance_intensity", eff_cfg.get("white_balance_intensity", 0.5),
            lambda: self.on_effect_widget_changed("white_balance_enabled"),
            lambda val: self.on_effect_slider_move("white_balance_intensity", val),
            lambda e: self.on_effect_slider_release("white_balance_intensity"),
            2, 0
        )
        
        self.var_vignette = tk.BooleanVar(value=eff_cfg.get("vignette_enabled", False))
        self.chk_vignette, self.slider_vignette = build_eff_subframe(
            self.effects_frame, "Vignette", self.var_vignette, "vignette_intensity", eff_cfg.get("vignette_intensity", 0.5),
            lambda: self.on_effect_widget_changed("vignette_enabled"),
            lambda val: self.on_effect_slider_move("vignette_intensity", val),
            lambda e: self.on_effect_slider_release("vignette_intensity"),
            2, 1
        )
        
        self.var_bleed = tk.BooleanVar(value=eff_cfg.get("bleed_enabled", False))
        self.chk_bleed, self.slider_bleed = build_eff_subframe(
            self.effects_frame, "V.Bleed", self.var_bleed, "bleed_intensity", eff_cfg.get("bleed_intensity", 0.5),
            lambda: self.on_effect_widget_changed("bleed_enabled"),
            lambda val: self.on_effect_slider_move("bleed_intensity", val),
            lambda e: self.on_effect_slider_release("bleed_intensity"),
            2, 2
        )
        
        self.var_illust = tk.BooleanVar(value=eff_cfg.get("illust_enabled", False))
        self.chk_illust, self.slider_illust = build_eff_subframe(
            self.effects_frame, "Illust", self.var_illust, "illust_intensity", eff_cfg.get("illust_intensity", 0.5),
            lambda: self.on_effect_widget_changed("illust_enabled"),
            lambda val: self.on_effect_slider_move("illust_intensity", val),
            lambda e: self.on_effect_slider_release("illust_intensity"),
            2, 3
        )
        
        # --- Row 1.4: Action Buttons ---
        self.actions_bar = ctk.CTkFrame(self.top_panel, fg_color="transparent")
        self.actions_bar.grid(row=3, column=0, sticky="ew", padx=10, pady=5)
        
        # Undo/Redo Buttons
        self.btn_undo = ctk.CTkButton(self.actions_bar, text="⤾ Undo (Ctrl+Z)", width=120, height=28, command=self.trigger_undo)
        self.btn_undo.pack(side=tk.LEFT, padx=2)
        
        self.btn_redo = ctk.CTkButton(self.actions_bar, text="⤿ Redo (Ctrl+Y)", width=120, height=28, command=self.trigger_redo)
        self.btn_redo.pack(side=tk.LEFT, padx=2)
        
        # Spacer
        ctk.CTkLabel(self.actions_bar, text="").pack(side=tk.LEFT, expand=True)
        
        # Gacha and Output Buttons
        self.btn_gacha_theme = ctk.CTkButton(
            self.actions_bar, text="🎲 Theme Gacha", 
            fg_color="#8e44ad", hover_color="#9b59b6", text_color="white",
            width=140, height=28, font=("Arial", 12, "bold"),
            command=self.trigger_gacha_theme
        )
        self.btn_gacha_theme.pack(side=tk.RIGHT, padx=(5, 5))

        self.btn_gacha = ctk.CTkButton(
            self.actions_bar, text="🎲 Gacha (Random)", 
            fg_color="#d35400", hover_color="#e67e22", text_color="white",
            width=120, height=28, font=("Arial", 12, "bold"),
            command=self.trigger_gacha
        )
        self.btn_gacha.pack(side=tk.RIGHT, padx=(10, 2))
        
        self.btn_output = ctk.CTkButton(
            self.actions_bar, text="💾 Save PNG (output/)", 
            fg_color="#27ae60", hover_color="#2ecc71", text_color="white",
            width=160, height=28, font=("Arial", 12, "bold"),
            command=self.trigger_output
        )
        self.btn_output.pack(side=tk.RIGHT, padx=2)
        
        self.update_undo_redo_buttons_state()
        
        # =========================================================================
        # 2. LOWER PREVIEW AREA
        # =========================================================================
        self.preview_area = PreviewCanvas(self)
        self.preview_area.grid(row=1, column=0, sticky="nsew", padx=10, pady=(5, 10))

    # =========================================================================
    # STATE AND COMPOSITING LOGIC
    # =========================================================================
    def update_generator(self):
        """Generates the base frame and applies all effects. Refreshes the preview canvas."""
        w = self.config["size_w"]
        h = self.config["size_h"]
        
        # 1. Procedural generation of base lines/geometry
        self.base_pil_image = generate_frame_composite(
            w, h, self.config["parts"], 
            sides_count=self.config.get("sides_count", 4)
        )
        
        # 2. Apply GIMP effects
        base_np = np.array(self.base_pil_image)
        base_bgr = cv2.cvtColor(base_np, cv2.COLOR_RGB2BGR)
        final_bgr = apply_all_effects(base_bgr, self.config["effects"])
        
        # Apply Invert Color if enabled
        if self.config.get("invert_enabled", False):
            final_bgr = cv2.bitwise_not(final_bgr)
            
        # Convert BGR back to RGB PIL
        final_rgb = cv2.cvtColor(final_bgr, cv2.COLOR_BGR2RGB)
        self.final_pil_image = Image.fromarray(final_rgb)
        
        # 3. Update preview canvas
        self.preview_area.set_image(self.final_pil_image)
        
    def push_to_history(self):
        """Safely push current state config to the history stack."""
        self.history.push_state(self.config)
        self.update_undo_redo_buttons_state()
        
    def update_undo_redo_buttons_state(self):
        # Enable/Disable buttons based on history stack status
        if self.history.can_undo():
            self.btn_undo.configure(state="normal")
        else:
            self.btn_undo.configure(state="disabled")
            
        if self.history.can_redo():
            self.btn_redo.configure(state="normal")
        else:
            self.btn_redo.configure(state="disabled")

    # =========================================================================
    # EVENT HANDLERS
    # =========================================================================
    def on_size_changed(self, event=None):
        try:
            w = int(self.ent_w.get())
            h = int(self.ent_h.get())
            if w <= 16 or h <= 16:
                raise ValueError("Size too small")
            if w > 4096 or h > 4096:
                raise ValueError("Size too large")
                
            if w != self.config["size_w"] or h != self.config["size_h"]:
                self.push_to_history()
                self.config["size_w"] = w
                self.config["size_h"] = h
                self.update_generator()
        except ValueError:
            # Revert UI to current configs
            self.ent_w.delete(0, tk.END)
            self.ent_w.insert(0, str(self.config["size_w"]))
            self.ent_h.delete(0, tk.END)
            self.ent_h.insert(0, str(self.config["size_h"]))
            
    def on_invert_changed(self):
        self.push_to_history()
        self.config["invert_enabled"] = self.var_invert.get()
        self.update_generator()

    def on_sides_changed(self, value):
        self.push_to_history()
        self.config["sides_count"] = int(value)
        self.update_generator()
            
    def on_global_style_changed(self, value):
        self.push_to_history()
        self.config["global_style"] = value
        
        # Apply global style to all non-kept parts
        for part in self.part_names:
            if not self.config["parts"][part]["keep"]:
                self.config["parts"][part]["style"] = value
                self.part_widgets[part]["cb_style"].set(value)
                
        self.update_generator()
        
    def on_part_widget_changed(self, part, widget_type, value=None):
        self.push_to_history()
        
        part_cfg = self.config["parts"][part]
        if widget_type == "visible":
            part_cfg["visible"] = self.part_widgets[part]["var_visible"].get()
        elif widget_type == "keep":
            part_cfg["keep"] = self.part_widgets[part]["var_keep"].get()
        elif widget_type == "genre":
            part_cfg["genre"] = value
        elif widget_type == "pattern":
            part_cfg["pattern"] = value
        elif widget_type == "style":
            part_cfg["style"] = value
            
        self.update_generator()
        
    def on_slider_move(self, part, slider_type, value):
        # Update configurations real-time
        self.config["parts"][part][slider_type] = float(value)
        
        # Update text labels
        if slider_type == "intensity":
            self.part_widgets[part]["lbl_intensity"].configure(text=f"I:{int(value * 100)}%")
        elif slider_type == "range":
            self.part_widgets[part]["lbl_range"].configure(text=f"R:{int(value * 100)}%")
            
        # Live refresh preview
        self.update_generator()
        
    def on_slider_release(self, part):
        self.push_to_history()

    def on_effect_widget_changed(self, setting_key, value=None):
        self.push_to_history()
        
        if setting_key == "hologram_enabled":
            self.config["effects"]["hologram_enabled"] = self.var_hologram.get()
        elif setting_key == "smooth_enabled":
            self.config["effects"]["smooth_enabled"] = self.var_smooth.get()
        elif setting_key == "kaleidoscope_enabled":
            self.config["effects"]["kaleidoscope_enabled"] = self.var_kaleido.get()
        elif setting_key == "kaleidoscope_divisions":
            self.config["effects"]["kaleidoscope_divisions"] = value
        elif setting_key == "sharp_enabled":
            self.config["effects"]["sharp_enabled"] = self.var_sharp.get()
        elif setting_key == "glow_enabled":
            self.config["effects"]["glow_enabled"] = self.var_glow.get()
        elif setting_key == "metal_enabled":
            self.config["effects"]["metal_enabled"] = self.var_metal.get()
        elif setting_key == "ripple_enabled":
            self.config["effects"]["ripple_enabled"] = self.var_ripple.get()
        elif setting_key == "chromatic_enabled":
            self.config["effects"]["chromatic_enabled"] = self.var_chromatic.get()
        elif setting_key == "white_balance_enabled":
            self.config["effects"]["white_balance_enabled"] = self.var_white_balance.get()
        elif setting_key == "vignette_enabled":
            self.config["effects"]["vignette_enabled"] = self.var_vignette.get()
        elif setting_key == "bleed_enabled":
            self.config["effects"]["bleed_enabled"] = self.var_bleed.get()
        elif setting_key == "illust_enabled":
            self.config["effects"]["illust_enabled"] = self.var_illust.get()
            
        self.update_generator()
        
    def on_effect_slider_move(self, setting_key, value):
        self.config["effects"][setting_key] = float(value)
        self.update_generator()
        
    def on_effect_slider_release(self, setting_key):
        self.push_to_history()

    # =========================================================================
    # ACTIONS
    # =========================================================================
    def trigger_undo(self):
        prev = self.history.undo(self.config)
        if prev:
            self.config = prev
            self.sync_ui_to_config()
            self.update_generator()
            self.update_undo_redo_buttons_state()
            
    def trigger_redo(self):
        nxt = self.history.redo(self.config)
        if nxt:
            self.config = nxt
            self.sync_ui_to_config()
            self.update_generator()
            self.update_undo_redo_buttons_state()

    def sync_ui_to_config(self):
        """Syncs all GUI control widgets to current config values (used after Undo/Redo/Load)."""
        # Size fields
        self.ent_w.delete(0, tk.END)
        self.ent_w.insert(0, str(self.config["size_w"]))
        self.ent_h.delete(0, tk.END)
        self.ent_h.insert(0, str(self.config["size_h"]))
        
        # Invert status
        self.var_invert.set(self.config.get("invert_enabled", False))
        
        # Sides count
        self.cb_sides.set(str(self.config.get("sides_count", 4)))
        
        # Global style
        self.cb_global_style.set(self.config.get("global_style", "Ink"))
        
        # 8 Parts
        for part in self.part_names:
            part_cfg = self.config["parts"][part]
            w_group = self.part_widgets[part]
            
            w_group["var_visible"].set(part_cfg.get("visible", True))
            w_group["var_keep"].set(part_cfg.get("keep", False))
            w_group["cb_genre"].set(part_cfg.get("genre", "Geometry"))
            w_group["cb_pattern"].set(part_cfg.get("pattern", "P1"))
            w_group["cb_style"].set(part_cfg.get("style", "Ink"))
            
            w_group["slider_intensity"].set(part_cfg.get("intensity", 0.5))
            w_group["lbl_intensity"].configure(text=f"I:{int(part_cfg.get('intensity', 0.5)*100)}%")
            
            w_group["slider_range"].set(part_cfg.get("range", 1.0))
            w_group["lbl_range"].configure(text=f"R:{int(part_cfg.get('range', 1.0)*100)}%")
            
        # Effects
        eff_cfg = self.config["effects"]
        self.var_hologram.set(eff_cfg.get("hologram_enabled", False))
        self.slider_hologram.set(eff_cfg.get("hologram_intensity", 0.5))
        
        self.var_smooth.set(eff_cfg.get("smooth_enabled", False))
        self.slider_smooth.set(eff_cfg.get("smooth_intensity", 0.5))
        
        self.var_kaleido.set(eff_cfg["kaleidoscope_enabled"])
        self.cb_kaleido_divs.set(str(eff_cfg["kaleidoscope_divisions"]))
        
        self.var_sharp.set(eff_cfg.get("sharp_enabled", False))
        self.slider_sharp.set(eff_cfg.get("sharp_intensity", 0.5))
        
        self.var_ripple.set(eff_cfg.get("ripple_enabled", False))
        self.slider_ripple.set(eff_cfg.get("ripple_intensity", 0.5))
        
        self.var_glow.set(eff_cfg.get("glow_enabled", False))
        self.slider_glow.set(eff_cfg.get("glow_intensity", 0.5))
        
        self.var_metal.set(eff_cfg.get("metal_enabled", False))
        self.slider_metal.set(eff_cfg.get("metal_intensity", 0.5))
        
        self.var_chromatic.set(eff_cfg.get("chromatic_enabled", False))
        self.slider_chromatic.set(eff_cfg.get("chromatic_intensity", 0.5))
        
        self.var_white_balance.set(eff_cfg.get("white_balance_enabled", False))
        self.slider_white_balance.set(eff_cfg.get("white_balance_intensity", 0.5))
        
        self.var_vignette.set(eff_cfg.get("vignette_enabled", False))
        self.slider_vignette.set(eff_cfg.get("vignette_intensity", 0.5))
        
        self.var_bleed.set(eff_cfg.get("bleed_enabled", False))
        self.slider_bleed.set(eff_cfg.get("bleed_intensity", 0.5))
        
        self.var_illust.set(eff_cfg.get("illust_enabled", False))
        self.slider_illust.set(eff_cfg.get("illust_intensity", 0.5))

    def trigger_gacha(self):
        """Randomizes all config items that do not have their 'keep' checkboxes checked."""
        self.push_to_history()
        
        # Randomize parts
        for part in self.part_names:
            part_cfg = self.config["parts"][part]
            if not part_cfg.get("keep", False):
                part_cfg["genre"] = random.choice(self.genres)
                part_cfg["pattern"] = random.choice(self.patterns)
                part_cfg["style"] = self.config.get("global_style", random.choice(self.styles))
                part_cfg["intensity"] = round(random.uniform(0.1, 0.95), 2)
                part_cfg["range"] = round(random.uniform(0.3, 1.3), 2)
                
        # Sync UI representation and regenerate
        self.sync_ui_to_config()
        self.update_generator()

    def trigger_gacha_theme(self):
        """Randomizes all non-kept parts but forces them to share the SAME randomly selected genre."""
        self.push_to_history()
        
        # Choose a single theme genre
        theme_genre = random.choice(self.genres)
        
        for part in self.part_names:
            part_cfg = self.config["parts"][part]
            if not part_cfg.get("keep", False):
                part_cfg["genre"] = theme_genre
                part_cfg["pattern"] = random.choice(self.patterns)
                part_cfg["style"] = self.config.get("global_style", random.choice(self.styles))
                part_cfg["intensity"] = round(random.uniform(0.15, 0.9), 2)
                part_cfg["range"] = round(random.uniform(0.4, 1.3), 2)
                
        # Sync UI representation and regenerate
        self.sync_ui_to_config()
        self.update_generator()

    def trigger_gacha_part(self, part):
        """Randomizes a single part, ignoring/bypassing its keep status (since user clicked it directly)."""
        self.push_to_history()
        
        part_cfg = self.config["parts"][part]
        part_cfg["genre"] = random.choice(self.genres)
        part_cfg["pattern"] = random.choice(self.patterns)
        part_cfg["style"] = self.config.get("global_style", random.choice(self.styles))
        part_cfg["intensity"] = round(random.uniform(0.1, 0.95), 2)
        part_cfg["range"] = round(random.uniform(0.3, 1.3), 2)
        
        # Sync UI representation and regenerate
        self.sync_ui_to_config()
        self.update_generator()

    def trigger_output(self):
        """Saves current preview image to output/ directory."""
        if self.final_pil_image is None:
            return
            
        out_dir = "output"
        if not os.path.exists(out_dir):
            os.makedirs(out_dir)
            
        W = self.config["size_w"]
        H = self.config["size_h"]
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{W}x{H}_{timestamp}.png"
        filepath = os.path.join(out_dir, filename)
        
        try:
            self.final_pil_image.save(filepath, "PNG")
            messagebox.showinfo("Saved Successfully", f"Frame saved to:\n{os.path.abspath(filepath)}")
        except Exception as e:
            messagebox.showerror("Error Saving File", f"Could not save PNG:\n{e}")

    def on_closing(self):
        save_config(self.config)
        self.destroy()

if __name__ == "__main__":
    app = FrameGeneratorApp()
    app.mainloop()
