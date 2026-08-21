import os
import numpy as np
from PIL import Image, ImageColor, ImageFilter

def process_sky_image(
    input_path: str,
    target_width: int = 1024,
    target_height: int = 4096,
    auto_rotate: bool = True,
    auto_scale: bool = True,
    crop_offset: float = 0.5,       # 0.0 ~ 1.0 (横方向または縦方向の切り出し中心位置)
    blend_percent: float = 0.08,    # 0.0 ~ 0.25 (中央境界のクロスフェード幅割合)
    enable_chromakey: bool = False,
    chromakey_color: tuple = (135, 206, 235), # RGB (薄い天色)
    chromakey_tolerance: float = 40.0,
    chromakey_softness: float = 15.0,
    enable_monotone: bool = False,  # モノトーン(白黒)化
    contrast_mult: float = 1.0,     # コントラスト調整倍率 (0.5 ~ 2.0)
    noise_level: float = 0.0,       # 0.0 ~ 100.0 (ノイズ感)
    blur_radius: float = 0.0,       # 0.0 ~ 5.0 (スムース/ボカシ)
    sharpen_level: float = 0.0      # 0.0 ~ 3.0 (シャープ)
) -> Image.Image:
    """
    空の写真画像をCocos等の縦スクロール用にシームレス加工します。
    1. 90度回転 (必要に応じて)
    2. アスペクト比維持切り出し・拡大
    3. 上下50%分割・反転 (ループ端が100%シームレス化)
    4. 中央交差部のクロスフェード (滲み処理)
    5. クロマキー透過処理
    6. モノトーン・コントラスト調整
    7. ノイズ・スムース・シャープエフェクト処理
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    img = Image.open(input_path).convert('RGBA')
    w, h = img.size

    # 1. 90度回転判定 (横長写真なら縦長に回転)
    if auto_rotate and w > h:
        img = img.transpose(Image.ROTATE_270)
        w, h = img.size

    target_aspect = target_width / target_height

    # 2. クロップ＆リサイズ (アスペクト比調整)
    if auto_scale:
        current_aspect = w / h
        if current_aspect > target_aspect:
            new_w = int(h * target_aspect)
            max_x = w - new_w
            start_x = int(max_x * clamp(crop_offset, 0.0, 1.0))
            crop_box = (start_x, 0, start_x + new_w, h)
        else:
            new_h = int(w / target_aspect)
            max_y = h - new_h
            start_y = int(max_y * clamp(crop_offset, 0.0, 1.0))
            crop_box = (0, start_y, w, start_y + new_h)

        img_cropped = img.crop(crop_box)
        img_resized = img_cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
    else:
        img_resized = img.resize((target_width, target_height), Image.Resampling.LANCZOS)

    # NumPy配列に変換
    arr = np.array(img_resized, dtype=np.float32) # (H, W, 4)
    H, W, _ = arr.shape
    mid = H // 2

    # 3. 上下50%分割・反転 (Offset 50%)
    top_half = arr[:mid, :, :].copy()
    bottom_half = arr[mid:, :, :].copy()

    # 新しい画像: 上側に bottom_half, 下側に top_half
    offset_arr = np.vstack([bottom_half, top_half])

    # 4. 中央交差部 (y = mid 周辺) のクロスフェード (滲み・ブレンディング処理)
    if blend_percent > 0.0:
        blend_h = int(H * blend_percent)
        if blend_h > 0:
            half_b = blend_h // 2
            y_start = max(0, mid - half_b)
            y_end = min(H, mid + half_b)
            actual_blend_len = y_end - y_start

            if actual_blend_len > 1:
                fade_mask = np.linspace(0.0, 1.0, actual_blend_len, dtype=np.float32).reshape(-1, 1, 1)

                region = offset_arr[y_start:y_end, :, :]
                reversed_region = np.flip(region, axis=0)
                blended_region = region * (1.0 - fade_mask * 0.5) + reversed_region * (fade_mask * 0.5)
                offset_arr[y_start:y_end, :, :] = blended_region

    # 5. 薄い青などのクロマキー透過処理
    if enable_chromakey:
        target_rgb = np.array(chromakey_color, dtype=np.float32)
        rgb = offset_arr[:, :, :3]

        dist = np.linalg.norm(rgb - target_rgb, axis=2)

        tol = float(chromakey_tolerance)
        soft = max(1.0, float(chromakey_softness))

        alpha_factor = np.clip((dist - tol) / soft, 0.0, 1.0)
        offset_arr[:, :, 3] = offset_arr[:, :, 3] * alpha_factor

    # 6. モノトーン(白黒) & コントラスト調整
    if enable_monotone:
        r, g, b = offset_arr[:, :, 0], offset_arr[:, :, 1], offset_arr[:, :, 2]
        gray = 0.299 * r + 0.587 * g + 0.114 * b

        if contrast_mult != 1.0:
            gray = (gray - 128.0) * contrast_mult + 128.0

        gray_clamped = np.clip(gray, 0.0, 255.0)
        offset_arr[:, :, 0] = gray_clamped
        offset_arr[:, :, 1] = gray_clamped
        offset_arr[:, :, 2] = gray_clamped
    elif contrast_mult != 1.0:
        rgb = offset_arr[:, :, :3]
        rgb = (rgb - 128.0) * contrast_mult + 128.0
        offset_arr[:, :, :3] = np.clip(rgb, 0.0, 255.0)

    # 7. ノイズ感 (Grain / Noise) の加算
    if noise_level > 0.0:
        # ランダムガウシアンノイズ生成
        noise_std = noise_level * 0.6
        noise = np.random.normal(0, noise_std, (H, W, 3)).astype(np.float32)
        offset_arr[:, :, :3] = np.clip(offset_arr[:, :, :3] + noise, 0.0, 255.0)

    # uint8に変換
    final_arr = np.clip(offset_arr, 0, 255).astype(np.uint8)
    res_img = Image.fromarray(final_arr, 'RGBA')

    # 8. スムース (GaussianBlur) ＆ シャープ (UnsharpMask)
    if blur_radius > 0.0:
        res_img = res_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    if sharpen_level > 0.0:
        percent = int(sharpen_level * 120.0)
        res_img = res_img.filter(ImageFilter.UnsharpMask(radius=2, percent=percent, threshold=2))

    return res_img


def clamp(val, min_val, max_val):
    return max(min_val, min(val, max_val))


def get_unique_output_path(input_path: str) -> str:
    """
    同ディレクトリに 'filename_edit.png', 'filename_edit2.png' ... 形式で空きパスを返す
    """
    dirname, filename = os.path.split(input_path)
    name, ext = os.path.splitext(filename)

    ext = ".png"
    base_candidate = os.path.join(dirname, f"{name}_edit{ext}")
    if not os.path.exists(base_candidate):
        return base_candidate

    idx = 2
    while True:
        candidate = os.path.join(dirname, f"{name}_edit{idx}{ext}")
        if not os.path.exists(candidate):
            return candidate
        idx += 1
