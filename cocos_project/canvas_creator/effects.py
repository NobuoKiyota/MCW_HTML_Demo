import cv2
import numpy as np
from PIL import Image
import math

def apply_render_style(mask, style_type, intensity=0.5):
    """
    Apply a render texture/style to a grayscale mask image.
    mask: numpy array (grayscale, 0-255)
    style_type: "Ink", "Dot", "Spray"
    intensity: float (0.0 to 1.0)
    """
    if style_type == "Ink" or intensity <= 0.02:
        return mask
        
    h, w = mask.shape[:2]
    
    if style_type == "Dot":
        # Pixelate effect
        block_size = int(intensity * 30) + 2
        nw, nh = max(w // block_size, 1), max(h // block_size, 1)
        
        # Downsample and upsample using Nearest Neighbor
        small = cv2.resize(mask, (nw, nh), interpolation=cv2.INTER_LINEAR)
        pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
        
        # Binarize to sharpen dot edges
        _, binary = cv2.threshold(pixelated, 127, 255, cv2.THRESH_BINARY)
        return binary
        
    elif style_type == "Spray":
        # Spray can noise effect - confined to the mask shape and borders
        kernel_size = max(3, int(intensity * 10) | 1) # Odd size kernel
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        dilated = cv2.dilate(mask, kernel, iterations=1)
        
        # Generate Gaussian noise map
        noise = np.random.normal(0, intensity * 220.0, (h, w)).astype(np.float32)
        
        # Apply noise only where dilated mask exists
        dilated_f = dilated.astype(np.float32) / 255.0
        mask_f = mask.astype(np.float32)
        
        # Noise spreads outward but is zero in absolute black background regions
        sprayed = mask_f + noise * dilated_f
        
        # Binarize to create stippled spray dots
        result = np.zeros_like(mask)
        threshold = 127 - int(intensity * 50)
        result[sprayed > threshold] = 255
        
        # Erode the original mask to preserve a solid core
        erode_size = max(1, int((1.0 - intensity) * 4))
        core_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (erode_size, erode_size))
        core = cv2.erode(mask, core_kernel, iterations=1)
        
        # Combine solid core and outer spray splatter
        composite = np.maximum(result, core)
        return composite
        
    elif style_type == "Sketch":
        # Sketch / Diagonal Hatching style
        hatch = np.zeros((h, w), dtype=np.uint8)
        pitch = int((1.0 - intensity) * 12) + 3
        
        for i in range(-h, w, pitch):
            cv2.line(hatch, (i, 0), (i + h, h), 255, 1)
            
        return cv2.bitwise_and(mask, hatch)
        
    elif style_type == "Neon":
        # Neon / Outline double-line style
        k_size = int(intensity * 4) + 2
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
        
        dilated = cv2.dilate(mask, kernel, iterations=1)
        eroded = cv2.erode(mask, kernel, iterations=1)
        
        edge = cv2.subtract(dilated, eroded)
        return edge
        
    return mask

def apply_hologram_effect(img, intensity=0.5):
    """
    Hologram effect: Cyan tints, raster scanlines, horizontal jitter and RGB noise.
    """
    if intensity <= 0.02:
        return img
    h, w = img.shape[:2]
    
    # 1. Convert to gray
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. Colorize to hologram cyan (R: 0.25*gray, G: 0.78*gray, B: 1.0*gray)
    holo = np.zeros_like(img)
    holo[:, :, 0] = np.clip(gray * 1.0, 0, 255).astype(np.uint8) # B
    holo[:, :, 1] = np.clip(gray * 0.78, 0, 255).astype(np.uint8) # G
    holo[:, :, 2] = np.clip(gray * 0.25, 0, 255).astype(np.uint8) # R
    
    # 3. Apply horizontal scanlines (every 3rd line darkened)
    scanline_mask = np.ones((h, w), dtype=np.float32)
    scanline_mask[::3] = 1.0 - (intensity * 0.45)
    holo = (holo.astype(np.float32) * np.dstack([scanline_mask]*3)).astype(np.uint8)
    
    # 4. Micro horizontal slice jittering (hologram glitch)
    jitters = int(intensity * 12)
    for _ in range(jitters):
        y = np.random.randint(0, h-4)
        line_h = np.random.randint(1, 4)
        shift = int((np.random.rand() - 0.5) * intensity * 15.0)
        if shift != 0:
            holo[y:y+line_h, :] = np.roll(holo[y:y+line_h, :], shift, axis=1)
            
    return holo

def apply_smooth_effect(img, intensity=0.5):
    """
    Smooth: Median filter and bilateral filter combo to smooth out noise (makes it vector-like).
    """
    if intensity <= 0.02:
        return img
        
    # Median filter kernel size (must be odd)
    k_size = int(intensity * 6) * 2 + 1
    k_size = max(3, min(k_size, 15))
    
    # Pass 1: Median Blur to dissolve details
    med = cv2.medianBlur(img, k_size)
    
    # Pass 2: Bilateral filter to smooth flat parts but keep edges sharp
    d = int(intensity * 8) + 3
    sigma_color = intensity * 120.0
    sigma_space = intensity * 80.0
    out = cv2.bilateralFilter(med, d, sigma_color, sigma_space)
    
    # Blend back with original
    return cv2.addWeighted(img, 1.0 - intensity * 0.7, out, intensity * 0.7, 0)

def apply_kaleidoscope_effect(img, divisions=8):
    """
    Kaleidoscope reflective symmetry filter.
    """
    if divisions < 2:
        return img
        
    h, w = img.shape[:2]
    cx, cy = w // 2, h // 2
    
    x = np.arange(w) - cx
    y = np.arange(h) - cy
    xx, yy = np.meshgrid(x, y)
    
    r = np.sqrt(xx**2 + yy**2)
    theta = np.arctan2(yy, xx) * 180.0 / np.pi
    theta = np.mod(theta + 360.0, 360.0)
    
    angle_step = 360.0 / divisions
    
    sector = np.floor(theta / angle_step)
    rel_theta = np.mod(theta, angle_step)
    
    mirror_mask = (sector % 2 == 1)
    rel_theta[mirror_mask] = angle_step - rel_theta[mirror_mask]
    
    target_theta_rad = rel_theta * np.pi / 180.0
    tx = r * np.cos(target_theta_rad) + cx
    ty = r * np.sin(target_theta_rad) + cy
    
    tx = np.clip(tx, 0, w - 1).astype(np.float32)
    ty = np.clip(ty, 0, h - 1).astype(np.float32)
    
    out = cv2.remap(img, tx, ty, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    return out

def apply_sharp_effect(img, intensity=0.5):
    """
    Sharp: High pass contrast mask to sharpen detail edges.
    """
    if intensity <= 0.02:
        return img
        
    # Unsharp mask formula
    blur = cv2.GaussianBlur(img, (5, 5), 0)
    amount = intensity * 3.0
    sharp = img.astype(np.float32) + (img.astype(np.float32) - blur.astype(np.float32)) * amount
    
    return np.clip(sharp, 0, 255).astype(np.uint8)

def apply_glow_effect(img, intensity=0.5):
    """
    Glow / Bloom effect to simulate light radiance.
    """
    if intensity <= 0.02:
        return img
        
    k_size = int(intensity * 32) * 2 + 15
    k_size = k_size | 1
    
    blur = cv2.GaussianBlur(img, (k_size, k_size), 0)
    
    opacity = intensity * 0.85
    img_f = img.astype(np.float32)
    blur_f = blur.astype(np.float32) * opacity
    
    screen = 255.0 - ((255.0 - img_f) * (255.0 - blur_f) / 255.0)
    return np.clip(screen, 0, 255).astype(np.uint8)

def apply_metal_effect(img, intensity=0.5):
    """
    Metallic reflection / Chrome shine mapping.
    """
    if intensity <= 0.02:
        return img
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    
    freq = 1.0 + intensity * 3.5
    metal_gray = 127.5 + 127.5 * np.sin(gray * (freq * math.pi / 255.0))
    
    sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    edge = np.sqrt(sobelx**2 + sobely**2)
    cv2.normalize(edge, edge, 0, 255, cv2.NORM_MINMAX)
    
    composite = metal_gray + edge * intensity * 0.9
    composite = np.clip(composite, 0, 255).astype(np.uint8)
    
    return cv2.cvtColor(composite, cv2.COLOR_GRAY2BGR)

def apply_ripple_effect(img, intensity=0.5):
    """
    Concentric circular water ripples.
    Supports inward curvature (<0.5) and outward curvature (>0.5) based on slider value.
    """
    if intensity <= 0.02:
        return img
        
    h, w = img.shape[:2]
    cx, cy = w // 2, h // 2
    flex_x, flex_y = np.meshgrid(np.arange(w), np.arange(h))
    
    dx = flex_x - cx
    dy = flex_y - cy
    r = np.sqrt(dx**2 + dy**2)
    
    # 0.5 is neutral. Below 0.5 is inward curvature (negative amplitude), above 0.5 is outward curvature (positive amplitude).
    direction = (intensity - 0.5) * 2.0
    
    freq = 0.04 + abs(direction) * 0.09
    amp = direction * 35.0
    
    r_nonzero = np.where(r == 0, 1.0, r)
    offset_x = dx + (amp * np.sin(r * freq)) * (dx / r_nonzero)
    offset_y = dy + (amp * np.sin(r * freq)) * (dy / r_nonzero)
    
    map_x = (offset_x + cx).astype(np.float32)
    map_y = (offset_y + cy).astype(np.float32)
    
    out = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    return out

def apply_chromatic_effect(img, intensity=0.5):
    """
    Chromatic Aberration / RGB channel shift.
    """
    if intensity <= 0.02:
        return img
        
    shift = int(intensity * 15) + 1
    b, g, r = cv2.split(img)
    
    b_shifted = np.roll(b, shift, axis=1)
    r_shifted = np.roll(r, -shift, axis=1)
    
    return cv2.merge([b_shifted, g, r_shifted])

def apply_white_balance_effect(img, intensity=0.5):
    """
    White Balance: Adjusts color temperature (Cool vs Warm) and tightens blackpoint 
    to completely eliminate muddy gray backgrounds while boosting contrast.
    """
    if intensity <= 0.02:
        return img
        
    # 1. Color Temperature (Cool to Warm shift)
    temp_factor = (intensity - 0.5) * 2.0  # -1.0 to 1.0
    b, g, r_ch = cv2.split(img.astype(np.float32))
    
    if temp_factor < 0:
        # Cool: Boost Blue, reduce Red
        b = b * (1.0 + abs(temp_factor) * 0.25)
        r_ch = r_ch * (1.0 - abs(temp_factor) * 0.2)
    else:
        # Warm: Boost Red and Green, reduce Blue
        r_ch = r_ch * (1.0 + temp_factor * 0.25)
        g = g * (1.0 + temp_factor * 0.1)
        b = b * (1.0 - temp_factor * 0.2)
        
    img_temp = cv2.merge([b, g, r_ch])
    img_temp = np.clip(img_temp, 0, 255).astype(np.uint8)
    
    # 2. Blackpoint adjustment and contrast scaling
    # Alpha = Contrast multiplier. Beta = brightness offset.
    # We pull down beta significantly to darken background noise.
    alpha = 1.0 + (intensity * 1.0)
    beta = - (intensity * 85)
    
    balanced = cv2.convertScaleAbs(img_temp, alpha=alpha, beta=beta)
    return balanced

def apply_vignette_effect(img, intensity=0.5):
    """
    Smooth radial vignette (dark outer edges).
    """
    if intensity <= 0.02:
        return img
        
    h, w = img.shape[:2]
    
    kx = cv2.getGaussianKernel(w, w * (1.6 - intensity * 0.9))
    ky = cv2.getGaussianKernel(h, h * (1.6 - intensity * 0.9))
    mask = ky * kx.T
    
    mask = mask / mask.max()
    mask_3d = np.dstack([mask, mask, mask])
    
    out = (img.astype(np.float32) * mask_3d).astype(np.uint8)
    return out

def apply_bleed_effect(img, intensity=0.5):
    """
    Vector Bleed: Color/ink bleeding along a directional angle (45 degrees down-right).
    """
    if intensity <= 0.02:
        return img
        
    # Bleed distance based on intensity (up to 30px)
    dist = int(intensity * 28) + 2
    
    # Create directional motion blur kernel (line at 45 degrees)
    kernel = np.zeros((dist, dist), dtype=np.float32)
    for i in range(dist):
        kernel[i, i] = 1.0
    kernel /= kernel.sum()
    
    # Filter
    bled = cv2.filter2D(img, -1, kernel)
    
    # Screen blend composite: original + bled * opacity
    img_f = img.astype(np.float32)
    bled_f = bled.astype(np.float32) * (intensity * 0.85)
    
    composite = 255.0 - ((255.0 - img_f) * (255.0 - bled_f) / 255.0)
    return np.clip(composite, 0, 255).astype(np.uint8)

def apply_illust_effect(img, intensity=0.5):
    """
    Bilateral filter smoothing (illust / paint look).
    """
    if intensity <= 0.02:
        return img
        
    d = int(intensity * 12) + 3
    sigma_color = intensity * 140.0
    sigma_space = intensity * 90.0
    
    out = cv2.bilateralFilter(img, d, sigma_color, sigma_space)
    return out

def apply_all_effects(img, settings):
    """
    Apply configured GIMP/Game effects sequentially.
    """
    out = img.copy()
    
    # 1. Kaleidoscope first (shapes the geometric reflections)
    if settings.get("kaleidoscope_enabled", False):
        divisions = settings.get("kaleidoscope_divisions", 8)
        out = apply_kaleidoscope_effect(out, divisions)
        
    # 2. Ripple / Water Waves
    if settings.get("ripple_enabled", False):
        intensity = settings.get("ripple_intensity", 0.5)
        out = apply_ripple_effect(out, intensity)
        
    # 3. Hologram (cyan raster glitch)
    if settings.get("hologram_enabled", False):
        intensity = settings.get("hologram_intensity", 0.5)
        out = apply_hologram_effect(out, intensity)
        
    # 4. Vector Bleed (ink bleeding directional blur)
    if settings.get("bleed_enabled", False):
        intensity = settings.get("bleed_intensity", 0.5)
        out = apply_bleed_effect(out, intensity)
        
    # 5. Smooth (median + bilateral flat smoothing)
    if settings.get("smooth_enabled", False):
        intensity = settings.get("smooth_intensity", 0.5)
        out = apply_smooth_effect(out, intensity)
        
    # 6. Bilateral Illust (smooths internal noise)
    if settings.get("illust_enabled", False):
        intensity = settings.get("illust_intensity", 0.5)
        out = apply_illust_effect(out, intensity)
        
    # 7. Metallic reflective surface mapping
    if settings.get("metal_enabled", False):
        intensity = settings.get("metal_intensity", 0.5)
        out = apply_metal_effect(out, intensity)
        
    # 8. Sharp (contrast edge sharpener)
    if settings.get("sharp_enabled", False):
        intensity = settings.get("sharp_intensity", 0.5)
        out = apply_sharp_effect(out, intensity)
        
    # 9. Glow / Bloom radiance
    if settings.get("glow_enabled", False):
        intensity = settings.get("glow_intensity", 0.5)
        out = apply_glow_effect(out, intensity)
        
    # 10. Chromatic Aberration / RGB Split
    if settings.get("chromatic_enabled", False):
        intensity = settings.get("chromatic_intensity", 0.5)
        out = apply_chromatic_effect(out, intensity)
        
    # 11. White Balance
    if settings.get("white_balance_enabled", False):
        intensity = settings.get("white_balance_intensity", 0.5)
        out = apply_white_balance_effect(out, intensity)
        
    # 12. Vignette (ambient shadow framing)
    if settings.get("vignette_enabled", False):
        intensity = settings.get("vignette_intensity", 0.5)
        out = apply_vignette_effect(out, intensity)
        
    return out
