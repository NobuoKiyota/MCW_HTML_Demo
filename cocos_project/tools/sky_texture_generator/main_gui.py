import os
import sys
import time
import tkinter as tk
from tkinter import filedialog, messagebox, colorchooser, ttk
from PIL import Image, ImageTk, ImageDraw

import windnd

from sky_processor import process_sky_image, get_unique_output_path

class SkyGeneratorGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Sky Seamless Texture Generator - Cocos Studio")
        self.root.geometry("1380x850")
        self.root.minsize(1050, 680)

        # 状態変数
        self.input_file_path = ""
        self.chromakey_color = (135, 206, 235) # 天色 RGB
        self.processed_img = None
        self.preview_tk_img = None
        self.loop_preview_tk_img = None
        self.bg_mode = "checker" # "checker", "black", "white"

        # ズーム ＆ パン状態
        self.zoom_factor = 1.0
        self.pan_x = 0
        self.pan_y = 0
        self.drag_start_x = 0
        self.drag_start_y = 0

        # スポイトモード
        self.eyedropper_active = False

        # 動的アニメーションプレビュー用
        self.anim_running = False
        self.anim_scroll_y = 0.0
        self.anim_last_time = time.time()
        self.anim_img_tk = None
        self.anim_canvas = None

        self.update_timer = None

        self._setup_ui()
        self._setup_drag_and_drop()

        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def _setup_drag_and_drop(self):
        try:
            windnd.hook_dropfiles(self.root, func=self.on_drop_files)
        except Exception as e:
            print(f"[Drag&Drop Warning] Failed to hook dropfiles: {e}")

    def on_drop_files(self, files):
        if not files:
            return
        first_file = files[0]
        if isinstance(first_file, bytes):
            try:
                first_file = first_file.decode('utf-8')
            except Exception:
                first_file = os.fsdecode(first_file)

        if os.path.isfile(first_file):
            ext = os.path.splitext(first_file)[1].lower()
            if ext in ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.xcf']:
                self.load_file(first_file)
            else:
                messagebox.showwarning("ファイル形式エラー", "対応していない画像ファイル形式です。")

    def _setup_ui(self):
        main_paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        main_paned.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        # ----------------------------------------------------
        # 左パネル: 操作・設定コントロール (2列コンパクト Grid)
        # ----------------------------------------------------
        left_scroll_container = ttk.Frame(main_paned, width=540)
        main_paned.add(left_scroll_container, weight=1)

        canvas_left = tk.Canvas(left_scroll_container, borderwidth=0, highlightthickness=0)
        scrollbar_left = ttk.Scrollbar(left_scroll_container, orient="vertical", command=canvas_left.yview)
        left_frame = ttk.Frame(canvas_left)

        left_frame.bind("<Configure>", lambda e: canvas_left.configure(scrollregion=canvas_left.bbox("all")))
        canvas_left.create_window((0, 0), window=left_frame, anchor="nw")
        canvas_left.configure(yscrollcommand=scrollbar_left.set)

        canvas_left.pack(side="left", fill="both", expand=True)
        scrollbar_left.pack(side="right", fill="y")

        # 1. 画像ファイル選択
        file_frame = ttk.LabelFrame(left_frame, text=" 1. 画像ファイル選択 (ドロップ対応) ", padding=8)
        file_frame.pack(fill=tk.X, pady=3, padx=4)

        self.btn_select_file = ttk.Button(file_frame, text="📁 写真・画像を開く (またはドロップ)", command=self.select_file)
        self.btn_select_file.pack(fill=tk.X, pady=2)

        self.lbl_file_info = ttk.Label(file_frame, text="画面上に画像をドラッグ＆ドロップ可能です", wraplength=480, foreground="gray")
        self.lbl_file_info.pack(fill=tk.X, pady=2)

        # 2. 変形・サイズ設定 (2列Grid)
        transform_frame = ttk.LabelFrame(left_frame, text=" 2. 変形・サイズ & クロップ ", padding=8)
        transform_frame.pack(fill=tk.X, pady=3, padx=4)

        # Col 0: 解像度 & 回転 / Col 1: クロップ位置 & 自動拡大
        f_tr_left = ttk.Frame(transform_frame)
        f_tr_left.grid(row=0, column=0, sticky="nsew", padx=4, pady=2)
        f_tr_right = ttk.Frame(transform_frame)
        f_tr_right.grid(row=0, column=1, sticky="nsew", padx=4, pady=2)
        transform_frame.columnconfigure(0, weight=1)
        transform_frame.columnconfigure(1, weight=1)

        ttk.Label(f_tr_left, text="ターゲット解像度:").pack(anchor=tk.W)
        self.var_target_res = tk.StringVar(value="1024x4096")
        cb_res = ttk.Combobox(f_tr_left, textvariable=self.var_target_res, values=["1024x4096", "800x4320", "512x2048", "2048x8192"], width=12, state="readonly")
        cb_res.pack(fill=tk.X, pady=(2, 4))
        cb_res.bind("<<ComboboxSelected>>", lambda e: self.schedule_preview())

        self.var_auto_rotate = tk.BooleanVar(value=True)
        chk_rotate = ttk.Checkbutton(f_tr_left, text="横長写真を90度自動回転", variable=self.var_auto_rotate, command=self.schedule_preview)
        chk_rotate.pack(anchor=tk.W)

        ttk.Label(f_tr_right, text="切り出し位置 (Offset):").pack(anchor=tk.W)
        self.var_crop_offset = tk.DoubleVar(value=0.5)
        scale_crop = ttk.Scale(f_tr_right, from_=0.0, to=1.0, variable=self.var_crop_offset, command=lambda v: self.schedule_preview())
        scale_crop.pack(fill=tk.X, pady=(2, 4))

        self.var_auto_scale = tk.BooleanVar(value=True)
        chk_scale = ttk.Checkbutton(f_tr_right, text="自動拡大 (アスペクト比維持Fill)", variable=self.var_auto_scale, command=self.schedule_preview)
        chk_scale.pack(anchor=tk.W)

        # 3. シームレスボカシ ＆ モノトーン (2列Grid)
        blend_mono_frame = ttk.LabelFrame(left_frame, text=" 3. シームレスボカシ & トーン調整 ", padding=8)
        blend_mono_frame.pack(fill=tk.X, pady=3, padx=4)

        f_bm_left = ttk.Frame(blend_mono_frame)
        f_bm_left.grid(row=0, column=0, sticky="nsew", padx=4, pady=2)
        f_bm_right = ttk.Frame(blend_mono_frame)
        f_bm_right.grid(row=0, column=1, sticky="nsew", padx=4, pady=2)
        blend_mono_frame.columnconfigure(0, weight=1)
        blend_mono_frame.columnconfigure(1, weight=1)

        ttk.Label(f_bm_left, text="中央繋ぎ目ボカシ幅 (%):").pack(anchor=tk.W)
        self.var_blend_percent = tk.DoubleVar(value=8.0)
        scale_blend = ttk.Scale(f_bm_left, from_=0.0, to=25.0, variable=self.var_blend_percent, command=lambda v: self.schedule_preview())
        scale_blend.pack(fill=tk.X, pady=2)

        self.var_enable_mono = tk.BooleanVar(value=False)
        chk_mono = ttk.Checkbutton(f_bm_right, text="モノトーン (白黒) 化する", variable=self.var_enable_mono, command=self.schedule_preview)
        chk_mono.pack(anchor=tk.W)

        ttk.Label(f_bm_right, text="コントラスト:").pack(anchor=tk.W, pady=(2, 0))
        self.var_contrast = tk.DoubleVar(value=1.0)
        scale_contrast = ttk.Scale(f_bm_right, from_=0.5, to=2.0, variable=self.var_contrast, command=lambda v: self.schedule_preview())
        scale_contrast.pack(fill=tk.X, pady=2)

        # 4. クロマキー透過＆スポイト機能 (2列Grid)
        chroma_frame = ttk.LabelFrame(left_frame, text=" 4. 空色のクロマキー透過 & スポイト ", padding=8)
        chroma_frame.pack(fill=tk.X, pady=3, padx=4)

        f_ch_left = ttk.Frame(chroma_frame)
        f_ch_left.grid(row=0, column=0, sticky="nsew", padx=4, pady=2)
        f_ch_right = ttk.Frame(chroma_frame)
        f_ch_right.grid(row=0, column=1, sticky="nsew", padx=4, pady=2)
        chroma_frame.columnconfigure(0, weight=1)
        chroma_frame.columnconfigure(1, weight=1)

        self.var_enable_chroma = tk.BooleanVar(value=False)
        chk_chroma = ttk.Checkbutton(f_ch_left, text="特定の空色をアルファ透過", variable=self.var_enable_chroma, command=self.schedule_preview)
        chk_chroma.pack(anchor=tk.W, pady=2)

        color_btn_box = ttk.Frame(f_ch_left)
        color_btn_box.pack(fill=tk.X, pady=2)
        self.btn_eyedropper = ttk.Button(color_btn_box, text="💧 スポイト", command=self.toggle_eyedropper)
        self.btn_eyedropper.pack(side=tk.LEFT)
        self.btn_color_preview = tk.Button(color_btn_box, text=" カラー選択 ", bg="#87CEEB", fg="black", command=self.pick_color)
        self.btn_color_preview.pack(side=tk.RIGHT, padx=2)

        ttk.Label(f_ch_right, text="透過しきい値 (Tolerance):").pack(anchor=tk.W)
        self.var_chroma_tol = tk.DoubleVar(value=40.0)
        scale_tol = ttk.Scale(f_ch_right, from_=0.0, to=120.0, variable=self.var_chroma_tol, command=lambda v: self.schedule_preview())
        scale_tol.pack(fill=tk.X, pady=2)

        ttk.Label(f_ch_right, text="透過ぼかし感 (Softness):").pack(anchor=tk.W, pady=(2, 0))
        self.var_chroma_soft = tk.DoubleVar(value=15.0)
        scale_soft = ttk.Scale(f_ch_right, from_=1.0, to=60.0, variable=self.var_chroma_soft, command=lambda v: self.schedule_preview())
        scale_soft.pack(fill=tk.X, pady=2)

        # 5. 特殊エフェクト (2列Grid)
        effect_frame = ttk.LabelFrame(left_frame, text=" 5. 特殊エフェクト (画質・質感) ", padding=8)
        effect_frame.pack(fill=tk.X, pady=3, padx=4)

        f_ef_left = ttk.Frame(effect_frame)
        f_ef_left.grid(row=0, column=0, sticky="nsew", padx=4, pady=2)
        f_ef_right = ttk.Frame(effect_frame)
        f_ef_right.grid(row=0, column=1, sticky="nsew", padx=4, pady=2)
        effect_frame.columnconfigure(0, weight=1)
        effect_frame.columnconfigure(1, weight=1)

        ttk.Label(f_ef_left, text="ノイズ感 (Grain/Noise):").pack(anchor=tk.W)
        self.var_noise = tk.DoubleVar(value=0.0)
        scale_noise = ttk.Scale(f_ef_left, from_=0.0, to=50.0, variable=self.var_noise, command=lambda v: self.schedule_preview())
        scale_noise.pack(fill=tk.X, pady=2)

        ttk.Label(f_ef_left, text="シャープ (輪郭強調/Sharpen):").pack(anchor=tk.W, pady=(2, 0))
        self.var_sharpen = tk.DoubleVar(value=0.0)
        scale_sharpen = ttk.Scale(f_ef_left, from_=0.0, to=3.0, variable=self.var_sharpen, command=lambda v: self.schedule_preview())
        scale_sharpen.pack(fill=tk.X, pady=2)

        ttk.Label(f_ef_right, text="スムース (ボカシ/Smooth):").pack(anchor=tk.W)
        self.var_blur = tk.DoubleVar(value=0.0)
        scale_blur = ttk.Scale(f_ef_right, from_=0.0, to=5.0, variable=self.var_blur, command=lambda v: self.schedule_preview())
        scale_blur.pack(fill=tk.X, pady=2)

        # 6. 背景モード ＆ エクスポート (コンパクト配置)
        bottom_box = ttk.LabelFrame(left_frame, text=" 6. 透過確認背景 & 保存 ", padding=8)
        bottom_box.pack(fill=tk.X, pady=3, padx=4)

        bg_mode_box = ttk.Frame(bottom_box)
        bg_mode_box.pack(fill=tk.X, pady=2)

        ttk.Label(bg_mode_box, text="背景モード:").pack(side=tk.LEFT, padx=(0, 6))
        self.var_bg_mode = tk.StringVar(value="checker")
        rb_checker = ttk.Radiobutton(bg_mode_box, text="🏁 市松模様", variable=self.var_bg_mode, value="checker", command=self.on_bg_mode_change)
        rb_checker.pack(side=tk.LEFT, padx=4)
        rb_black = ttk.Radiobutton(bg_mode_box, text="⬛ 黒", variable=self.var_bg_mode, value="black", command=self.on_bg_mode_change)
        rb_black.pack(side=tk.LEFT, padx=4)
        rb_white = ttk.Radiobutton(bg_mode_box, text="⬜ 白", variable=self.var_bg_mode, value="white", command=self.on_bg_mode_change)
        rb_white.pack(side=tk.LEFT, padx=4)

        self.btn_export = ttk.Button(bottom_box, text="💾 シームレス画像を出力保存 (_edit.png)", command=self.export_image, state=tk.DISABLED)
        self.btn_export.pack(fill=tk.X, ipady=6, pady=(6, 2))

        # ----------------------------------------------------
        # 右パネル: プレビュー画面 (3タブ)
        # ----------------------------------------------------
        right_frame = ttk.Frame(main_paned)
        main_paned.add(right_frame, weight=2)

        view_ctrl_bar = ttk.Frame(right_frame, padding=2)
        view_ctrl_bar.pack(fill=tk.X, side=tk.TOP)

        self.lbl_zoom_info = ttk.Label(view_ctrl_bar, text="ズーム: 100% (ホイールで拡大縮小 / ドラッグで移動)", foreground="gray")
        self.lbl_zoom_info.pack(side=tk.LEFT, padx=5)

        btn_reset_zoom = ttk.Button(view_ctrl_bar, text="🔍 ズームリセット", command=self.reset_zoom)
        btn_reset_zoom.pack(side=tk.RIGHT, padx=5)

        self.notebook = ttk.Notebook(right_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True)

        # タブ1: 全体プレビュー
        self.tab_single = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_single, text=" 全体プレビュー ")
        self.lbl_preview_single = ttk.Label(self.tab_single, text="画像を読み込むとここにプレビューが表示されます\n(ホイールで拡大・ドラッグで移動・クリックでスポイト)", anchor=tk.CENTER)
        self.lbl_preview_single.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.lbl_preview_single.bind("<MouseWheel>", self.on_mouse_wheel)
        self.lbl_preview_single.bind("<Button-4>", self.on_mouse_wheel)
        self.lbl_preview_single.bind("<Button-5>", self.on_mouse_wheel)
        self.lbl_preview_single.bind("<ButtonPress-1>", self.on_drag_start)
        self.lbl_preview_single.bind("<B1-Motion>", self.on_drag_motion)
        self.lbl_preview_single.bind("<ButtonRelease-1>", self.on_drag_end)

        # タブ2: 上下ループ接続プレビュー
        self.tab_loop = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_loop, text=" 🔄 上下ループ接続プレビュー ")
        self.lbl_preview_loop = ttk.Label(self.tab_loop, text="画像を2枚上下に並べたループ接続ビューです", anchor=tk.CENTER)
        self.lbl_preview_loop.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.lbl_preview_loop.bind("<MouseWheel>", self.on_mouse_wheel)
        self.lbl_preview_loop.bind("<Button-4>", self.on_mouse_wheel)
        self.lbl_preview_loop.bind("<Button-5>", self.on_mouse_wheel)
        self.lbl_preview_loop.bind("<ButtonPress-1>", self.on_drag_start)
        self.lbl_preview_loop.bind("<B1-Motion>", self.on_drag_motion)
        self.lbl_preview_loop.bind("<ButtonRelease-1>", self.on_drag_end)

        # タブ3: 完全シームレス無限スクロールプレビュー (Cocos Simulation)
        self.tab_anim = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_anim, text=" 🎬 完全無限スクロールプレビュー ")
        self._setup_anim_tab()

    def _setup_anim_tab(self):
        ctrl_box = ttk.Frame(self.tab_anim, padding=5)
        ctrl_box.pack(fill=tk.X, side=tk.TOP)

        self.btn_anim_play = ttk.Button(ctrl_box, text="▶ 再生", command=self.toggle_anim_play)
        self.btn_anim_play.pack(side=tk.LEFT, padx=5)

        ttk.Label(ctrl_box, text="スクロール速度 (px/s):").pack(side=tk.LEFT, padx=(15, 5))
        self.var_anim_speed = tk.DoubleVar(value=60.0)
        scale_speed = ttk.Scale(ctrl_box, from_=10.0, to=400.0, variable=self.var_anim_speed)
        scale_speed.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)

        self.anim_canvas = tk.Canvas(self.tab_anim, bg="#1E1E1E", highlightthickness=0)
        self.anim_canvas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    def select_file(self):
        file_path = filedialog.askopenfilename(
            title="空の画像を選択",
            filetypes=[("画像ファイル", "*.png *.jpg *.jpeg *.bmp *.webp *.xcf"), ("すべてのファイル", "*.*")]
        )
        if file_path:
            self.load_file(file_path)

    def load_file(self, file_path):
        self.input_file_path = file_path
        filename = os.path.basename(file_path)
        self.lbl_file_info.config(text=f"選択中: {filename}\nパス: {file_path}", foreground="black")
        self.btn_export.config(state=tk.NORMAL)
        self.reset_zoom()
        self.update_preview()
        if not self.anim_running:
            self.toggle_anim_play()

    def reset_zoom(self):
        self.zoom_factor = 1.0
        self.pan_x = 0
        self.pan_y = 0
        self.lbl_zoom_info.config(text=f"ズーム: {int(self.zoom_factor * 100)}% (ホイールで拡大縮小 / ドラッグで移動)")
        self.update_preview()

    def on_mouse_wheel(self, event):
        if event.delta > 0 or event.num == 4:
            self.zoom_factor = min(5.0, self.zoom_factor * 1.15)
        elif event.delta < 0 or event.num == 5:
            self.zoom_factor = max(0.2, self.zoom_factor / 1.15)

        self.lbl_zoom_info.config(text=f"ズーム: {int(self.zoom_factor * 100)}% (ホイールで拡大縮小 / ドラッグで移動)")
        self.update_preview()

    def on_drag_start(self, event):
        self.drag_start_x = event.x
        self.drag_start_y = event.y

        if self.eyedropper_active:
            self.on_preview_click(event)

    def on_drag_motion(self, event):
        if self.eyedropper_active:
            return
        dx = event.x - self.drag_start_x
        dy = event.y - self.drag_start_y
        self.pan_x += dx
        self.pan_y += dy
        self.drag_start_x = event.x
        self.drag_start_y = event.y
        self.update_preview()

    def on_drag_end(self, event):
        pass

    def toggle_eyedropper(self):
        self.eyedropper_active = not self.eyedropper_active
        if self.eyedropper_active:
            self.btn_eyedropper.config(text="🎯 クリックで取得...")
            self.root.config(cursor="crosshair")
        else:
            self.btn_eyedropper.config(text="💧 スポイト")
            self.root.config(cursor="")

    def on_preview_click(self, event):
        if self.processed_img is None:
            return

        img_w, img_h = self.processed_img.size

        if hasattr(self, 'current_disp_rect'):
            rx, ry, rw, rh = self.current_disp_rect
            rel_x = event.x - rx
            rel_y = event.y - ry

            if 0 <= rel_x < rw and 0 <= rel_y < rh:
                orig_x = int(rel_x / rw * img_w)
                orig_y = int(rel_y / rh * img_h)

                orig_x = clamp(orig_x, 0, img_w - 1)
                orig_y = clamp(orig_y, 0, img_h - 1)

                pixel_rgba = self.processed_img.getpixel((orig_x, orig_y))
                r, g, b = pixel_rgba[:3]
                self.set_chroma_color((r, g, b))

        if self.eyedropper_active:
            self.toggle_eyedropper()

    def set_chroma_color(self, rgb_tuple):
        self.chromakey_color = rgb_tuple
        r, g, b = rgb_tuple
        hex_color = f"#{r:02x}{g:02x}{b:02x}"
        self.btn_color_preview.config(bg=hex_color)
        self.schedule_preview()

    def pick_color(self):
        color = colorchooser.askcolor(title="透過対象の空色を選択", color="#87CEEB")
        if color[0]:
            r, g, b = map(int, color[0])
            self.set_chroma_color((r, g, b))

    def on_bg_mode_change(self):
        self.bg_mode = self.var_bg_mode.get()
        self.update_preview()

    def schedule_preview(self):
        if not self.input_file_path:
            return
        if self.update_timer is not None:
            self.root.after_cancel(self.update_timer)
        self.update_timer = self.root.after(120, self.update_preview)

    def parse_target_res(self):
        res_str = self.var_target_res.get()
        try:
            w, h = map(int, res_str.split("x"))
            return w, h
        except Exception:
            return 1024, 4096

    def render_on_bg(self, pil_rgba_img, bg_mode, width, height):
        bg = Image.new('RGBA', (width, height), (0, 0, 0, 255))
        if bg_mode == "black":
            bg = Image.new('RGBA', (width, height), (0, 0, 0, 255))
        elif bg_mode == "white":
            bg = Image.new('RGBA', (width, height), (255, 255, 255, 255))
        else:
            tile_sz = 16
            draw = ImageDraw.Draw(bg)
            for y in range(0, height, tile_sz):
                for x in range(0, width, tile_sz):
                    color = (200, 200, 200, 255) if ((x // tile_sz) + (y // tile_sz)) % 2 == 0 else (140, 140, 140, 255)
                    draw.rectangle([x, y, x + tile_sz, y + tile_sz], fill=color)

        bg.paste(pil_rgba_img, (0, 0), pil_rgba_img)
        return bg

    def update_preview(self):
        if not self.input_file_path or not os.path.exists(self.input_file_path):
            return

        target_w, target_h = self.parse_target_res()

        try:
            img_out = process_sky_image(
                input_path=self.input_file_path,
                target_width=target_w,
                target_height=target_h,
                auto_rotate=self.var_auto_rotate.get(),
                auto_scale=self.var_auto_scale.get(),
                crop_offset=self.var_crop_offset.get(),
                blend_percent=self.var_blend_percent.get() / 100.0,
                enable_chromakey=self.var_enable_chroma.get(),
                chromakey_color=self.chromakey_color,
                chromakey_tolerance=self.var_chroma_tol.get(),
                chromakey_softness=self.var_chroma_soft.get(),
                enable_monotone=self.var_enable_mono.get(),
                contrast_mult=self.var_contrast.get(),
                noise_level=self.var_noise.get(),
                blur_radius=self.var_blur.get(),
                sharpen_level=self.var_sharpen.get()
            )
            self.processed_img = img_out

            # --- 1. 単体プレビュー ---
            preview_max_h = 580
            base_scale = preview_max_h / target_h
            effective_scale = base_scale * self.zoom_factor

            disp_w = max(1, int(target_w * effective_scale))
            disp_h = max(1, int(target_h * effective_scale))

            img_single_disp = img_out.resize((disp_w, disp_h), Image.Resampling.BILINEAR)
            img_single_bg = self.render_on_bg(img_single_disp, self.bg_mode, disp_w, disp_h)

            self.preview_tk_img = ImageTk.PhotoImage(img_single_bg)
            self.lbl_preview_single.config(image=self.preview_tk_img, text="")

            lbl_w = self.lbl_preview_single.winfo_width()
            lbl_h = self.lbl_preview_single.winfo_height()
            rx = max(0, (lbl_w - disp_w) // 2) + self.pan_x
            ry = max(0, (lbl_h - disp_h) // 2) + self.pan_y
            self.current_disp_rect = (rx, ry, disp_w, disp_h)

            # --- 2. ループ接続プレビュー (上下2連) ---
            loop_img = Image.new('RGBA', (target_w, target_h * 2))
            loop_img.paste(img_out, (0, 0))
            loop_img.paste(img_out, (0, target_h))

            loop_base_scale = preview_max_h / (target_h * 2)
            loop_effective_scale = loop_base_scale * self.zoom_factor
            loop_disp_w = max(1, int(target_w * loop_effective_scale))
            loop_disp_h = max(1, int((target_h * 2) * loop_effective_scale))

            img_loop_disp = loop_img.resize((loop_disp_w, loop_disp_h), Image.Resampling.BILINEAR)
            img_loop_bg = self.render_on_bg(img_loop_disp, self.bg_mode, loop_disp_w, loop_disp_h)

            self.loop_preview_tk_img = ImageTk.PhotoImage(img_loop_bg)
            self.lbl_preview_loop.config(image=self.loop_preview_tk_img, text="")

            # --- 3. 動的スクロール用テクスチャ更新 ---
            cv_h = self.anim_canvas.winfo_height() if self.anim_canvas.winfo_height() > 50 else 580
            anim_scale = cv_h / target_h
            anim_w = max(1, int(target_w * anim_scale))
            anim_h = cv_h

            img_anim_disp = img_out.resize((anim_w, anim_h), Image.Resampling.BILINEAR)
            img_anim_bg = self.render_on_bg(img_anim_disp, self.bg_mode, anim_w, anim_h)
            self.anim_img_tk = ImageTk.PhotoImage(img_anim_bg)

        except Exception as e:
            print(f"[Preview Error] {e}")

    def toggle_anim_play(self):
        self.anim_running = not self.anim_running
        if self.anim_running:
            self.btn_anim_play.config(text="⏸ 一時停止")
            self.anim_last_time = time.time()
            self._anim_loop()
        else:
            self.btn_anim_play.config(text="▶ 再生")

    def _anim_loop(self):
        if not self.anim_running:
            return

        now = time.time()
        dt = now - self.anim_last_time
        self.anim_last_time = now

        speed = self.var_anim_speed.get()
        self.anim_scroll_y += speed * dt

        if self.anim_img_tk and self.anim_canvas:
            cv_w = self.anim_canvas.winfo_width()
            cv_h = self.anim_canvas.winfo_height()

            if cv_w > 10 and cv_h > 10:
                h = self.anim_img_tk.height()
                w = self.anim_img_tk.width()

                if h > 0:
                    offset_y = self.anim_scroll_y % h

                    cx = cv_w // 2
                    x_pos = cx - (w // 2)

                    self.anim_canvas.delete("all")

                    bg_color = "#000000" if self.bg_mode == "black" else ("#FFFFFF" if self.bg_mode == "white" else "#1E1E1E")
                    self.anim_canvas.config(bg=bg_color)

                    y1 = offset_y
                    y2 = offset_y - h
                    y3 = offset_y + h

                    self.anim_canvas.create_image(x_pos, y1, image=self.anim_img_tk, anchor="nw")
                    self.anim_canvas.create_image(x_pos, y2, image=self.anim_img_tk, anchor="nw")
                    self.anim_canvas.create_image(x_pos, y3, image=self.anim_img_tk, anchor="nw")

        self.root.after(30, self._anim_loop)

    def export_image(self):
        if not self.input_file_path or self.processed_img is None:
            messagebox.showerror("エラー", "画像が読み込まれていません。")
            return

        try:
            out_path = get_unique_output_path(self.input_file_path)
            self.processed_img.save(out_path, format="PNG")

            messagebox.showinfo(
                "保存完了",
                f"シームレス画像を正常にエクスポートしました！\n\n"
                f"保存先: {out_path}\n"
                f"解像度: {self.processed_img.width} x {self.processed_img.height}"
            )
        except Exception as e:
            messagebox.showerror("保存失敗", f"画像の保存中にエラーが発生しました:\n{e}")

    def on_closing(self):
        self.anim_running = False
        self.root.destroy()

def clamp(v, min_v, max_v):
    return max(min_v, min(v, max_v))

if __name__ == "__main__":
    root = tk.Tk()
    app = SkyGeneratorGUI(root)
    root.mainloop()
