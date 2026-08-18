import cv2
import numpy as np
import math
from PIL import Image
from effects import apply_render_style

def apply_bevel_gradient(mask, intensity):
    """
    Apply a posterized bevel gradient (3D relief shadow) to a flat mask shape.
    This solves the 'cheap flat fill' look for Ink and Dot styles.
    """
    if np.max(mask) == 0:
        return mask
        
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    cv2.normalize(dist, dist, 0, 255, cv2.NORM_MINMAX)
    dist = dist.astype(np.float32)
    
    shades = 5
    step = 255.0 / (shades - 1)
    posterized = np.round(dist / step) * step
    
    shade_map = 110.0 + (posterized / 255.0) * 145.0
    
    mask_f = mask.astype(np.float32)
    shaded = mask_f * (shade_map / 255.0)
    
    return np.clip(shaded, 0, 255).astype(np.uint8)

# =========================================================================
# STROKE MODULATION (PRESSURE / OPACITY EXPRESSIONS)
# =========================================================================
def draw_modulated_line(img, pt1, pt2, base_thickness, intensity, color=255):
    """Draw a line with simulated pressure: thinner/fainter at ends, thicker/darker in middle."""
    x1, y1 = pt1
    x2, y2 = pt2
    dx = x2 - x1
    dy = y2 - y1
    dist = math.hypot(dx, dy)
    
    if dist < 6:
        cv2.line(img, (int(x1), int(y1)), (int(x2), int(y2)), color, max(1, int(base_thickness)))
        return
        
    steps = int(dist / 2)
    
    for i in range(steps + 1):
        t = i / steps
        px = int(x1 + dx * t)
        py = int(y1 + dy * t)
        
        envelope = math.sin(t * math.pi)
        thickness = max(1, int(base_thickness * (0.35 + 0.65 * envelope)))
        alpha = int(color * (0.4 + 0.6 * envelope))
        
        t_next = (i + 1) / steps
        if t_next <= 1.0:
            px2 = int(x1 + dx * t_next)
            py2 = int(y1 + dy * t_next)
            cv2.line(img, (px, py), (px2, py2), alpha, thickness)

def draw_modulated_curve(img, pts, base_thickness, intensity, color=255, closed=False):
    """Draw a polyline path with simulated pressure along its entire length."""
    if len(pts) < 2:
        return
        
    dists = [0.0]
    total_dist = 0.0
    for i in range(len(pts) - 1):
        d = math.hypot(pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1])
        total_dist += d
        dists.append(total_dist)
        
    if closed:
        d = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
        total_dist += d
        dists.append(total_dist)
        pts = list(pts) + [pts[0]]
        
    if total_dist < 4:
        return
        
    for i in range(len(pts) - 1):
        pt1 = pts[i]
        pt2 = pts[i+1]
        
        progress = (dists[i] + dists[i+1]) / 2.0 / total_dist
        envelope = math.sin(progress * math.pi)
        
        thickness = max(1, int(base_thickness * (0.35 + 0.65 * envelope)))
        alpha = int(color * (0.45 + 0.55 * envelope))
        
        cv2.line(img, (int(pt1[0]), int(pt1[1])), (int(pt2[0]), int(pt2[1])), alpha, thickness)

# =========================================================================
# COMPLEX PROCEDURAL GEOMETRY (MOTIFS)
# =========================================================================
def draw_pointy_arch(img, pt1, pt2, height_offset, thickness, color):
    """Draw a Gothic pointed arch (two intersecting arcs meeting at a top point)."""
    x1, y1 = pt1
    x2, y2 = pt2
    
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    
    px = cx
    py = cy - height_offset
    
    pts_left = []
    pts_right = []
    steps = 30
    for i in range(steps + 1):
        t = i / steps
        # Left side curve
        lx = (1-t)**2 * x1 + 2*(1-t)*t * x1 + t**2 * px
        ly = (1-t)**2 * y1 + 2*(1-t)*t * py + t**2 * py
        pts_left.append([int(lx), int(ly)])
        
        # Right side curve
        rx = (1-t)**2 * x2 + 2*(1-t)*t * x2 + t**2 * px
        ry = (1-t)**2 * y2 + 2*(1-t)*t * py + t**2 * py
        pts_right.append([int(rx), int(ry)])
        
    cv2.polylines(img, [np.array(pts_left, dtype=np.int32)], False, color, thickness)
    cv2.polylines(img, [np.array(pts_right, dtype=np.int32)], False, color, thickness)

def draw_spirograph(img, center, r_outer, r_inner, rho, thickness, color):
    """Draw a mathematical spirograph / hypotrochoid curve."""
    cx, cy = center
    pts = []
    steps = 360
    for i in range(steps + 1):
        theta = i * (math.pi / 90.0)
        R_minus_r = r_outer - r_inner
        x = R_minus_r * math.cos(theta) + rho * math.cos(R_minus_r * theta / max(1, r_inner))
        y = R_minus_r * math.sin(theta) - rho * math.sin(R_minus_r * theta / max(1, r_inner))
        pts.append([int(cx + x), int(cy + y)])
    cv2.polylines(img, [np.array(pts, dtype=np.int32)], False, color, thickness)

def draw_spiral_motif(img, center, r_max, thickness, color, coils=3):
    """Draw an Archimedean spiral starting from center."""
    cx, cy = center
    pts = []
    steps = 200
    for i in range(steps + 1):
        t = i / steps
        theta = t * coils * 2.0 * math.pi
        r = t * r_max
        x = cx + r * math.cos(theta)
        y = cy + r * math.sin(theta)
        pts.append([int(x), int(y)])
    draw_modulated_curve(img, pts, thickness, 0.5, color)

def draw_twisted_rope(img, pt1, pt2, thickness, color, pitch=15.0):
    """Draw a twisted cable rope between two points."""
    x1, y1 = pt1
    x2, y2 = pt2
    dx = x2 - x1
    dy = y2 - y1
    dist = math.hypot(dx, dy)
    
    if dist < 10:
        cv2.line(img, (int(x1), int(y1)), (int(x2), int(y2)), color, thickness)
        return
        
    angle = math.atan2(dy, dx)
    steps = int(dist)
    
    pts1 = []
    pts2 = []
    for i in range(steps + 1):
        t = i / dist
        lx = x1 + dx * t
        ly = y1 + dy * t
        
        sine_val = math.sin(i * (2.0 * math.pi / pitch)) * (thickness * 0.7)
        
        px1 = lx + sine_val * math.cos(angle + math.pi/2.0)
        py1 = ly + sine_val * math.sin(angle + math.pi/2.0)
        
        px2 = lx - sine_val * math.cos(angle + math.pi/2.0)
        py2 = ly - sine_val * math.sin(angle + math.pi/2.0)
        
        pts1.append([int(px1), int(py1)])
        pts2.append([int(px2), int(py2)])
        
    draw_modulated_curve(img, pts1, max(1, thickness // 2), 0.5, color)
    draw_modulated_curve(img, pts2, max(1, thickness // 2), 0.5, color)

def draw_ribbon_band(img, pt1, pt2, width, color):
    """Draw a twisting flat ribbon between two points."""
    x1, y1 = pt1
    x2, y2 = pt2
    dx = x2 - x1
    dy = y2 - y1
    dist = math.hypot(dx, dy)
    
    if dist < 10:
        cv2.line(img, (int(x1), int(y1)), (int(x2), int(y2)), color, width)
        return
        
    angle = math.atan2(dy, dx)
    steps = int(dist)
    
    pts = []
    for i in range(steps + 1):
        t = i / dist
        lx = x1 + dx * t
        ly = y1 + dy * t
        
        w_mod = math.sin(i * (math.pi / 40.0)) * (width * 0.5)
        
        px1 = lx + w_mod * math.cos(angle + math.pi/2)
        py1 = ly + w_mod * math.sin(angle + math.pi/2)
        pts.append([int(px1), int(py1)])
        
    draw_modulated_curve(img, pts, 2, 0.5, color)

def draw_crystal_flake(img, center, r, thickness, color, points=6):
    """Draw a crystal / snowflake fractal structure centered."""
    cx, cy = center
    for i in range(points):
        angle = i * (2.0 * math.pi / points)
        bx = cx + r * math.cos(angle)
        by = cy + r * math.sin(angle)
        
        draw_modulated_line(img, (cx, cy), (bx, by), thickness, 0.5, color)
        
        spur_length = r * 0.25
        for t in [0.4, 0.7]:
            ox = cx + r * t * math.cos(angle)
            oy = cy + r * t * math.sin(angle)
            
            s1_x = ox + spur_length * math.cos(angle + math.pi/4)
            s1_y = oy + spur_length * math.sin(angle + math.pi/4)
            s2_x = ox + spur_length * math.cos(angle - math.pi/4)
            s2_y = oy + spur_length * math.sin(angle - math.pi/4)
            
            draw_modulated_line(img, (int(ox), int(oy)), (int(s1_x), int(s1_y)), max(1, thickness-1), 0.5, color)
            draw_modulated_line(img, (int(ox), int(oy)), (int(s2_x), int(s2_y)), max(1, thickness-1), 0.5, color)

def draw_sword_blade(img, center, r, thickness, color, angle=0):
    """Draw a detailed sword blade shape centered and rotated."""
    cx, cy = center
    rad = math.radians(angle)
    
    pts_local = [
        [0, -r],
        [int(thickness * 1.5), -int(r * 0.7)],
        [int(thickness * 1.8), int(r * 0.8)],
        [int(thickness * 2.5), int(r * 0.85)],
        [0, int(r * 0.9)],
        [-int(thickness * 2.5), int(r * 0.85)],
        [-int(thickness * 1.8), int(r * 0.8)],
        [-int(thickness * 1.5), -int(r * 0.7)]
    ]
    
    pts = []
    for x, y in pts_local:
        rx = cx + x * math.cos(rad) - y * math.sin(rad)
        ry = cy + x * math.sin(rad) + y * math.cos(rad)
        pts.append([int(rx), int(ry)])
        
    cv2.fillPoly(img, [np.array(pts, dtype=np.int32)], color)
    groove_start_y = -int(r * 0.6)
    groove_end_y = int(r * 0.75)
    gs_x = cx + 0 * math.cos(rad) - groove_start_y * math.sin(rad)
    gs_y = cy + 0 * math.sin(rad) + groove_start_y * math.cos(rad)
    ge_x = cx + 0 * math.cos(rad) - groove_end_y * math.sin(rad)
    ge_y = cy + 0 * math.sin(rad) + groove_end_y * math.cos(rad)
    cv2.line(img, (int(gs_x), int(gs_y)), (int(ge_x), int(ge_y)), 0, max(1, thickness//3))

def draw_gear(img, center, r_outer, teeth_count, intensity, color):
    """Draw a steampunk gear wheel."""
    cx, cy = center
    r_inner = int(r_outer * 0.7)
    r_hole = int(r_outer * 0.25)
    
    cv2.circle(img, (cx, cy), r_inner, color, -1 if intensity > 0.6 else max(1, int(r_outer * 0.1)))
    cv2.circle(img, (cx, cy), r_hole, 0, -1)
    
    for i in range(teeth_count):
        angle = i * (2 * math.pi / teeth_count)
        p1_x = int(cx + r_inner * math.cos(angle - 0.12))
        p1_y = int(cy + r_inner * math.sin(angle - 0.12))
        p2_x = int(cx + r_outer * math.cos(angle - 0.06))
        p2_y = int(cy + r_outer * math.sin(angle - 0.06))
        p3_x = int(cx + r_outer * math.cos(angle + 0.06))
        p3_y = int(cy + r_outer * math.sin(angle + 0.06))
        p4_x = int(cx + r_inner * math.cos(angle + 0.12))
        p4_y = int(cy + r_inner * math.sin(angle + 0.12))
        
        pts = np.array([[p1_x, p1_y], [p2_x, p2_y], [p3_x, p3_y], [p4_x, p4_y]], dtype=np.int32)
        cv2.fillPoly(img, [pts], color)

# =========================================================================
# ROTATION UTILITY FOR POLYGON FRAME GENERATION
# =========================================================================
def rotate_image(image, angle, center):
    """Rotate an image centered around a point."""
    rot_mat = cv2.getRotationMatrix2D(center, angle, 1.0)
    # Bilinear filtering ensures smooth geometry edges after arbitrary rotations
    rotated = cv2.warpAffine(image, rot_mat, (image.shape[1], image.shape[0]), flags=cv2.INTER_LINEAR)
    return rotated

# =========================================================================
# MAIN GENERATOR LOGIC
# =========================================================================
def generate_part_mask(part_name, genre, pattern, style, intensity, range_val, W, H):
    """
    Generate the base component mask (representing only 1 quadrant/side) for Corners and Sides.
    This enables dynamic polygon (3 to 6-sided) frame construction.
    """
    mask = np.zeros((H, W), dtype=np.uint8)
    if intensity <= 0.02:
        return mask
        
    short_edge = min(W, H)
    cx, cy = W // 2, H // 2
    
    # Calculate base size dimensions
    max_cs = max(8, int(short_edge * 0.48))
    cs = int(short_edge * 0.25 * range_val)
    cs = max(8, min(cs, max_cs))
    
    thick = max(1, int(intensity * short_edge * 0.04))
    thin = max(1, int(thick * 0.4))
    
    # ----------------------------------------------------
    # 1. 4Corners & 4CornersDec (Draws ONLY Top-Left corner)
    # ----------------------------------------------------
    if part_name in ["4Corners", "4CornersDec"]:
        c_mask = np.zeros((cs, cs), dtype=np.uint8)
        
        if genre == "Geometry":
            if pattern == "P1":
                cv2.circle(c_mask, (0, 0), int(cs * 0.4), 255, thin)
                cv2.circle(c_mask, (0, 0), int(cs * 0.7), 255, thin)
            elif pattern == "P2":
                for i in range(1, 5):
                    cv2.line(c_mask, (0, i * cs//5), (i * cs//5, 0), 255, thin)
            elif pattern == "P3":
                pts = np.array([[0, 0], [cs, 0], [0, cs]], dtype=np.int32)
                cv2.polylines(c_mask, [pts], True, 255, thin)
            elif pattern == "P4":
                for ang in [15, 30, 45, 60, 75]:
                    rad = math.radians(ang)
                    cv2.line(c_mask, (0, 0), (int(cs*math.cos(rad)), int(cs*math.sin(rad))), 255, thin)
            elif pattern == "P5":
                draw_spiral_motif(c_mask, (0, 0), cs, thin, 255, coils=1.5)
            elif pattern == "P6":
                draw_twisted_rope(c_mask, (0, cs), (cs, 0), thick, 255, pitch=8.0)
            elif pattern == "P7":
                draw_ribbon_band(c_mask, (0, cs), (cs, 0), thick * 2, 255)
            elif pattern == "P8":
                cv2.line(c_mask, (0, 0), (cs, 0), 255, thick)
                cv2.line(c_mask, (0, 0), (0, cs), 255, thick)
                cv2.line(c_mask, (cs, 0), (0, cs), 255, thin)
            elif pattern == "P9":
                cv2.rectangle(c_mask, (0, 0), (int(cs*0.75), int(cs*0.75)), 255, thin)
                cv2.rectangle(c_mask, (0, 0), (int(cs*0.4), int(cs*0.4)), 255, thin)
            else: # P10
                draw_spirograph(c_mask, (0, 0), cs, int(cs*0.35), int(cs*0.5), thin, 255)
                
        elif genre == "SF":
            if pattern == "P1":
                cv2.line(c_mask, (0, 0), (cs, 0), 255, thick)
                cv2.line(c_mask, (0, 0), (0, cs), 255, thick)
            elif pattern == "P2":
                step = max(5, int(cs*0.2))
                for x in range(1, int(cs/step)):
                    for y in range(1, int(cs/step)):
                        if x + y < int(cs/step)+1:
                            cv2.circle(c_mask, (x*step, y*step), thin, 255, -1)
            elif pattern == "P3":
                cv2.line(c_mask, (0, int(cs*0.3)), (int(cs*0.4), int(cs*0.3)), 255, thick)
                cv2.line(c_mask, (int(cs*0.4), int(cs*0.3)), (int(cs*0.7), int(cs*0.6)), 255, thick)
            elif pattern == "P4":
                cv2.circle(c_mask, (0, 0), int(cs*0.5), 255, thin)
                cv2.line(c_mask, (0, 0), (cs, 0), 255, thin)
                cv2.line(c_mask, (0, 0), (0, cs), 255, thin)
            elif pattern == "P5":
                h_pts = np.array([[0,0], [10, 5], [10, 15], [0, 20], [-10, 15], [-10, 5]], dtype=np.int32)
                cv2.polylines(c_mask, [h_pts + [int(cs*0.3), int(cs*0.3)]], True, 255, thin)
                cv2.polylines(c_mask, [h_pts + [int(cs*0.6), int(cs*0.3)]], True, 255, thin)
            elif pattern == "P6":
                for r in [int(cs*0.35), int(cs*0.7)]:
                    pts = []
                    for i in range(45):
                        angle = i * (math.pi / 90.0)
                        wave = r + 4 * math.sin(angle * 16)
                        pts.append([int(wave * math.cos(angle)), int(wave * math.sin(angle))])
                    cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P7":
                cv2.circle(c_mask, (0, 0), int(cs*0.5), 100, thick)
                cv2.circle(c_mask, (0, 0), int(cs*0.5), 255, thin)
            elif pattern == "P8":
                for y in range(0, cs, 8):
                    cv2.line(c_mask, (0, y), (cs - y, y), 255, thin)
            elif pattern == "P9":
                for x in range(0, cs, 6):
                    cv2.line(c_mask, (x, 0), (x, cs - x), 255, max(1, x%4))
            else: # P10
                cv2.circle(c_mask, (int(cs*0.35), int(cs*0.35)), 5, 255, -1)
                cv2.circle(c_mask, (int(cs*0.7), int(cs*0.7)), 3, 255, -1)
                cv2.line(c_mask, (0, 0), (int(cs*0.35), int(cs*0.35)), 255, thin)
                cv2.line(c_mask, (int(cs*0.35), int(cs*0.35)), (int(cs*0.7), int(cs*0.7)), 255, thin)
                
        elif genre == "Fantasy":
            if pattern == "P1":
                pts = [[0, 0]]
                for t in np.linspace(0, math.pi*1.5, 30):
                    pts.append([int(cs * 0.7 * math.sin(t) * (1.0 - t/6.0)), int(cs * 0.7 * math.cos(t) * (1.0 - t/6.0))])
                draw_modulated_curve(c_mask, pts, thin, 0.5, 255)
            elif pattern == "P2":
                cv2.line(c_mask, (0, cs), (cs, 0), 255, thin)
                cv2.circle(c_mask, (int(cs*0.5), int(cs*0.5)), int(cs*0.2), 255, thin)
            elif pattern == "P3":
                pts = np.array([[0,0], [cs, 0], [int(cs*0.7), int(cs*0.7)], [0, cs]], dtype=np.int32)
                cv2.polylines(c_mask, [pts], True, 255, thin)
            elif pattern == "P4":
                cv2.circle(c_mask, (int(cs*0.4), int(cs*0.4)), int(cs*0.25), 255, -1)
                cv2.circle(c_mask, (int(cs*0.47), int(cs*0.4)), int(cs*0.24), 0, -1)
            elif pattern == "P5":
                cv2.line(c_mask, (0, 0), (int(cs*0.6), int(cs*0.6)), 255, thick)
                cv2.line(c_mask, (int(cs*0.2), int(cs*0.2)), (int(cs*0.35), int(cs*0.1)), 255, thin)
                cv2.line(c_mask, (int(cs*0.4), int(cs*0.4)), (int(cs*0.55), int(cs*0.3)), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(c_mask, (0, cs), (cs, 0), thick, 255, pitch=12.0)
            elif pattern == "P7":
                draw_ribbon_band(c_mask, (0, cs), (cs, 0), thick*2, 255)
            elif pattern == "P8":
                draw_sword_blade(c_mask, (int(cs*0.35), int(cs*0.35)), int(cs*0.4), thin, 255, angle=-45)
            elif pattern == "P9":
                draw_crystal_flake(c_mask, (int(cs*0.45), int(cs*0.45)), int(cs*0.35), thin, 255)
            else: # P10
                cv2.circle(c_mask, (0, 0), cs, 255, thin)
                cv2.circle(c_mask, (0, 0), int(cs*0.8), 255, thin)
                for ang in [20, 45, 70]:
                    rad = math.radians(ang)
                    cv2.circle(c_mask, (int(cs*0.9 * math.cos(rad)), int(cs*0.9 * math.sin(rad))), 4, 255, -1)
                    
        elif genre == "Steampunk":
            if pattern == "P1":
                draw_gear(c_mask, (0, 0), int(cs*0.6), 8, intensity, 255)
            elif pattern == "P2":
                pts = np.array([[0,0], [cs, 0], [int(cs*0.65), int(cs*0.65)], [0, cs]], dtype=np.int32)
                cv2.fillPoly(c_mask, [pts], 160)
                cv2.polylines(c_mask, [pts], True, 255, thin)
                cv2.circle(c_mask, (int(cs*0.25), int(cs*0.25)), int(cs*0.06), 255, -1)
            elif pattern == "P3":
                cv2.line(c_mask, (0, int(cs*0.3)), (int(cs*0.4), int(cs*0.3)), 255, thick)
                cv2.line(c_mask, (int(cs*0.4), int(cs*0.3)), (int(cs*0.4), cs), 255, thick)
            elif pattern == "P4":
                cv2.circle(c_mask, (0, 0), int(cs*0.5), 255, thin)
                cv2.line(c_mask, (0, 0), (int(cs*0.35), int(cs*0.35)), 255, thick)
            elif pattern == "P5":
                pts = []
                for i in range(120):
                    theta = i * (math.pi / 20.0)
                    r = cs * 0.2 + (i/120.0) * cs * 0.6
                    x = r * math.cos(theta)
                    y = r * math.sin(theta)
                    pts.append([int(abs(x)), int(abs(y))])
                cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(c_mask, (0, cs), (cs, 0), thick, 255, pitch=7.0)
            elif pattern == "P7":
                cv2.circle(c_mask, (int(cs*0.45), int(cs*0.45)), int(cs*0.35), 255, thin)
                cv2.circle(c_mask, (int(cs*0.45), int(cs*0.45)), int(cs*0.08), 255, -1)
                for i in range(4):
                    angle = i * math.pi/2
                    cv2.line(c_mask, (int(cs*0.45), int(cs*0.45)), 
                             (int(cs*0.45 + cs*0.35*math.cos(angle)), int(cs*0.45 + cs*0.35*math.sin(angle))), 255, thin)
            elif pattern == "P8":
                cv2.rectangle(c_mask, (0, int(cs*0.3)), (int(cs*0.65), int(cs*0.5)), 255, -1)
                cv2.circle(c_mask, (int(cs*0.65), int(cs*0.4)), int(cs*0.12), 255, -1)
            elif pattern == "P9":
                draw_gear(c_mask, (0, 0), int(cs*0.5), 12, 0.4, 255)
            else: # P10
                cv2.line(c_mask, (0, int(cs*0.5)), (cs, 0), 255, thick)
                for i in range(0, cs, 8):
                    cv2.line(c_mask, (i, cs - i), (i + 4, cs - i + 4), 255, thin)
                    
        elif genre == "Japanese":
            if pattern == "P1":
                cv2.line(c_mask, (0, cs), (cs, 0), 255, thick)
                cv2.line(c_mask, (0, int(cs*0.8)), (int(cs*0.8), 0), 255, thin)
            elif pattern == "P2":
                step = cs // 4
                for x in range(4):
                    for y in range(4):
                        if (x + y) % 2 == 0:
                            cv2.rectangle(c_mask, (x*step, y*step), ((x+1)*step, (y+1)*step), 255, -1)
            elif pattern == "P3":
                for r in [int(cs*0.45), int(cs*0.75)]:
                    cv2.circle(c_mask, (0, 0), r, 255, thin)
            elif pattern == "P4":
                cx_j, cy_j = int(cs*0.4), int(cs*0.4)
                cv2.circle(c_mask, (cx_j, cy_j), int(cs*0.25), 255, thin)
                cv2.ellipse(c_mask, (cx_j, cy_j), (int(cs*0.25), int(cs*0.25)), 0, 0, 95, 255, thin+2)
            elif pattern == "P5":
                pts = []
                for i in range(10):
                    angle = i * (math.pi / 5.0)
                    r = int(cs * 0.35) if i % 2 == 0 else int(cs * 0.18)
                    pts.append([int(cs*0.45 + r*math.cos(angle)), int(cs*0.45 + r*math.sin(angle))])
                cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], True, 255, thin)
            elif pattern == "P6":
                cv2.circle(c_mask, (int(cs*0.3), int(cs*0.3)), int(cs*0.25), 255, -1)
                cv2.circle(c_mask, (int(cs*0.6), int(cs*0.35)), int(cs*0.2), 255, -1)
                cv2.circle(c_mask, (int(cs*0.35), int(cs*0.6)), int(cs*0.2), 255, -1)
            elif pattern == "P7":
                step = cs // 3
                for i in range(4):
                    cv2.line(c_mask, (0, i*step), (cs, i*step), 255, thin)
                    cv2.line(c_mask, (i*step, 0), (i*step, cs), 255, thin)
            elif pattern == "P8":
                for i in range(3):
                    offset = i * cs // 3
                    cv2.line(c_mask, (0, offset), (cs - offset, cs), 255, thin)
            elif pattern == "P9":
                freq = 0.05
                pts = []
                for x in range(cs):
                    y = int(cs * 0.5 + 8 * math.sin(x * freq))
                    pts.append([x, y])
                cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            else: # P10
                pts = np.array([[0, cs], [int(cs*0.35), int(cs*0.55)], [int(cs*0.25), int(cs*0.25)], [int(cs*0.55), int(cs*0.35)], [cs, 0]], dtype=np.int32)
                cv2.fillPoly(c_mask, [pts], 255)
                
        elif genre == "Gothic":
            if pattern == "P1":
                draw_pointy_arch(c_mask, (0, cs), (cs, 0), int(cs*0.25), thin, 255)
            elif pattern == "P2":
                cv2.circle(c_mask, (0, 0), cs, 255, thin)
                cv2.circle(c_mask, (0, 0), int(cs*0.65), 255, thin)
            elif pattern == "P3":
                draw_modulated_line(c_mask, (0, 0), (cs, cs), thick, 0.5, 255)
                cv2.circle(c_mask, (int(cs*0.5), int(cs*0.5)), int(cs*0.12), 255, -1)
            elif pattern == "P4":
                cv2.ellipse(c_mask, (int(cs*0.45), int(cs*0.45)), (int(cs*0.25), int(cs*0.15)), -45, 0, 360, 255, -1)
            elif pattern == "P5":
                cv2.line(c_mask, (0, cs), (cs, 0), 255, thin)
                cv2.line(c_mask, (int(cs*0.4), int(cs*0.6)), (int(cs*0.3), int(cs*0.5)), 255, thin)
                cv2.line(c_mask, (int(cs*0.6), int(cs*0.4)), (int(cs*0.7), int(cs*0.5)), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(c_mask, (0, cs), (cs, 0), thick, 255, pitch=9.0)
            elif pattern == "P7":
                cv2.circle(c_mask, (0, 0), cs, 255, thin)
                for ang in [22.5, 45, 67.5]:
                    rad = math.radians(ang)
                    cv2.line(c_mask, (0, 0), (int(cs*math.cos(rad)), int(cs*math.sin(rad))), 255, thin)
            elif pattern == "P8":
                draw_pointy_arch(c_mask, (0, cs), (cs, 0), int(cs*0.15), thin, 255)
                cv2.line(c_mask, (0, 0), (cs, cs), 255, thin)
            elif pattern == "P9":
                pts = np.array([[0, cs], [int(cs*0.45), int(cs*0.45)], [cs, 0], [int(cs*0.35), int(cs*0.55)]], dtype=np.int32)
                cv2.fillPoly(c_mask, [pts], 255)
            else: # P10
                cv2.circle(c_mask, (int(cs*0.45), int(cs*0.45)), int(cs*0.3), 255, thin)
                cv2.circle(c_mask, (int(cs*0.35), int(cs*0.4)), int(cs*0.07), 255, -1)
                cv2.circle(c_mask, (int(cs*0.55), int(cs*0.4)), int(cs*0.07), 255, -1)
                
        elif genre == "Organic":
            if pattern == "P1":  # Tentacle (触手)
                pts = [[0, cs]]
                for t in np.linspace(0, 1.0, 30):
                    px = int(cs * (t + 0.1 * math.sin(t * 10)))
                    py = int(cs * (1.0 - t + 0.15 * math.cos(t * 8)))
                    pts.append([px, py])
                draw_modulated_curve(c_mask, pts, thin, 0.4, 255)
            elif pattern == "P2":  # Cell grid (細胞)
                for cx_val, cy_val, r in [(0.2, 0.8, 0.15), (0.4, 0.7, 0.12), (0.6, 0.5, 0.16), (0.8, 0.3, 0.13)]:
                    cv2.circle(c_mask, (int(cs*cx_val), int(cs*cy_val)), int(cs*r), 255, -1)
                    cv2.circle(c_mask, (int(cs*cx_val), int(cs*cy_val)), int(cs*r*0.4), 0, -1)
            elif pattern == "P3":  # Spine/Bone (背骨)
                for t in np.linspace(0.1, 0.9, 8):
                    px = int(cs * t)
                    py = int(cs * (1.0 - t))
                    r = int(cs * (0.05 + 0.08 * math.sin(t * math.pi)))
                    cv2.circle(c_mask, (px, py), r, 255, -1)
                cv2.line(c_mask, (0, cs), (cs, 0), 255, thin)
            elif pattern == "P4":  # Vein (葉脈)
                cv2.line(c_mask, (0, cs), (cs, 0), 255, thick)
                for t in [0.2, 0.4, 0.6, 0.8]:
                    p1 = (int(cs*t), int(cs*(1.0-t)))
                    p2 = (int(cs*t + cs*0.15), int(cs*(1.0-t) - cs*0.12))
                    cv2.line(c_mask, p1, p2, 255, thin)
            elif pattern == "P5":  # Capillaries (血管)
                pts = [(0, cs, 45)]
                for _ in range(3):
                    next_pts = []
                    for (x, y, ang) in pts:
                        r = int(cs * 0.25)
                        x2 = int(x + r * math.cos(math.radians(ang)))
                        y2 = int(y - r * math.sin(math.radians(ang)))
                        cv2.line(c_mask, (x, y), (x2, y2), 255, thin)
                        next_pts.append((x2, y2, ang + 25))
                        next_pts.append((x2, y2, ang - 25))
                    pts = next_pts[:4]
            elif pattern == "P6":  # Pulse (生体ウェーブ)
                pts = []
                for x in range(cs):
                    freq = 0.1
                    spike = 0
                    if 0.3*cs < x < 0.6*cs:
                        spike = cs * 0.45 * math.sin((x - 0.3*cs)*0.15)
                    y = int(cs * 0.7 - (x * 0.3) - spike)
                    pts.append([x, y])
                cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P7":  # Nautilus Spiral (対数螺旋)
                pts = []
                for theta in np.linspace(0, 4 * math.pi, 100):
                    r = cs * 0.05 * math.exp(0.18 * theta)
                    if r > cs: break
                    px = int(cs*0.4 + r * math.cos(theta))
                    py = int(cs*0.6 - r * math.sin(theta))
                    if 0 <= px < cs and 0 <= py < cs:
                        pts.append([px, py])
                if len(pts) > 1:
                    cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P8":  # Muscle Fibers (筋肉繊維)
                for offset in range(-20, 20, 5):
                    pts = []
                    for x in range(cs):
                        y = int(cs - x + offset + 6 * math.sin(x * 0.08))
                        pts.append([x, y])
                    cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, 1)
            elif pattern == "P9":  # Fang claws (牙爪)
                for t in [0.2, 0.4, 0.6, 0.8]:
                    cx_val = int(cs * t)
                    cy_val = int(cs * (1.0 - t))
                    cv2.ellipse(c_mask, (cx_val, cy_val), (int(cs*0.1), int(cs*0.06)), -45, 0, 180, 255, -1)
            else: # P10 (Heartbeat / 双対パルス)
                pts1, pts2 = [], []
                for x in range(cs):
                    y1 = int(cs * 0.6 - x * 0.3 + 8 * math.sin(x * 0.1))
                    y2 = int(cs * 0.8 - x * 0.3 + 8 * math.sin(x * 0.1))
                    pts1.append([x, y1])
                    pts2.append([x, y2])
                cv2.polylines(c_mask, [np.array(pts1, dtype=np.int32)], False, 255, thin)
                cv2.polylines(c_mask, [np.array(pts2, dtype=np.int32)], False, 255, thin)
                
        elif genre == "Baroque":
            if pattern == "P1":  # Acanthus (アカンサス唐草)
                for offset in [0, int(cs*0.18)]:
                    pts = []
                    for t in np.linspace(0, math.pi*2.2, 50):
                        r = cs * 0.28 * (1.0 - t/10.0)
                        px = int(cs*0.5 + offset + r * math.cos(t))
                        py = int(cs*0.5 - offset + r * math.sin(t))
                        pts.append([px, py])
                    cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P2":  # Rocaille shell (貝殻カーブヒダ)
                for r in np.linspace(cs*0.15, cs*0.6, 5):
                    cv2.ellipse(c_mask, (0, cs), (int(r), int(r*0.75)), -30, 0, 90, 255, thin)
            elif pattern == "P3":  # Royal Emblem (百合のシンメトリー紋章)
                cx_val, cy_val = int(cs*0.5), int(cs*0.5)
                cv2.ellipse(c_mask, (cx_val, cy_val), (int(cs*0.08), int(cs*0.2)), 0, 0, 360, 255, -1)
                cv2.ellipse(c_mask, (cx_val - int(cs*0.08), cy_val + int(cs*0.05)), (int(cs*0.12), int(cs*0.08)), 45, 0, 360, 255, thin)
                cv2.ellipse(c_mask, (cx_val + int(cs*0.08), cy_val + int(cs*0.05)), (int(cs*0.12), int(cs*0.08)), -45, 0, 360, 255, thin)
                cv2.line(c_mask, (cx_val - int(cs*0.2), cy_val + int(cs*0.1)), (cx_val + int(cs*0.2), cy_val + int(cs*0.1)), 255, thick)
            elif pattern == "P4":  # Cartouche (飾り板・オーバル枠)
                cv2.ellipse(c_mask, (int(cs*0.45), int(cs*0.45)), (int(cs*0.28), int(cs*0.18)), -45, 0, 360, 255, thin)
                cv2.ellipse(c_mask, (int(cs*0.45), int(cs*0.45)), (int(cs*0.24), int(cs*0.14)), -45, 0, 360, 255, 1)
            elif pattern == "P5":  # Cherub Wing (羽飾り)
                for offset in [0, 8, 16]:
                    pts = np.array([[0, cs - offset], [int(cs*0.35), int(cs*0.65 - offset)], [int(cs*0.55), int(cs*0.35 - offset)], [cs - offset, 0]], dtype=np.int32)
                    cv2.polylines(c_mask, [pts], False, 255, thin)
            elif pattern == "P6":  # Chandelier radial (シャンデリアビーズの垂れ)
                for r in np.linspace(cs*0.3, cs*0.8, 4):
                    pts = []
                    for ang in np.linspace(15, 75, 10):
                        rad = math.radians(ang)
                        px, py = int(r * math.cos(rad)), int(r * math.sin(rad))
                        cv2.circle(c_mask, (px, py), 2, 255, -1)
                        pts.append([px, py])
                    cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, 1)
            elif pattern == "P7":  # Ivy Twisting Loop (蔦ループ)
                pts = []
                for t in np.linspace(0.1, 0.9, 40):
                    px = int(cs * t)
                    py = int(cs * (1.0 - t) + 12 * math.sin(t * 15))
                    pts.append([px, py])
                    if int(t * 100) % 20 == 0:
                        cv2.circle(c_mask, (px, py), 4, 255, -1)
                cv2.polylines(c_mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P8":  # Golden ribbon scroll (金糸リボン)
                pts1, pts2 = [], []
                for x in range(cs):
                    y = int(cs * 0.65 - x * 0.3 + 12 * math.sin(x * 0.07))
                    pts1.append([x, y])
                    pts2.append([x, y + 5])
                cv2.polylines(c_mask, [np.array(pts1, dtype=np.int32)], False, 255, 1)
                cv2.polylines(c_mask, [np.array(pts2, dtype=np.int32)], False, 255, 1)
            elif pattern == "P9":  # Baroque Garland (花冠)
                for t in np.linspace(0.15, 0.85, 6):
                    px = int(cs * t)
                    py = int(cs * (1.0 - t))
                    cv2.circle(c_mask, (px, py), 5, 255, -1)
                    for ang in range(0, 360, 60):
                        rx = int(px + 7 * math.cos(math.radians(ang)))
                        ry = int(py + 7 * math.sin(math.radians(ang)))
                        cv2.circle(c_mask, (rx, ry), 3, 255, 1)
            else: # P10 (Ornate Mirror frame)
                cv2.rectangle(c_mask, (0, 0), (int(cs*0.75), int(cs*0.75)), 255, thin)
                cv2.circle(c_mask, (int(cs*0.75), int(cs*0.75)), int(cs*0.12), 255, thin)
                
        # Top-Left corner mask placement (Copying onto main WxH frame is skipped here.
        # It will be dynamically duplicated via rotation according to sides_count)
        mask[0:cs, 0:cs] = np.maximum(mask[0:cs, 0:cs], c_mask)

    # ----------------------------------------------------
    # 2. 4Sides & 4SidesDec (Draws ONLY Top Side)
    # ----------------------------------------------------
    elif part_name in ["4Sides", "4SidesDec"]:
        border_w = int(cs * 0.6 * range_val)
        border_w = max(4, min(border_w, int(short_edge * 0.22)))
        
        if genre == "Geometry":
            if pattern == "P1":
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 255, thick)
            elif pattern == "P2":
                step = max(6, int(short_edge * 0.07))
                for x in range(cs, W-cs, step):
                    cv2.line(mask, (x, border_w//2), (x + step//2, border_w//2), 255, thick)
            elif pattern == "P3":
                step = max(8, int(short_edge * 0.05))
                for x in range(cs, W-cs, step):
                    cv2.line(mask, (x, 0), (x+step, border_w), 255, thin)
                    cv2.line(mask, (x+step, 0), (x, border_w), 255, thin)
            elif pattern == "P4":
                step = max(12, int(short_edge * 0.1))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), border_w//3, 255, thin)
            elif pattern == "P5":
                step = max(24, int(short_edge*0.16))
                for x in range(cs + step//2, W-cs, step):
                    draw_spiral_motif(mask, (x, border_w//2), border_w//2, thin, 255, coils=2)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cs, border_w//2), (W-cs, border_w//2), thick, 255)
            elif pattern == "P7":
                draw_ribbon_band(mask, (cs, border_w//2), (W-cs, border_w//2), thick*2, 255)
            elif pattern == "P8":
                step = max(16, int(short_edge * 0.12))
                for x in range(cs + step//2, W-cs, step):
                    cv2.line(mask, (x - 4, border_w//2 - 4), (x + 4, border_w//2 + 4), 255, thin)
                    cv2.line(mask, (x + 4, border_w//2 - 4), (x - 4, border_w//2 + 4), 255, thin)
            elif pattern == "P9":
                step = max(16, int(short_edge * 0.1))
                for x in range(cs, W-cs - step, step):
                    cv2.rectangle(mask, (x+2, 2), (x+step-2, border_w-2), 255, thin)
            else: # P10
                step = max(30, int(short_edge * 0.2))
                for x in range(cs + step//2, W-cs, step):
                    draw_spirograph(mask, (x, border_w//2), border_w//2, int(border_w*0.25), int(border_w*0.35), thin, 255)

        elif genre == "SF":
            if pattern == "P1":
                cv2.line(mask, (cs, border_w//2 - 2), (W-cs, border_w//2 - 2), 255, thin)
                cv2.line(mask, (cs, border_w//2 + 2), (W-cs, border_w//2 + 2), 255, thin)
            elif pattern == "P2":
                step = max(4, int(short_edge * 0.03))
                for x in range(cs, W-cs, step):
                    cv2.line(mask, (x, 0), (x, border_w), 255, thin)
            elif pattern == "P3":
                cv2.line(mask, (cs, border_w//3), (W-cs, border_w//3), 255, thin)
                cv2.line(mask, (cs, 2*border_w//3), (W-cs, 2*border_w//3), 255, thin)
            elif pattern == "P4":
                step = max(20, int(short_edge * 0.15))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), border_w//4, 255, thin)
                    cv2.line(mask, (x - border_w//2, border_w//2), (x + border_w//2, border_w//2), 255, thin)
            elif pattern == "P5":
                step = max(12, int(short_edge*0.1))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), 4, 255, -1)
            elif pattern == "P6":
                freq = 0.08
                for x in range(cs, W-cs):
                    y = int(border_w//2 + 4 * math.sin(x*freq))
                    cv2.circle(mask, (x, y), thin, 255, -1)
            elif pattern == "P7":
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 100, thick)
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 255, thin)
            elif pattern == "P8":
                for y in range(0, border_w, 4):
                    cv2.line(mask, (cs, y), (W-cs, y), 255, thin)
            elif pattern == "P9":
                step = max(8, int(short_edge*0.06))
                for x in range(cs, W-cs, step):
                    cv2.rectangle(mask, (x, 0), (x+max(1, step//3), border_w), 255, -1)
            else: # P10
                cv2.line(mask, (cs, border_w//3), (W-cs, border_w//3), 255, thin)
                for x in range(cs + 20, W-cs, 40):
                    cv2.line(mask, (x, border_w//3), (x + 10, 2*border_w//3), 255, thin)
                    cv2.line(mask, (x + 10, 2*border_w//3), (x + 25, 2*border_w//3), 255, thin)

        elif genre == "Fantasy":
            if pattern == "P1":
                freq = 0.03
                for x in range(cs, W-cs):
                    y = int(border_w//2 + 5 * math.sin(x * freq))
                    cv2.circle(mask, (x, y), thin, 255, -1)
            elif pattern == "P2":
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 255, thin)
                for x in range(cs + 10, W-cs, 12):
                    cv2.line(mask, (x, border_w//2 - 4), (x + 3, border_w//2 + 4), 255, thin)
            elif pattern == "P3":
                step = max(14, int(short_edge*0.12))
                for x in range(cs + step//2, W-cs, step):
                    pts = np.array([[x - 5, border_w//3], [x + 5, border_w//3], [x, 2*border_w//3]], dtype=np.int32)
                    cv2.polylines(mask, [pts], True, 255, thin)
            elif pattern == "P4":
                step = max(12, int(short_edge * 0.1))
                for x in range(cs + step//2, W-cs, step):
                    cv2.ellipse(mask, (x, border_w//2), (border_w//4, border_w//4), 0, 0, 180, 255, thin)
            elif pattern == "P5":
                step = max(16, int(short_edge*0.14))
                for x in range(cs + step//2, W-cs, step):
                    cv2.line(mask, (x - 3, border_w//3), (x + 3, 2*border_w//3), 255, thin)
                    cv2.line(mask, (x + 3, border_w//3), (x - 3, 2*border_w//3), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cs, border_w//2), (W-cs, border_w//2), thick, 255, pitch=15.0)
            elif pattern == "P7":
                draw_ribbon_band(mask, (cs, border_w//2), (W-cs, border_w//2), thick*2, 255)
            elif pattern == "P8":
                step = max(24, int(short_edge*0.18))
                for x in range(cs + step//2, W-cs, step):
                    draw_sword_blade(mask, (x, border_w//2), border_w//2, thin, 255, angle=90)
            elif pattern == "P9":
                step = max(16, int(short_edge*0.13))
                for x in range(cs + step//2, W-cs, step):
                    draw_crystal_flake(mask, (x, border_w//2), border_w//3, thin, 255, points=4)
            else: # P10
                step = max(12, int(short_edge * 0.08))
                for x in range(cs, W - cs - step, step):
                    cv2.ellipse(mask, (x + step//2, border_w), (step//2, border_w//2), 0, 180, 360, 255, thin)

        elif genre == "Steampunk":
            if pattern == "P1":
                step = max(12, int(short_edge * 0.1))
                for x in range(cs + step//2, W-cs, step):
                    draw_gear(mask, (x, border_w//2), border_w//2, 8, intensity, 255)
            elif pattern == "P2":
                cv2.line(mask, (cs, border_w), (W-cs, border_w), 255, thin)
                step = max(8, int(short_edge*0.08))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), thin+1, 255, -1)
            elif pattern == "P3":
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 255, thick)
            elif pattern == "P4":
                step = max(16, int(short_edge*0.14))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), border_w//3, 255, thin)
                    cv2.line(mask, (x, border_w//2), (x + 3, border_w//2 - 3), 255, thick)
            elif pattern == "P5":
                draw_spiral_motif(mask, (W//2, border_w//2), border_w, thin, 255, coils=4)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cs, border_w//2), (W-cs, border_w//2), thick, 255, pitch=8.0)
            elif pattern == "P7":
                step = max(20, int(short_edge*0.18))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), border_w//3, 255, thin)
                    cv2.circle(mask, (x, border_w//2), 2, 255, -1)
            elif pattern == "P8":
                cv2.line(mask, (cs, border_w//3), (W-cs, border_w//3), 255, thin)
                cv2.line(mask, (cs, 2*border_w//3), (W-cs, 2*border_w//3), 255, thin)
            elif pattern == "P9":
                step = max(16, int(short_edge*0.13))
                for x in range(cs+step//2, W-cs, step):
                    draw_gear(mask, (x, border_w//2), border_w//3, 10, 0.4, 255)
            else: # P10
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 255, thick)
                for x in range(cs, W-cs, 6):
                    cv2.line(mask, (x, border_w//2), (x, border_w), 255, thin)

        elif genre == "Japanese":
            if pattern == "P1":
                offset = max(2, int(border_w * 0.22))
                for i in range(-2, 3):
                    cv2.line(mask, (cs, border_w//2 + i*offset), (W-cs, border_w//2 + i*offset), 255, thin)
            elif pattern == "P2":
                step = max(6, int(short_edge * 0.05))
                for x in range(cs, W-cs, step*2):
                    cv2.rectangle(mask, (x, 0), (x+step, border_w//2), 255, -1)
                    cv2.rectangle(mask, (x+step, border_w//2), (x+step*2, border_w), 255, -1)
            elif pattern == "P3":
                step = max(10, int(short_edge * 0.08))
                for x in range(cs, W-cs, step):
                    cv2.circle(mask, (x + step//2, border_w), border_w//2, 255, thin)
                    cv2.circle(mask, (x + step//2, border_w), border_w//4, 255, thin)
            elif pattern == "P4":
                step = max(16, int(short_edge*0.14))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), border_w//3, 255, thin)
            elif pattern == "P5":
                step = max(14, int(short_edge*0.12))
                for x in range(cs + step//2, W-cs, step):
                    pts = []
                    for k in range(10):
                        angle = k * (math.pi/5.0)
                        r_sak = border_w//2.2 if k%2==0 else border_w//4.5
                        pts.append([int(x + r_sak*math.cos(angle)), int(border_w//2 + r_sak*math.sin(angle))])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], True, 255, thin)
            elif pattern == "P6":
                step = max(24, int(short_edge*0.18))
                for x in range(cs, W-cs - step, step):
                    cv2.line(mask, (x + 4, border_w//2), (x + step - 4, border_w//2), 255, thick)
            elif pattern == "P7":
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 255, thin)
                for x in range(cs, W-cs, 15):
                    cv2.line(mask, (x, 0), (x, border_w), 255, thin)
            elif pattern == "P8":
                step = max(12, int(short_edge*0.08))
                for x in range(cs, W-cs, step):
                    cv2.line(mask, (x, border_w), (x + step, 0), 255, thin)
            elif pattern == "P9":
                freq = 0.05
                pts = []
                for x in range(cs, W-cs):
                    y = int(border_w//2 + 6 * math.sin(x*freq))
                    pts.append([x, y])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            else: # P10
                step = max(20, int(short_edge*0.15))
                for x in range(cs + step//2, W-cs, step):
                    pts = np.array([[x - 5, border_w], [x + 2, border_w//2], [x - 3, border_w//3], [x + 5, border_w//4]], dtype=np.int32)
                    cv2.polylines(mask, [pts], False, 255, thin)

        elif genre == "Gothic":
            if pattern == "P1":
                step = max(6, int(short_edge * 0.05))
                for x in range(cs, W - cs - step, step):
                    draw_pointy_arch(mask, (x, border_w), (x+step, border_w), thin, thin, 255)
            elif pattern == "P2":
                step = max(16, int(short_edge*0.13))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), border_w//2.2, 255, thin)
            elif pattern == "P3":
                step = max(16, int(short_edge*0.14))
                for x in range(cs + step//2, W-cs, step):
                    cv2.line(mask, (x - 4, border_w//2), (x + 4, border_w//2), 255, thin)
                    cv2.line(mask, (x, border_w//2 - 4), (x, border_w//2 + 4), 255, thin)
            elif pattern == "P4":
                step = max(15, int(short_edge*0.12))
                for x in range(cs + step//2, W-cs, step):
                    cv2.ellipse(mask, (x, border_w//2), (border_w//4, border_w//5), 0, 0, 360, 255, -1)
            elif pattern == "P5":
                cv2.line(mask, (cs, border_w//2), (W-cs, border_w//2), 255, thin)
                for x in range(cs + 10, W-cs, 20):
                    cv2.line(mask, (x - 3, border_w//2 - 3), (x + 3, border_w//2 + 3), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cs, border_w//2), (W-cs, border_w//2), thick, 255, pitch=9.0)
            elif pattern == "P7":
                step = max(12, int(short_edge * 0.08))
                for x in range(cs, W - cs - step, step):
                    cv2.ellipse(mask, (x + step//2, border_w//2), (step//2, border_w//3), 0, 0, 180, 255, thin)
            elif pattern == "P8":
                step = max(10, int(short_edge*0.08))
                for x in range(cs, W-cs-step, step):
                    draw_pointy_arch(mask, (x, border_w), (x+step, border_w), border_w//3, thin, 255)
            elif pattern == "P9":
                step = max(15, int(short_edge*0.12))
                for x in range(cs + step//2, W-cs, step):
                    pts = np.array([[x - 3, border_w], [x, border_w//3], [x + 3, border_w]], dtype=np.int32)
                    cv2.polylines(mask, [pts], True, 255, thin)
            else: # P10
                step = max(20, int(short_edge*0.16))
                for x in range(cs + step//2, W-cs, step):
                    cv2.circle(mask, (x, border_w//2), border_w//4, 255, thin)
                    
        elif genre == "Organic":
            if pattern == "P1":  # Tentacle (触手)
                pts = []
                for x in range(cs, W - cs):
                    t = (x - cs) / (W - 2 * cs)
                    y = int(border_w // 2 + 10 * math.sin(t * math.pi * 6))
                    pts.append([x, y])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P2":  # Cell grid (細胞)
                step = max(12, int(short_edge * 0.1))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.circle(mask, (x, border_w // 2), border_w // 3, 255, -1)
                    cv2.circle(mask, (x, border_w // 2), border_w // 6, 0, -1)
            elif pattern == "P3":  # Spine/Bone (背骨)
                cv2.line(mask, (cs, border_w // 2), (W - cs, border_w // 2), 255, thin)
                step = max(10, int(short_edge * 0.08))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.ellipse(mask, (x, border_w // 2), (step // 3, border_w // 4), 0, 0, 360, 255, thin)
            elif pattern == "P4":  # Vein (葉脈)
                cv2.line(mask, (cs, border_w // 2), (W - cs, border_w // 2), 255, thick)
                step = max(16, int(short_edge * 0.12))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.line(mask, (x, border_w // 2), (x + 6, border_w // 4), 255, thin)
                    cv2.line(mask, (x, border_w // 2), (x - 6, border_w // 4), 255, thin)
            elif pattern == "P5":  # Capillaries (血管)
                step = max(24, int(short_edge * 0.18))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.line(mask, (x, border_w), (x, border_w // 3), 255, thin)
                    cv2.line(mask, (x, border_w // 3), (x - 5, border_w // 6), 255, thin)
                    cv2.line(mask, (x, border_w // 3), (x + 5, border_w // 6), 255, thin)
            elif pattern == "P6":  # Pulse (生体ウェーブ)
                pts = []
                for x in range(cs, W - cs):
                    t = (x - cs) / (W - 2 * cs)
                    pulse_wave = 0
                    if int(t * 100) % 20 in [0, 1, 2, 3]:
                        pulse_wave = border_w // 2.5 * math.sin((t * 100 % 20) * 0.8)
                    y = int(border_w // 2 - pulse_wave)
                    pts.append([x, y])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P7":  # Nautilus Spiral (対数螺旋)
                step = max(30, int(short_edge * 0.22))
                for x in range(cs + step // 2, W - cs, step):
                    pts = []
                    for theta in np.linspace(0, 3 * math.pi, 50):
                        r_spiral = border_w // 3.0 * math.exp(0.08 * theta)
                        px = int(x + r_spiral * math.cos(theta))
                        py = int(border_w // 2 - r_spiral * math.sin(theta))
                        if cs <= px <= W - cs and 0 <= py <= border_w:
                            pts.append([px, py])
                    if len(pts) > 1:
                        cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P8":  # Muscle Fibers (筋肉繊維)
                for offset in [-2, 0, 2]:
                    pts = []
                    for x in range(cs, W - cs):
                        y = int(border_w // 2 + offset + 4 * math.sin(x * 0.08))
                        pts.append([x, y])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, 1)
            elif pattern == "P9":  # Fang claws (牙爪)
                step = max(14, int(short_edge * 0.1))
                for x in range(cs, W - cs - step, step):
                    cv2.ellipse(mask, (x + step // 2, border_w // 2), (step // 3, border_w // 5), 15, 0, 180, 255, -1)
            else: # P10 (Heartbeat / 双対パルス)
                pts1, pts2 = [], []
                for x in range(cs, W - cs):
                    y1 = int(border_w // 3 + 3 * math.sin(x * 0.08))
                    y2 = int(border_w // 1.5 + 3 * math.sin(x * 0.08))
                    pts1.append([x, y1])
                    pts2.append([x, y2])
                cv2.polylines(mask, [np.array(pts1, dtype=np.int32)], False, 255, thin)
                cv2.polylines(mask, [np.array(pts2, dtype=np.int32)], False, 255, thin)
                
        elif genre == "Baroque":
            if pattern == "P1":  # Acanthus (アカンサス唐草)
                step = max(24, int(short_edge * 0.18))
                for x in range(cs + step // 2, W - cs - step // 2, step):
                    pts = []
                    for t in np.linspace(0, math.pi * 2.0, 40):
                        r_ac = border_w // 2.5 * (1.0 - t / 8.0)
                        px = int(x + r_ac * math.cos(t))
                        py = int(border_w // 2 - r_ac * math.sin(t))
                        pts.append([px, py])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P2":  # Rocaille shell (貝殻カーブヒダ)
                step = max(20, int(short_edge * 0.15))
                for x in range(cs + step // 2, W - cs, step):
                    for r_sak in np.linspace(border_w // 6.0, border_w // 2.0, 3):
                        cv2.ellipse(mask, (x, border_w // 2), (int(r_sak), int(r_sak * 0.75)), 0, 0, 180, 255, thin)
            elif pattern == "P3":  # Royal Emblem (百合のシンメトリー紋章)
                step = max(28, int(short_edge * 0.2))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.ellipse(mask, (x, border_w // 2), (int(border_w * 0.08), int(border_w * 0.25)), 0, 0, 360, 255, -1)
                    cv2.ellipse(mask, (x - int(border_w * 0.1), border_w // 2 + int(border_w * 0.05)), (int(border_w * 0.15), int(border_w * 0.1)), 45, 0, 360, 255, thin)
                    cv2.ellipse(mask, (x + int(border_w * 0.1), border_w // 2 + int(border_w * 0.05)), (int(border_w * 0.15), int(border_w * 0.1)), -45, 0, 360, 255, thin)
            elif pattern == "P4":  # Cartouche (飾り板・オーバル枠)
                step = max(26, int(short_edge * 0.2))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.ellipse(mask, (x, border_w // 2), (int(step * 0.35), int(border_w * 0.35)), 0, 0, 360, 255, thin)
                    cv2.ellipse(mask, (x, border_w // 2), (int(step * 0.28), int(border_w * 0.28)), 0, 0, 360, 255, 1)
            elif pattern == "P5":  # Cherub Wing (羽飾り)
                step = max(20, int(short_edge * 0.15))
                for x in range(cs + step // 2, W - cs, step):
                    for offset in [-3, 3]:
                        pts = np.array([[x - 8, border_w // 2 + offset], [x - 2, border_w // 3 + offset], [x + 4, border_w // 4 + offset], [x + 10, border_w // 6 + offset]], dtype=np.int32)
                        cv2.polylines(mask, [pts], False, 255, thin)
            elif pattern == "P6":  # Chandelier radial (シャンデリアビーズの垂れ)
                step = max(22, int(short_edge * 0.16))
                for x in range(cs + step // 2, W - cs, step):
                    for r_ch in [border_w // 3, border_w // 2]:
                        pts = []
                        for ang in np.linspace(30, 150, 6):
                            rad = math.radians(ang)
                            px, py = int(x + r_ch * math.cos(rad)), int(border_w // 2 + r_ch * math.sin(rad))
                            cv2.circle(mask, (px, py), 2, 255, -1)
                            pts.append([px, py])
                        cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, 1)
            elif pattern == "P7":  # Ivy Twisting Loop (蔦ループ)
                step = max(18, int(short_edge * 0.13))
                for x in range(cs, W - cs - step, step):
                    pts = []
                    for t in np.linspace(0, 1.0, 20):
                        px = int(x + t * step)
                        py = int(border_w // 2 + 5 * math.sin(t * math.pi * 2))
                        pts.append([px, py])
                        if int(t * 100) % 50 == 0:
                            cv2.circle(mask, (px, py), 3, 255, -1)
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P8":  # Golden ribbon scroll (金糸リボン)
                step = max(24, int(short_edge * 0.18))
                for x in range(cs, W - cs - step, step):
                    pts1, pts2 = [], []
                    for t in np.linspace(0, 1.0, 30):
                        px = int(x + t * step)
                        y_rib = int(border_w // 2 + 6 * math.sin(t * math.pi * 2))
                        pts1.append([px, y_rib])
                        pts2.append([px, y_rib + 4])
                    cv2.polylines(mask, [np.array(pts1, dtype=np.int32)], False, 255, 1)
                    cv2.polylines(mask, [np.array(pts2, dtype=np.int32)], False, 255, 1)
            elif pattern == "P9":  # Baroque Garland (花冠)
                step = max(20, int(short_edge * 0.15))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.circle(mask, (x, border_w // 2), 4, 255, -1)
                    for ang in range(0, 360, 60):
                        rx = int(x + 5 * math.cos(math.radians(ang)))
                        ry = int(border_w // 2 + 5 * math.sin(math.radians(ang)))
                        cv2.circle(mask, (rx, ry), 2, 255, 1)
            else: # P10 (Ornate Mirror frame)
                cv2.line(mask, (cs, border_w // 2), (W - cs, border_w // 2), 255, thin)
                step = max(24, int(short_edge * 0.18))
                for x in range(cs + step // 2, W - cs, step):
                    cv2.rectangle(mask, (x - 6, border_w // 2 - 4), (x + 6, border_w // 2 + 4), 255, thin)
                    cv2.circle(mask, (x, border_w // 2), 3, 255, thin)

        # Top border placement only. Lower sides replication is skipped,
        # it is performed dynamically via rotational matrix.

    # ----------------------------------------------------
    # 3. Center & CenterDec
    # ----------------------------------------------------
    elif part_name in ["Center", "CenterDec"]:
        r = int(short_edge * 0.12 * range_val)
        r = max(6, r)
        
        if genre == "Geometry":
            if pattern == "P1":
                cv2.circle(mask, (cx, cy), r, 255, thick)
                cv2.circle(mask, (cx, cy), int(r*0.6), 255, thin)
            elif pattern == "P2":
                for i in range(-2, 3):
                    cv2.line(mask, (cx - r, cy + i*r//3), (cx + r, cy + i*r//3), 255, thin)
            elif pattern == "P3":
                pts = []
                for i in range(6):
                    angle = i * math.pi/3
                    pts.append([int(cx + r*math.cos(angle)), int(cy + r*math.sin(angle))])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], True, 255, thin)
            elif pattern == "P4":
                for i in range(12):
                    angle = i * math.pi/6
                    cv2.line(mask, (cx, cy), (int(cx + r*math.cos(angle)), int(cy + r*math.sin(angle))), 255, thin)
            elif pattern == "P5":
                draw_spiral_motif(mask, (cx, cy), r, thin, 255, coils=3)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - r, cy), (cx + r, cy), thick, 255)
            elif pattern == "P7":
                draw_ribbon_band(mask, (cx - r, cy), (cx + r, cy), thick*2, 255)
            elif pattern == "P8":
                pts = np.array([[cx, cy-r], [cx+int(r*0.8), cy+int(r*0.5)], [cx-int(r*0.8), cy+int(r*0.5)]], dtype=np.int32)
                cv2.polylines(mask, [pts], True, 255, thin)
            elif pattern == "P9":
                for i in [r, int(r*0.6)]:
                    cv2.rectangle(mask, (cx-i, cy-i), (cx+i, cy+i), 255, thin)
            else: # P10
                draw_spirograph(mask, (cx, cy), r, int(r*0.4), int(r*0.3), thin, 255)
                
        elif genre == "SF":
            if pattern == "P1":
                cv2.rectangle(mask, (cx-r, cy-r), (cx+r, cy+r), 255, thin)
            elif pattern == "P2":
                for x in range(-2, 3):
                    for y in range(-2, 3):
                        cv2.circle(mask, (cx + x*r//3, cy + y*r//3), thin, 255, -1)
            elif pattern == "P3":
                cv2.line(mask, (cx-r, cy), (cx+r, cy), 255, thick)
                cv2.circle(mask, (cx, cy), 6, 255, -1)
            elif pattern == "P4":
                cv2.circle(mask, (cx, cy), r, 255, thin)
                cv2.line(mask, (cx - r - 8, cy), (cx + r + 8, cy), 255, thin)
                cv2.line(mask, (cx, cy - r - 8), (cx, cy + r + 8), 255, thin)
            elif pattern == "P5":
                pts = []
                for i in range(6):
                    angle = i * math.pi/3
                    pts.append([int(cx + r*0.85*math.cos(angle)), int(cy + r*0.85*math.sin(angle))])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], True, 255, thick)
            elif pattern == "P6":
                pts = []
                for i in range(90):
                    angle = i * (math.pi/45.0)
                    wave = r + 6 * math.sin(angle * 10)
                    pts.append([int(cx + wave*math.cos(angle)), int(cy + wave*math.sin(angle))])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], True, 255, thin)
            elif pattern == "P7":
                cv2.circle(mask, (cx, cy), r, 100, thick)
                cv2.circle(mask, (cx, cy), r, 255, thin)
            elif pattern == "P8":
                for y in range(-r, r+1, 6):
                    w_line = int(math.sqrt(max(0, r**2 - y**2)))
                    cv2.line(mask, (cx - w_line, cy + y), (cx + w_line, cy + y), 255, thin)
            elif pattern == "P9":
                cv2.circle(mask, (cx, cy), r, 255, thick)
                cv2.circle(mask, (cx, cy), int(r*0.65), 255, thin)
            else: # P10
                cv2.circle(mask, (cx, cy), 8, 255, -1)
                for ang in [0, 45, 90, 135, 180, 225, 270, 315]:
                    rad = math.radians(ang)
                    cv2.line(mask, (cx, cy), (int(cx + r*math.cos(rad)), int(cy + r*math.sin(rad))), 255, thin)

        elif genre == "Fantasy":
            if pattern == "P1":
                draw_spiral_motif(mask, (cx, cy), r, thin, 255, coils=2)
            elif pattern == "P2":
                cv2.circle(mask, (cx, cy), r, 255, thick)
                for offset in [0, math.pi/3]:
                    pts = []
                    for i in range(3):
                        angle = i * (2.0*math.pi/3) - math.pi/2 + offset
                        pts.append([int(cx + r*0.7*math.cos(angle)), int(cy + r*0.7*math.sin(angle))])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], True, 255, thin)
            elif pattern == "P3":
                pts = np.array([[cx, cy-r], [cx+int(r*0.7), cy-int(r*0.5)], [cx+int(r*0.7), cy+int(r*0.3)], [cx, cy+r], [cx-int(r*0.7), cy+int(r*0.3)], [cx-int(r*0.7), cy-int(r*0.5)]], dtype=np.int32)
                cv2.polylines(mask, [pts], True, 255, thick)
            elif pattern == "P4":
                cv2.circle(mask, (cx, cy), int(r*0.5), 255, -1)
                for i in range(12):
                    angle = i * math.pi/6
                    cv2.line(mask, (cx, cy), (int(cx + r*math.cos(angle)), int(cy + r*math.sin(angle))), 255, thin)
            elif pattern == "P5":
                cv2.circle(mask, (cx, cy), r, 255, thin)
                cv2.circle(mask, (cx, cy), int(r*0.7), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - r, cy), (cx + r, cy), thick, 255, pitch=12.0)
            elif pattern == "P7":
                draw_ribbon_band(mask, (cx - r, cy), (cx + r, cy), thick*2, 255)
            elif pattern == "P8":
                draw_sword_blade(mask, (cx, cy), r, thin, 255, angle=90)
            elif pattern == "P9":
                draw_crystal_flake(mask, (cx, cy), r, thin, 255)
            else: # P10
                cv2.circle(mask, (cx, cy), r, 255, thin)
                cv2.rectangle(mask, (cx-int(r*0.5), cy+int(r*0.3)), (cx+int(r*0.5), cy+int(r*0.45)), 255, -1)

        elif genre == "Steampunk":
            if pattern == "P1":
                draw_gear(mask, (cx, cy), r, 12, intensity, 255)
            elif pattern == "P2":
                cv2.circle(mask, (cx, cy), r, 180, -1)
                cv2.circle(mask, (cx, cy), r, 255, thin)
                for ang in range(0, 360, 45):
                    rad = math.radians(ang)
                    cv2.circle(mask, (int(cx + r*0.75*math.cos(rad)), int(cy + r*0.75*math.sin(rad))), 3, 255, -1)
            elif pattern == "P3":
                cv2.line(mask, (cx - r, cy), (cx + r, cy), 255, thick)
                cv2.line(mask, (cx, cy - r), (cx, cy + r), 255, thick)
            elif pattern == "P4":
                cv2.circle(mask, (cx, cy), r, 255, thick)
                cv2.line(mask, (cx, cy), (cx + int(r*0.7), cy - int(r*0.3)), 255, thick)
            elif pattern == "P5":
                draw_spiral_motif(mask, (cx, cy), r, thin, 255, coils=4)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - r, cy), (cx + r, cy), thick, 255, pitch=8.0)
            elif pattern == "P7":
                cv2.circle(mask, (cx, cy), r, 255, thin)
                cv2.circle(mask, (cx, cy), int(r*0.25), 255, thin)
            elif pattern == "P8":
                cv2.rectangle(mask, (cx - r, cy - thin), (cx + r, cy + thin), 255, -1)
            elif pattern == "P9":
                draw_gear(mask, (cx, cy), r, 16, 0.4, 255)
            else: # P10
                cv2.line(mask, (cx - r, cy), (cx + r, cy), 255, thick)
                for i in range(cx - r, cx + r, 8):
                    cv2.line(mask, (i, cy - 3), (i + 4, cy + 3), 255, thin)

        elif genre == "Japanese":
            if pattern == "P1":
                for i in range(-3, 4):
                    cv2.line(mask, (cx + i*r//4, cy - r), (cx + i*r//4, cy + r), 255, thin)
            elif pattern == "P2":
                step = r // 2
                for x in range(-2, 2):
                    for y in range(-2, 2):
                        if (x + y) % 2 == 0:
                            cv2.rectangle(mask, (cx + x*step, cy + y*step), (cx + (x+1)*step, cy + (y+1)*step), 255, -1)
            elif pattern == "P3":
                cv2.circle(mask, (cx, cy), r, 255, thick)
            elif pattern == "P4":
                cv2.circle(mask, (cx, cy), r, 255, thin)
            elif pattern == "P5":
                pts = []
                for i in range(10):
                    angle = i * (math.pi/5.0)
                    pr = r if i%2==0 else r//2
                    pts.append([int(cx + pr*math.cos(angle)), int(cy + pr*math.sin(angle))])
                cv2.fillPoly(mask, [np.array(pts, dtype=np.int32)], 255)
            elif pattern == "P6":
                cv2.circle(mask, (cx - r//3, cy), r//2, 255, -1)
                cv2.circle(mask, (cx + r//3, cy), r//2, 255, -1)
            elif pattern == "P7":
                step = r // 2
                for i in range(-2, 3):
                    cv2.line(mask, (cx - r, cy + i*step), (cx + r, cy + i*step), 255, thin)
                    cv2.line(mask, (cx + i*step, cy - r), (cx + i*step, cy + r), 255, thin)
            elif pattern == "P8":
                for i in range(-2, 3):
                    cv2.line(mask, (cx - r, cy + i*r//2), (cx + r, cy - i*r//2), 255, thin)
            elif pattern == "P9":
                freq = 0.05
                pts = []
                for x in range(cx - r, cx + r):
                    y = int(cy + 6 * math.sin(x*freq))
                    pts.append([x, y])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            else: # P10
                pts = np.array([[cx - r, cy + r], [cx + r//3, cy], [cx - r//3, cy - r], [cx + r, cy - r//2]], dtype=np.int32)
                cv2.polylines(mask, [pts], False, 255, thin)

        elif genre == "Gothic":
            if pattern == "P1":
                draw_pointy_arch(mask, (cx - r, cy + r//2), (cx + r, cy + r//2), cy - r, thin, 255)
            elif pattern == "P2":
                cv2.circle(mask, (cx, cy), r, 255, thick)
                for i in range(8):
                    angle = i * math.pi/4
                    cv2.circle(mask, (int(cx + r*0.5*math.cos(angle)), int(cy + r*0.5*math.sin(angle))), r//4, 255, thin)
            elif pattern == "P3":
                cw = int(r * 0.8)
                ch = int(r * 0.18)
                cv2.rectangle(mask, (cx - cw, cy - ch), (cx + cw, cy + ch), 255, -1)
                cv2.rectangle(mask, (cx - ch, cy - cw), (cx + ch, cy + cw), 255, -1)
            elif pattern == "P4":
                cv2.ellipse(mask, (cx, cy), (r//3, r//2), 0, 0, 360, 255, -1)
            elif pattern == "P5":
                cv2.circle(mask, (cx, cy), r, 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - r, cy), (cx + r, cy), thick, 255, pitch=10.0)
            elif pattern == "P7":
                cv2.circle(mask, (cx, cy), r, 255, thin)
            elif pattern == "P8":
                draw_pointy_arch(mask, (cx - r, cy + r), (cx + r, cy + r), cy - r//2, thin, 255)
            elif pattern == "P9":
                pts = np.array([[cx - r//3, cy + r], [cx, cy - r], [cx + r//3, cy + r]], dtype=np.int32)
                cv2.fillPoly(mask, [pts], 255)
            else: # P10
                cv2.circle(mask, (cx, cy), r, 255, thin)
                
        elif genre == "Organic":
            if pattern == "P1":  # Tentacle (触手)
                for ang in [0, 90, 180, 270]:
                    rad = math.radians(ang)
                    pts = [[cx, cy]]
                    for t in np.linspace(0, 1.0, 20):
                        dist = r * t
                        px = int(cx + dist * math.cos(rad) + 8 * math.sin(t * 8) * math.cos(rad + math.pi/2))
                        py = int(cy + dist * math.sin(rad) + 8 * math.sin(t * 8) * math.sin(rad + math.pi/2))
                        pts.append([px, py])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P2":  # Cell grid (細胞)
                cv2.circle(mask, (cx, cy), r // 2, 255, thin)
                for ang in range(0, 360, 45):
                    rad = math.radians(ang)
                    px = int(cx + r * 0.6 * math.cos(rad))
                    py = int(cy + r * 0.6 * math.sin(rad))
                    cv2.circle(mask, (px, py), r // 4, 255, thin)
            elif pattern == "P3":  # Spine/Bone (背骨)
                for ang in [0, 90, 180, 270]:
                    rad = math.radians(ang)
                    for t in np.linspace(0.2, 0.9, 4):
                        px = int(cx + r * t * math.cos(rad))
                        py = int(cy + r * t * math.sin(rad))
                        cv2.circle(mask, (px, py), int(r * 0.12), 255, -1)
            elif pattern == "P4":  # Vein (葉脈)
                cv2.circle(mask, (cx, cy), r // 3, 255, thick)
                for ang in range(0, 360, 60):
                    rad = math.radians(ang)
                    cv2.line(mask, (cx, cy), (int(cx + r * math.cos(rad)), int(cy + r * math.sin(rad))), 255, thin)
            elif pattern == "P5":  # Capillaries (血管)
                for ang in range(15, 360, 45):
                    rad = math.radians(ang)
                    p1 = (cx, cy)
                    p2 = (int(cx + r * 0.7 * math.cos(rad)), int(cy + r * 0.7 * math.sin(rad)))
                    cv2.line(mask, p1, p2, 255, thin)
                    for side in [-20, 20]:
                        bran_rad = rad + math.radians(side)
                        bx = int(p2[0] + r * 0.3 * math.cos(bran_rad))
                        by = int(p2[1] + r * 0.3 * math.sin(bran_rad))
                        cv2.line(mask, p2, (bx, by), 255, 1)
            elif pattern == "P6":  # Pulse (生体インパルスウェーブ)
                for ang in range(0, 360, 90):
                    rad = math.radians(ang)
                    pts = []
                    for t in np.linspace(0, 1.0, 30):
                        dist = r * t
                        spike = 0
                        if 0.3 < t < 0.7:
                            spike = r * 0.2 * math.sin((t - 0.3) * 15)
                        px = int(cx + dist * math.cos(rad) + spike * math.cos(rad + math.pi/2))
                        py = int(cy + dist * math.sin(rad) + spike * math.sin(rad + math.pi/2))
                        pts.append([px, py])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P7":  # Nautilus Spiral (対数螺旋)
                pts = []
                for theta in np.linspace(0, 5 * math.pi, 120):
                    r_sp = r * 0.06 * math.exp(0.15 * theta)
                    if r_sp > r: break
                    px = int(cx + r_sp * math.cos(theta))
                    py = int(cy + r_sp * math.sin(theta))
                    pts.append([px, py])
                if len(pts) > 1:
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P8":  # Muscle Fibers (筋肉繊維)
                for ang in range(0, 360, 45):
                    rad = math.radians(ang)
                    for offset in [-4, 0, 4]:
                        pts = []
                        for t in np.linspace(0.1, 0.9, 20):
                            dist = r * t
                            px = int(cx + dist * math.cos(rad) + offset * math.cos(rad + math.pi/2))
                            py = int(cy + dist * math.sin(rad) + offset * math.sin(rad + math.pi/2))
                            pts.append([px, py])
                        cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, 1)
            elif pattern == "P9":  # Fang claws (牙爪)
                for ang in range(0, 360, 60):
                    rad = math.radians(ang)
                    px = int(cx + r * 0.5 * math.cos(rad))
                    py = int(cy + r * 0.5 * math.sin(rad))
                    cv2.ellipse(mask, (px, py), (r // 5, r // 8), ang, 0, 180, 255, -1)
            else: # P10 (Heartbeat / 双対パルス)
                cv2.circle(mask, (cx, cy), r // 2, 255, thin)
                cv2.circle(mask, (cx, cy), r // 3, 255, thin)
                for ang in range(0, 360, 90):
                    rad = math.radians(ang)
                    cv2.line(mask, (int(cx + r*0.33*math.cos(rad)), int(cy + r*0.33*math.sin(rad))), (int(cx + r*0.5*math.cos(rad)), int(cy + r*0.5*math.sin(rad))), 255, thick)
                    
        elif genre == "Baroque":
            if pattern == "P1":  # Acanthus (アカンサス唐草)
                for ang in range(0, 360, 120):
                    rad = math.radians(ang)
                    pts = []
                    for t in np.linspace(0, math.pi*1.8, 40):
                        r_ac = r * 0.6 * (1.0 - t/6.0)
                        px = int(cx + r * 0.3 * math.cos(rad) + r_ac * math.cos(t + ang))
                        py = int(cy + r * 0.3 * math.sin(rad) + r_ac * math.sin(t + ang))
                        pts.append([px, py])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P2":  # Rocaille shell (貝殻カーブヒダ)
                for i in range(4):
                    ang = i * 90
                    px = int(cx + r * 0.4 * math.cos(math.radians(ang)))
                    py = int(cy + r * 0.4 * math.sin(math.radians(ang)))
                    for r_shell in np.linspace(r * 0.1, r * 0.4, 3):
                        cv2.ellipse(mask, (px, py), (int(r_shell), int(r_shell*0.75)), ang, 0, 180, 255, thin)
            elif pattern == "P3":  # Royal Emblem (百合のシンメトリー紋章)
                cv2.ellipse(mask, (cx, cy), (int(r * 0.18), int(r * 0.55)), 0, 0, 360, 255, -1)
                cv2.ellipse(mask, (cx - int(r * 0.22), cy + int(r * 0.1)), (int(r * 0.3), int(r * 0.15)), 45, 0, 360, 255, thin)
                cv2.ellipse(mask, (cx + int(r * 0.22), cy + int(r * 0.1)), (int(r * 0.3), int(r * 0.15)), -45, 0, 360, 255, thin)
            elif pattern == "P4":  # Cartouche (飾り板・オーバル枠)
                cv2.ellipse(mask, (cx, cy), (int(r * 0.8), int(r * 0.55)), 0, 0, 360, 255, thin)
                cv2.ellipse(mask, (cx, cy), (int(r * 0.7), int(r * 0.45)), 0, 0, 360, 255, 1)
            elif pattern == "P5":  # Cherub Wing (羽飾り)
                for ang in [45, 135, 225, 315]:
                    rad = math.radians(ang)
                    for offset in [-4, 4]:
                        pts = np.array([[cx, cy], [int(cx + r*0.4*math.cos(rad) + offset), int(cy + r*0.4*math.sin(rad) + offset)], [int(cx + r*0.8*math.cos(rad) + offset), int(cy + r*0.8*math.sin(rad) + offset)]], dtype=np.int32)
                        cv2.polylines(mask, [pts], False, 255, thin)
            elif pattern == "P6":  # Chandelier radial (シャンデリアビーズの垂れ)
                for r_ch in [r // 2, r // 1.4]:
                    pts = []
                    for ang in np.linspace(0, 360, 16):
                        rad = math.radians(ang)
                        px, py = int(cx + r_ch * math.cos(rad)), int(cy + r_ch * math.sin(rad))
                        cv2.circle(mask, (px, py), 2, 255, -1)
                        pts.append([px, py])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, 1)
            elif pattern == "P7":  # Ivy Twisting Loop (蔦ループ)
                for ang in [0, 90, 180, 270]:
                    rad = math.radians(ang)
                    pts = []
                    for t in np.linspace(0.1, 0.9, 20):
                        dist = r * t
                        px = int(cx + dist * math.cos(rad) + 6 * math.sin(t * 12) * math.cos(rad + math.pi/2))
                        py = int(cy + dist * math.sin(rad) + 6 * math.sin(t * 12) * math.sin(rad + math.pi/2))
                        pts.append([px, py])
                        if int(t * 100) % 30 == 0:
                            cv2.circle(mask, (px, py), 3, 255, -1)
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P8":  # Golden ribbon scroll (金糸リボン)
                for ang in [45, 135, 225, 315]:
                    rad = math.radians(ang)
                    pts1, pts2 = [], []
                    for t in np.linspace(0.1, 0.9, 20):
                        dist = r * t
                        offset = 5 * math.sin(t * math.pi * 2)
                        px1 = int(cx + dist * math.cos(rad) + offset * math.cos(rad + math.pi/2))
                        py1 = int(cy + dist * math.sin(rad) + offset * math.sin(rad + math.pi/2))
                        pts1.append([px1, py1])
                        pts2.append([px1 + int(3*math.cos(rad + math.pi/2)), py1 + int(3*math.sin(rad + math.pi/2))])
                    cv2.polylines(mask, [np.array(pts1, dtype=np.int32)], False, 255, 1)
                    cv2.polylines(mask, [np.array(pts2, dtype=np.int32)], False, 255, 1)
            elif pattern == "P9":  # Baroque Garland (花冠)
                cv2.circle(mask, (cx, cy), r // 2, 255, 1)
                for ang in range(0, 360, 45):
                    rad = math.radians(ang)
                    px = int(cx + r * 0.5 * math.cos(rad))
                    py = int(cy + r * 0.5 * math.sin(rad))
                    cv2.circle(mask, (px, py), 4, 255, -1)
                    for a_pet in range(0, 360, 60):
                        rx = int(px + 4 * math.cos(math.radians(a_pet)))
                        ry = int(py + 4 * math.sin(math.radians(a_pet)))
                        cv2.circle(mask, (rx, ry), 1, 255, 1)
            else: # P10 (Ornate Mirror frame)
                cv2.rectangle(mask, (cx - r//2, cy - r//2), (cx + r//2, cy + r//2), 255, thin)
                cv2.circle(mask, (cx, cy), r // 2.5, 255, thin)
                
    # ----------------------------------------------------
    # 4. Center2 & Center2Dec (Draws Inner Rectangle Frame)
    # ----------------------------------------------------
    elif part_name in ["Center2", "Center2Dec"]:
        iw = int(W * 0.7 * range_val)
        ih = int(H * 0.7 * range_val)
        iw = max(32, min(iw, W - 16))
        ih = max(32, min(ih, H - 16))
        
        if genre == "Geometry":
            if pattern == "P1":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P2":
                cr = int(min(iw, ih) * 0.15)
                cv2.line(mask, (cx - iw//2 + cr, cy - ih//2), (cx + iw//2 - cr, cy - ih//2), 255, thin)
            elif pattern == "P3":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                cv2.rectangle(mask, (cx - iw//2 - 6, cy - ih//2 - 6), (cx + iw//2 + 6, cy + ih//2 + 6), 255, thin)
            elif pattern == "P4":
                pts = np.array([[cx - iw//2 + cs, cy - ih//2], [cx + iw//2 - cs, cy - ih//2], [cx + iw//2, cy - ih//2 + cs], [cx + iw//2, cy + ih//2 - cs]], dtype=np.int32)
                cv2.polylines(mask, [pts], True, 255, thin)
            elif pattern == "P5":
                draw_spiral_motif(mask, (cx, cy), int(iw*0.6), thin, 255, coils=2)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy - ih//2), thick, 255)
            elif pattern == "P7":
                draw_ribbon_band(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy - ih//2), thick*2, 255)
            elif pattern == "P8":
                pts = np.array([[cx, cy - ih//2], [cx + iw//2, cy + ih//2], [cx - iw//2, cy + ih//2]], dtype=np.int32)
                cv2.polylines(mask, [pts], True, 255, thin)
            elif pattern == "P9":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thick)
            else: # P10
                draw_spirograph(mask, (cx, cy), int(iw*0.55), int(iw*0.25), int(iw*0.3), thin, 255)
                
        elif genre == "SF":
            if pattern == "P1":
                cr = int(min(iw, ih) * 0.15)
                pts = np.array([[cx - iw//2 + cr, cy - ih//2], [cx + iw//2 - cr, cy - ih//2], [cx + iw//2, cy - ih//2 + cr], [cx + iw//2, cy + ih//2 - cr], [cx + iw//2 - cr, cy + ih//2], [cx - iw//2 + cr, cy + ih//2], [cx - iw//2, cy + ih//2 - cr], [cx - iw//2, cy - ih//2 + cr]], dtype=np.int32)
                cv2.polylines(mask, [pts], True, 255, thick)
            elif pattern == "P2":
                cv2.line(mask, (cx - iw//2 + cs//2, cy - ih//2), (cx + iw//2 - cs//2, cy - ih//2), 255, thin)
            elif pattern == "P3":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P4":
                cv2.circle(mask, (cx, cy), int(iw*0.5), 255, thin)
            elif pattern == "P5":
                cv2.circle(mask, (cx, cy), int(iw*0.4), 255, thin)
            elif pattern == "P6":
                cv2.circle(mask, (cx, cy), int(iw*0.4), 255, thin)
            elif pattern == "P7":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 100, thick)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P8":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P9":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thick)
            else: # P10
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)

        elif genre == "Fantasy":
            if pattern == "P1":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P2":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P3":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P4":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P5":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy - ih//2), thick, 255, pitch=14.0)
            elif pattern == "P7":
                draw_ribbon_band(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy - ih//2), thick*2, 255)
            elif pattern == "P8":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P9":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            else: # P10
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)

        elif genre == "Steampunk":
            if pattern == "P1":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P2":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thick)
            elif pattern == "P3":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thick)
            elif pattern == "P4":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P5":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy - ih//2), thick, 255, pitch=8.0)
            elif pattern == "P7":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P8":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P9":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            else: # P10
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thick)

        elif genre == "Japanese":
            if pattern == "P1":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thick)
            elif pattern == "P2":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P3":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P4":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P5":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P6":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P7":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P8":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P9":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            else: # P10
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)

        elif genre == "Gothic":
            if pattern == "P1":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P2":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P3":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P4":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P5":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P6":
                draw_twisted_rope(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy - ih//2), thick, 255, pitch=10.0)
            elif pattern == "P7":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P8":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P9":
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            else: # P10
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                
        elif genre == "Organic":
            if pattern == "P1":  # Tentacle (触手)
                for side in ["top", "bottom", "left", "right"]:
                    pts = []
                    if side == "top":
                        for x in range(cx - iw//2, cx + iw//2):
                            y = int(cy - ih//2 + 5 * math.sin(x * 0.1))
                            pts.append([x, y])
                    elif side == "bottom":
                        for x in range(cx - iw//2, cx + iw//2):
                            y = int(cy + ih//2 + 5 * math.sin(x * 0.1))
                            pts.append([x, y])
                    elif side == "left":
                        for y in range(cy - ih//2, cy + ih//2):
                            x = int(cx - iw//2 + 5 * math.sin(y * 0.1))
                            pts.append([x, y])
                    elif side == "right":
                        for y in range(cy - ih//2, cy + ih//2):
                            x = int(cx + iw//2 + 5 * math.sin(y * 0.1))
                            pts.append([x, y])
                    cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P2":  # Cell grid (細胞)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                for x in range(cx - iw//2, cx + iw//2, 25):
                    cv2.circle(mask, (x, cy - ih//2), 3, 255, -1)
                    cv2.circle(mask, (x, cy + ih//2), 3, 255, -1)
            elif pattern == "P3":  # Spine/Bone (背骨)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                for x in range(cx - iw//2 + 15, cx + iw//2 - 15, 20):
                    cv2.ellipse(mask, (x, cy - ih//2), (6, 4), 0, 0, 360, 255, 1)
                    cv2.ellipse(mask, (x, cy + ih//2), (6, 4), 0, 0, 360, 255, 1)
            elif pattern == "P4":  # Vein (葉脈)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thick)
                for x in range(cx - iw//2 + 20, cx + iw//2, 30):
                    cv2.line(mask, (x, cy - ih//2), (x - 5, cy - ih//2 - 5), 255, 1)
                    cv2.line(mask, (x, cy + ih//2), (x + 5, cy + ih//2 + 5), 255, 1)
            elif pattern == "P5":  # Capillaries (血管)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P6":  # Pulse (生体ウェーブ)
                pts = []
                for x in range(cx - iw//2, cx + iw//2):
                    y = int(cy - ih//2 + 8 * math.sin(x * 0.08) if (x % 40 < 10) else cy - ih//2)
                    pts.append([x, y])
                cv2.polylines(mask, [np.array(pts, dtype=np.int32)], False, 255, thin)
            elif pattern == "P7":  # Nautilus Spiral (対数螺旋)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P8":  # Muscle Fibers (筋肉繊維)
                for offset in [-2, 2]:
                    cv2.rectangle(mask, (cx - iw//2 + offset, cy - ih//2 + offset), (cx + iw//2 - offset, cy + ih//2 - offset), 255, 1)
            elif pattern == "P9":  # Fang claws (牙爪)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            else: # P10 (Heartbeat / 双対パルス)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                cv2.rectangle(mask, (cx - iw//2 - 4, cy - ih//2 - 4), (cx + iw//2 + 4, cy + ih//2 + 4), 255, 1)
                
        elif genre == "Baroque":
            if pattern == "P1":  # Acanthus (アカンサス唐草)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                for x in range(cx - iw//2 + 15, cx + iw//2, 30):
                    cv2.ellipse(mask, (x, cy - ih//2), (10, 5), 0, 0, 180, 255, 1)
            elif pattern == "P2":  # Rocaille shell (貝殻カーブヒダ)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                for x in range(cx - iw//2 + 25, cx + iw//2, 40):
                    cv2.ellipse(mask, (x, cy - ih//2), (8, 5), 0, 0, 180, 255, 1)
            elif pattern == "P3":  # Royal Emblem (百合のシンメトリー紋章)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P4":  # Cartouche (飾り板・オーバル枠)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                cv2.ellipse(mask, (cx, cy), (int(iw*0.48), int(ih*0.48)), 0, 0, 360, 255, 1)
            elif pattern == "P5":  # Cherub Wing (羽飾り)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P6":  # Chandelier radial (シャンデリアビーズの垂れ)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
            elif pattern == "P7":  # Ivy Twisting Loop (蔦ループ)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)
                for x in range(cx - iw//2 + 20, cx + iw//2, 40):
                    cv2.circle(mask, (x, cy - ih//2), 3, 255, -1)
            elif pattern == "P8":  # Golden ribbon scroll (金糸リボン)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, 1)
                cv2.rectangle(mask, (cx - iw//2 - 3, cy - ih//2 - 3), (cx + iw//2 + 3, cy + ih//2 + 3), 255, 1)
            elif pattern == "P9":  # Baroque Garland (花冠)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, 1)
                for x in range(cx - iw//2 + 20, cx + iw//2, 30):
                    cv2.circle(mask, (x, cy - ih//2), 4, 255, -1)
            else: # P10 (Ornate Mirror frame)
                cv2.rectangle(mask, (cx - iw//2, cy - ih//2), (cx + iw//2, cy + ih//2), 255, thin)

        mask[H-cy:H, cs:W-cs] = cv2.flip(mask[0:cy, cs:W-cs], 0)
        
    return mask

def generate_frame_composite(W, H, parts_settings, sides_count=4):
    """
    Generate the complete composite frame image based on the parts settings.
    Uses dynamic rotational symmetry (sides_count) to construct 3 to 6-sided polygon frames.
    Renders everything on a high-resolution square canvas (512x512) to ensure perfect geometry
    without clipping or detail loss, then resizes each raw mask to the target W x H and
    applies the post-processing bevels/textures before final compositing.
    """
    S = 512  # Reference high-res size for solid geometry calculations
    composite = np.zeros((H, W), dtype=np.uint8)
    cx, cy = S // 2, S // 2
    
    render_order = [
        ("Center", 1.0),
        ("CenterDec", 0.7),
        ("Center2", 0.8),
        ("Center2Dec", 0.6),
        ("4Sides", 0.9),
        ("4SidesDec", 0.7),
        ("4Corners", 1.0),
        ("4CornersDec", 0.8)
    ]
    
    for part_name, opacity in render_order:
        cfg = parts_settings[part_name]
        
        # Part-level visibility toggle
        if not cfg.get("visible", True):
            continue
            
        intensity = cfg.get("intensity", 0.5)
        if intensity <= 0.02:
            continue
            
        genre = cfg.get("genre", "Geometry")
        pattern = cfg.get("pattern", "P1")
        style = cfg.get("style", "Ink")
        range_val = cfg.get("range", 1.0)
        
        # Generate raw 1-quadrant component mask using the reference square size S
        part_mask = generate_part_mask(part_name, genre, pattern, style, intensity, range_val, S, S)
        
        # Apply rotational symmetry to replicate Corner/Side to all polygon faces on the reference S x S canvas
        if part_name in ["4Corners", "4CornersDec", "4Sides", "4SidesDec"]:
            s_composite = np.zeros_like(part_mask)
            for i in range(sides_count):
                angle = i * (360.0 / sides_count)
                if angle == 0:
                    s_composite = np.maximum(s_composite, part_mask)
                else:
                    rotated = rotate_image(part_mask, angle, (cx, cy))
                    s_composite = np.maximum(s_composite, rotated)
            part_mask = s_composite
            
        # Resize the geometrically perfect square mask to fit the target resolution (W, H)
        # This acts as an aspect-ratio-friendly stretching operation.
        part_mask_resized = cv2.resize(part_mask, (W, H), interpolation=cv2.INTER_LINEAR)
        
        # Now apply the bevel gradient and texture style on the final W x H canvas size.
        # This keeps texture patterns (like Dot grid or Spray) sharp at the target resolution!
        part_mask_styled = apply_bevel_gradient(part_mask_resized, intensity)
        part_mask_styled = apply_render_style(part_mask_styled, style, intensity)
        
        if opacity < 1.0:
            part_mask_styled = (part_mask_styled * opacity).astype(np.uint8)
            
        composite = np.maximum(composite, part_mask_styled)
        
    bgr_composite = cv2.cvtColor(composite, cv2.COLOR_GRAY2BGR)
    pil_img = Image.fromarray(cv2.cvtColor(bgr_composite, cv2.COLOR_BGR2RGB))
    return pil_img
