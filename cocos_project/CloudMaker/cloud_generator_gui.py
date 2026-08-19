import os
import sys
import time
import math
try:
    import numpy as np
    from PIL import Image, ImageTk, ImageFilter
    import tkinter as tk
    from tkinter import ttk, messagebox
except ImportError:
    os.system(f'"{sys.executable}" -m pip install numpy pillow')
    import numpy as np
    from PIL import Image, ImageTk, ImageFilter
    import tkinter as tk
    from tkinter import ttk, messagebox
class RealisticCloudGenerator:
    """パフ生成＋エアブラシ消しゴム侵食による軽量・有機的な雲生成"""
    @classmethod
    def generate_cloud(cls, width=512, height=512, seed=42,
                       mode="isolated", # isolated, seamless_v, seamless_h, seamless_both
                       cloud_density=1.0, puff_count=24, fluffiness=0.8,
                       shadow_depth=0.5, sun_power=0.7):
        
        rng = np.random.RandomState(seed)
        
        # 1. パフ（水蒸気の球体・楕円クラスタ）の生成
        puff_density = np.zeros((height, width), dtype=np.float32)
        y_grid, x_grid = np.ogrid[:height, :width]
        
        if mode == "isolated":
            # 単体雲: 中央付近に有機的なパフの塊を配置
            cx_center = width * 0.5
            cy_center = height * 0.52
            
            for _ in range(puff_count):
                # 中央からのオフセット
                angle = rng.uniform(0, math.pi * 2)
                dist_factor = rng.power(1.5)
                px = cx_center + math.cos(angle) * (width * 0.28) * dist_factor
                py = cy_center + math.sin(angle) * (height * 0.20) * dist_factor
                
                rx = rng.uniform(width * 0.12, width * 0.28)
                ry = rx * rng.uniform(0.65, 0.95) # やや横長
                
                # ガウス分布によるソフトなパフ球
                dx = (x_grid - px) / rx
                dy = (y_grid - py) / ry
                dist_sq = dx * dx + dy * dy
                
                puff = np.exp(-dist_sq * 2.2) # ソフトな減衰
                weight = rng.uniform(0.6, 1.2)
                puff_density = np.maximum(puff_density, puff * weight)
        else:
            # シームレス用: 画面全体にパフを分散配置（トーラスラップ）
            for _ in range(puff_count * 2):
                px = rng.uniform(0, width)
                py = rng.uniform(0, height)
                rx = rng.uniform(width * 0.15, width * 0.35)
                ry = rx * rng.uniform(0.7, 1.0)
                
                # トーラス距離（シームレス対応）
                dx = np.abs(x_grid - px)
                dy = np.abs(y_grid - py)
                if mode in ("seamless_h", "seamless_both"):
                    dx = np.minimum(dx, width - dx)
                if mode in ("seamless_v", "seamless_both"):
                    dy = np.minimum(dy, height - dy)
                    
                dist_sq = (dx / rx) ** 2 + (dy / ry) ** 2
                puff = np.exp(-dist_sq * 2.0)
                puff_density = np.maximum(puff_density, puff * rng.uniform(0.5, 1.0))
        
        # 2. エアブラシ消しゴムによる削り込み（Erosion、軽量版）
        # 白ベタ(puff_density)に対し、ソフトな円形ブロブを何十個か重ねて"消しゴム"のように
        # 密度を削ることで、有機的な輪郭のムラを作る。以前はFBM多重オクターブノイズ
        # (_create_smooth_noise を7回、グリッド全体でバイリニア補間)で削り込んでいたが、
        # これがボトルネックだったため、puff生成と同じ軽量なガウスブロブ方式に統一した。
        erase_mask = np.ones((height, width), dtype=np.float32)
        erase_count = max(12, int(puff_count * 1.2))
        for _ in range(erase_count):
            ex = rng.uniform(0, width)
            ey = rng.uniform(0, height)
            erx = rng.uniform(width * 0.04, width * 0.16)
            ery = erx * rng.uniform(0.6, 1.4)

            dx = np.abs(x_grid - ex)
            dy = np.abs(y_grid - ey)
            if mode in ("seamless_h", "seamless_both"):
                dx = np.minimum(dx, width - dx)
            if mode in ("seamless_v", "seamless_both"):
                dy = np.minimum(dy, height - dy)

            dist_sq = (dx / erx) ** 2 + (dy / ery) ** 2
            erase_amount = np.exp(-dist_sq * 2.5) * rng.uniform(0.25, 0.7)
            erase_mask = np.clip(erase_mask - erase_amount, 0.0, 1.0)

        # パフ密度と消しゴムマスクをブレンドして有機的なもくもく感を形成
        density = puff_density * (0.35 + 0.9 * erase_mask) * cloud_density
        
        # エッジのソフトクリッピング（水蒸気のフェード）
        threshold = 0.18 * (1.1 - fluffiness * 0.5)
        density = np.clip((density - threshold) / (1.0 - threshold + 1e-5), 0.0, 1.0)
        
        # 3. 透過度（アルファ）計算: Beer-Lambert則（光の吸光近似）
        # 密度の高いコア部分はしっかり不透明、縁はなめらかに透過
        alpha = 1.0 - np.exp(-density * (2.8 + fluffiness * 2.0))
        alpha = np.clip(alpha, 0.0, 1.0)
        
        # 4. 立体ライティング（法線近似 ＋ ボリュームシャドウ ＋ 銀の縁）
        # 光源の角度(旧SunAngleスライダー)は0°/180°等で見比べても見た目の差がほぼ無く
        # 効果が薄かったため削除し、固定方向(左上、旧デフォルト値50°相当)にした。
        # 明るさ自体を効かせるsun_power/shadow_depthは視覚的な意味があるので残す。
        rad = math.radians(50.0)
        lx, ly = math.cos(rad), -math.sin(rad)
        
        # 密度勾配
        gy, gx = np.gradient(density)
        dot = np.clip(gx * lx + gy * ly, -1.0, 1.0)
        
        # 散乱光（上面や光源側のハイライト）
        sun_highlight = np.clip(dot * 3.5, 0.0, 1.0) * sun_power
        
        # ボリューム内部の影（底面や光源の反対側）
        internal_shadow = np.clip(1.0 - (1.0 - dot) * shadow_depth * density, 0.15, 1.0)
        
        # 5. カラーの合成（純白ハイライト 〜 やわらかな空色の影）
        # 光が当たっている面: 白〜微暖色 (255, 255, 255)
        # 影の面: 空の色がわずかに反映された自然なトーン (180, 195, 215)
        light_factor = np.clip(internal_shadow + sun_highlight * 0.4, 0.0, 1.2)
        
        base_r = 252.0
        base_g = 253.0
        base_b = 255.0
        
        shadow_r = 175.0
        shadow_g = 190.0
        shadow_b = 210.0
        
        # 最終RGB
        r = shadow_r + (base_r - shadow_r) * np.clip(light_factor, 0.0, 1.0)
        g = shadow_g + (base_g - shadow_g) * np.clip(light_factor, 0.0, 1.0)
        b = shadow_b + (base_b - shadow_b) * np.clip(light_factor, 0.0, 1.0)
        
        # 配列の組み立て
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        rgba[..., 0] = np.clip(r, 0, 255).astype(np.uint8)
        rgba[..., 1] = np.clip(g, 0, 255).astype(np.uint8)
        rgba[..., 2] = np.clip(b, 0, 255).astype(np.uint8)
        rgba[..., 3] = (alpha * 255.0).clip(0, 255).astype(np.uint8)
        
        img = Image.fromarray(rgba, "RGBA")
        
        # 最後に微細なガウシアンブラーで空気感をプラス（CG特有の角張りを完全消去）
        img = img.filter(ImageFilter.GaussianBlur(radius=0.8))
        return img
class CloudGeneratorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Realistic Cloud Generator (Shooting Game Asset Maker)")
        self.root.geometry("1100x760")
        self.root.minsize(950, 680)
        
        self.output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
        os.makedirs(self.output_dir, exist_ok=True)
        
        self.current_img = None
        self.preview_tk = None
        self.current_seed = int(time.time()) % 100000
        
        self._build_ui()
        self.update_cloud()
    def _build_ui(self):
        main_paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        main_paned.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)
        
        ctrl_frame = ttk.LabelFrame(main_paned, text=" Controls ", padding=10)
        main_paned.add(ctrl_frame, weight=1)
        
        row = 0
        ttk.Label(ctrl_frame, text="Scroll Mode:").grid(row=row, column=0, sticky="w", pady=(0, 2))
        row += 1
        self.mode_var = tk.StringVar(value="isolated")
        modes = [
            ("Isolated (Sprite / Border Fade)", "isolated"),
            ("Vertical Seamless (Up/Down Loop)", "seamless_v"),
            ("Horizontal Seamless (Left/Right Loop)", "seamless_h"),
            ("Both Seamless (All Directions)", "seamless_both")
        ]
        for text, val in modes:
            ttk.Radiobutton(ctrl_frame, text=text, value=val, variable=self.mode_var, command=self.update_cloud).grid(row=row, column=0, columnspan=2, sticky="w", padx=10, pady=1)
            row += 1
            
        ttk.Separator(ctrl_frame, orient="horizontal").grid(row=row, column=0, columnspan=2, sticky="ew", pady=8)
        row += 1
        
        ttk.Label(ctrl_frame, text="Resolution:").grid(row=row, column=0, sticky="w")
        self.size_var = tk.StringVar(value="512x512")
        size_cb = ttk.Combobox(ctrl_frame, textvariable=self.size_var, values=["256x256", "512x512", "1024x512", "1024x1024", "2048x1024", "2048x2048"], width=14, state="readonly")
        size_cb.grid(row=row, column=1, sticky="e")
        size_cb.bind("<<ComboboxSelected>>", lambda e: self.update_cloud())
        row += 1
        
        self.sliders = {}
        def add_slider(label, key, from_, to_, init, res=0.01):
            nonlocal row
            ttk.Label(ctrl_frame, text=label).grid(row=row, column=0, sticky="w", pady=3)
            val_lbl = ttk.Label(ctrl_frame, text=f"{init:.2f}", width=5)
            val_lbl.grid(row=row, column=1, sticky="e")
            row += 1
            slider = ttk.Scale(ctrl_frame, from_=from_, to=to_, value=init, orient=tk.HORIZONTAL)
            slider.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(0, 6))
            row += 1
            def on_change(v):
                val = float(v)
                val_lbl.config(text=f"{val:.2f}" if res < 1 else f"{int(val)}")
                self.update_cloud()
            slider.config(command=on_change)
            self.sliders[key] = (slider, val_lbl)
            
        add_slider("Cloud Density:", "density", 0.4, 2.2, 1.1)
        add_slider("Puff Clusters (Volume):", "puffs", 10, 45, 24, res=1)
        add_slider("Fluffiness (Soft Edge):", "fluffiness", 0.2, 1.2, 0.85)
        add_slider("Sun Power (Highlight):", "sun_power", 0.0, 1.5, 0.75)
        add_slider("Shadow Depth (3D Volume):", "shadow_depth", 0.1, 1.0, 0.55)
        
        ttk.Separator(ctrl_frame, orient="horizontal").grid(row=row, column=0, columnspan=2, sticky="ew", pady=8)
        row += 1
        btn_frame = ttk.Frame(ctrl_frame)
        btn_frame.grid(row=row, column=0, columnspan=2, sticky="ew", pady=5)
        row += 1
        ttk.Button(btn_frame, text="🎲 Random Seed", command=self.randomize_seed).pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)
        row += 1
        ttk.Button(ctrl_frame, text="💾 Save PNG (to output/)", command=self.save_image).grid(row=row, column=0, columnspan=2, sticky="ew", pady=6)
        row += 1
        batch_frame = ttk.Frame(ctrl_frame)
        batch_frame.grid(row=row, column=0, columnspan=2, sticky="ew", pady=2)
        ttk.Label(batch_frame, text="Batch:").pack(side=tk.LEFT)
        self.batch_count = tk.StringVar(value="5")
        ttk.Spinbox(batch_frame, from_=1, to=50, textvariable=self.batch_count, width=4).pack(side=tk.LEFT, padx=5)
        ttk.Button(batch_frame, text="🚀 Batch Export", command=self.batch_export).pack(side=tk.RIGHT, expand=True, fill=tk.X)
        
        preview_frame = ttk.LabelFrame(main_paned, text=" Preview (Sky Blue Background) ", padding=10)
        main_paned.add(preview_frame, weight=3)
        self.canvas = tk.Canvas(preview_frame, bg="#3b7cb4", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.canvas.bind("<Configure>", lambda e: self._draw_preview())
    def randomize_seed(self):
        self.current_seed = int(time.time() * 1000) % 1000000
        self.update_cloud()
    def update_cloud(self):
        try:
            w_str, h_str = self.size_var.get().split("x")
            width, height = int(w_str), int(h_str)
        except:
            width, height = 512, 512
        mode = self.mode_var.get()
        density = self.sliders["density"][0].get()
        puffs = int(self.sliders["puffs"][0].get())
        fluffiness = self.sliders["fluffiness"][0].get()
        sun_power = self.sliders["sun_power"][0].get()
        shadow_depth = self.sliders["shadow_depth"][0].get()

        self.current_img = RealisticCloudGenerator.generate_cloud(
            width=width, height=height, seed=self.current_seed,
            mode=mode, cloud_density=density, puff_count=puffs,
            fluffiness=fluffiness,
            shadow_depth=shadow_depth, sun_power=sun_power
        )
        self._draw_preview()
    def _draw_preview(self):
        if self.current_img is None:
            return
        cw, ch = self.canvas.winfo_width(), self.canvas.winfo_height()
        if cw <= 10 or ch <= 10:
            return
            
        # ゲーム中の空（青空グラデーション）の上に乗せてプレビュー
        bg = Image.new("RGBA", (cw, ch), (65, 130, 195, 255))
        img = self.current_img.copy()
        img.thumbnail((cw - 20, ch - 20), Image.Resampling.BILINEAR)
        pos_x = (cw - img.width) // 2
        pos_y = (ch - img.height) // 2
        bg.paste(img, (pos_x, pos_y), img)
        self.preview_tk = ImageTk.PhotoImage(bg)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor="nw", image=self.preview_tk)
    def save_image(self):
        if self.current_img is None:
            return
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"realistic_cloud_{self.mode_var.get()}_{self.size_var.get()}_seed{self.current_seed}_{timestamp}.png"
        filepath = os.path.join(self.output_dir, filename)
        self.current_img.save(filepath, "PNG")
        messagebox.showinfo("Saved", f"Transparent PNG saved to:\n\n{filepath}")
    def batch_export(self):
        count = int(self.batch_count.get())
        try:
            w_str, h_str = self.size_var.get().split("x")
            width, height = int(w_str), int(h_str)
        except:
            width, height = 512, 512
        mode = self.mode_var.get()
        density = self.sliders["density"][0].get()
        puffs = int(self.sliders["puffs"][0].get())
        fluffiness = self.sliders["fluffiness"][0].get()
        sun_power = self.sliders["sun_power"][0].get()
        shadow_depth = self.sliders["shadow_depth"][0].get()
        timestamp = time.strftime("%Y%m%d_%H%M%S")

        for i in range(count):
            seed = (self.current_seed + i * 997 + int(time.time())) % 1000000
            img = RealisticCloudGenerator.generate_cloud(
                width=width, height=height, seed=seed,
                mode=mode, cloud_density=density, puff_count=puffs,
                fluffiness=fluffiness,
                shadow_depth=shadow_depth, sun_power=sun_power
            )
            filename = f"cloud_{mode}_{width}x{height}_{i+1:03d}_{timestamp}.png"
            filepath = os.path.join(self.output_dir, filename)
            img.save(filepath, "PNG")
        messagebox.showinfo("Batch Complete", f"Exported {count} transparent cloud PNGs to output/")
if __name__ == "__main__":
    root = tk.Tk()
    app = CloudGeneratorApp(root)
    root.mainloop()