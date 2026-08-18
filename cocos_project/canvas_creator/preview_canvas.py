import tkinter as tk
import customtkinter as ctk
from PIL import Image, ImageTk

class PreviewCanvas(ctk.CTkFrame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        
        # Internal canvas
        self.canvas = ctk.CTkCanvas(self, bg="#1a1a1a", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        # State variables
        self.pil_image = None        # Original source PIL Image
        self.tk_image = None         # Reference to avoid garbage collection
        self.image_id = None         # Canvas object ID for the image
        
        self.zoom_level = 1.0
        self.pan_x = 0.0             # Offset X in canvas coordinates
        self.pan_y = 0.0             # Offset Y in canvas coordinates
        
        self.drag_start_x = 0
        self.drag_start_y = 0
        
        # Bind events
        self.canvas.bind("<ButtonPress-1>", self.on_drag_start)
        self.canvas.bind("<B1-Motion>", self.on_drag_motion)
        self.canvas.bind("<MouseWheel>", self.on_zoom)
        self.canvas.bind("<Configure>", self.on_resize)
        
    def set_image(self, pil_image):
        """Set a new image and optionally reset the view if first time."""
        is_first = (self.pil_image is None)
        self.pil_image = pil_image
        if is_first:
            self.reset_view()
        else:
            self.redraw()
            
    def reset_view(self):
        """Center the image and fit to the canvas."""
        if self.pil_image is None:
            return
            
        canvas_w = self.canvas.winfo_width()
        canvas_h = self.canvas.winfo_height()
        
        # Fallback if not mapped yet
        if canvas_w <= 1 or canvas_h <= 1:
            canvas_w = 400
            canvas_h = 400
            
        img_w, img_h = self.pil_image.size
        
        # Calculate fit zoom
        fit_zoom_w = canvas_w / img_w
        fit_zoom_h = canvas_h / img_h
        self.zoom_level = min(fit_zoom_w, fit_zoom_h, 1.0) * 0.9  # 90% of fit or 1.0 max
        if self.zoom_level < 0.1:
            self.zoom_level = 0.1
            
        # Center coordinates
        self.pan_x = canvas_w / 2
        self.pan_y = canvas_h / 2
        
        self.redraw()

    def redraw(self):
        """Redraw the image scaled and panned."""
        if self.pil_image is None:
            return
            
        # Canvas dimensions
        canvas_w = self.canvas.winfo_width()
        canvas_h = self.canvas.winfo_height()
        if canvas_w <= 1 or canvas_h <= 1:
            return
            
        # Apply scaling
        img_w, img_h = self.pil_image.size
        new_w = max(int(img_w * self.zoom_level), 5)
        new_h = max(int(img_h * self.zoom_level), 5)
        
        # Resize image using Box or Lanczos depending on shrink/grow
        # Custom resampling to ensure grayscale detail
        resample_method = Image.Resampling.LANCZOS if self.zoom_level > 1.0 else Image.Resampling.BILINEAR
        resized_img = self.pil_image.resize((new_w, new_h), resample=resample_method)
        
        # Create PhotoImage
        self.tk_image = ImageTk.PhotoImage(resized_img)
        
        # Clear canvas
        self.canvas.delete("all")
        
        # Draw image centered around pan_x, pan_y
        self.image_id = self.canvas.create_image(
            self.pan_x, self.pan_y,
            anchor=tk.CENTER,
            image=self.tk_image
        )
        
        # Draw target/size boundary overlay (subtle white border around the actual frame boundary)
        # to help user see frame edges in low contrast
        half_w = new_w / 2
        half_h = new_h / 2
        self.canvas.create_rectangle(
            self.pan_x - half_w, self.pan_y - half_h,
            self.pan_x + half_w, self.pan_y + half_h,
            outline="#333333", width=1, dash=(4, 4)
        )
        
        # Display zoom indicator text in the top-left corner
        self.canvas.create_text(
            10, 10,
            text=f"Zoom: {int(self.zoom_level * 100)}%",
            fill="#888888",
            anchor="nw",
            font=("Arial", 10)
        )

    def on_drag_start(self, event):
        self.drag_start_x = event.x
        self.drag_start_y = event.y

    def on_drag_motion(self, event):
        dx = event.x - self.drag_start_x
        dy = event.y - self.drag_start_y
        self.pan_x += dx
        self.pan_y += dy
        self.drag_start_x = event.x
        self.drag_start_y = event.y
        self.redraw()

    def on_zoom(self, event):
        """Zoom in/out around the mouse cursor position."""
        if self.pil_image is None:
            return
            
        # Determine zoom direction
        zoom_factor = 1.1 if event.delta > 0 else 0.9
        new_zoom = self.zoom_level * zoom_factor
        
        # Clamp zoom level
        if new_zoom < 0.05:
            new_zoom = 0.05
        elif new_zoom > 20.0:
            new_zoom = 20.0
            
        # Zoom around cursor:
        # Calculate cursor relative to image center (pan_x, pan_y)
        cursor_x = event.x
        cursor_y = event.y
        
        # Relocate pan to keep the point under cursor at the same canvas position
        self.pan_x = cursor_x - (cursor_x - self.pan_x) * (new_zoom / self.zoom_level)
        self.pan_y = cursor_y - (cursor_y - self.pan_y) * (new_zoom / self.zoom_level)
        
        self.zoom_level = new_zoom
        self.redraw()

    def on_resize(self, event):
        # Trigger redraw on widget resize to update center calculations
        # and prevent image getting lost during window resizing
        if self.pil_image is not None and (self.pan_x == 0.0 and self.pan_y == 0.0):
            self.reset_view()
        else:
            self.redraw()
