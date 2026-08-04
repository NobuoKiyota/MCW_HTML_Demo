import sys
import os
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

class WebMConverterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("MP4 -> WebM 高画質自動コンバーター")
        self.root.geometry("520 x 380")
        self.root.resizable(False, False)

        # Style
        style = ttk.Style()
        style.theme_use('clam')

        # Header
        header = tk.Label(root, text="MP4 to WebM 高画質コンバーター", font=("Helvetica", 14, "bold"), bg="#1e1e2e", fg="#cdd6f4", py=10)
        header.pack(fill=tk.X)

        # Drop Zone Frame
        self.drop_frame = tk.Frame(root, bg="#313244", highlightbackground="#89b4fa", highlightthickness=2)
        self.drop_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=15)

        self.label_instructions = tk.Label(
            self.drop_frame,
            text="【ファイルを選択】ボタンを押すか\nここに MP4 ファイルをドロップしてください",
            font=("Helvetica", 11),
            bg="#313244",
            fg="#bac2de",
            justify="center"
        )
        self.label_instructions.pack(expand=True)

        btn_select = tk.Button(
            self.drop_frame,
            text="ファイルを選択...",
            command=self.select_files,
            font=("Helvetica", 10, "bold"),
            bg="#89b4fa",
            fg="#11111b",
            padx=15,
            pady=5,
            relief="flat"
        )
        btn_select.pack(pady=(0, 20))

        # Windows Drag & Drop Support via windnd if available
        try:
            import windnd
            windnd.hook_dropfiles(self.root, func=self.on_files_dropped)
        except ImportError:
            pass

        # Options Frame
        opts_frame = tk.Frame(root, bg="#1e1e2e", py=5)
        opts_frame.pack(fill=tk.X, padx=20)

        self.audio_var = tk.BooleanVar(value=False)
        chk_audio = tk.Checkbutton(
            opts_frame,
            text="音声を消去する (背景動画用に軽量化 -an)",
            variable=self.audio_var,
            font=("Helvetica", 9),
            bg="#1e1e2e",
            fg="#cdd6f4",
            selectcolor="#313244",
            activebackground="#1e1e2e",
            activeforeground="#cdd6f4"
        )
        chk_audio.pack(side=tk.LEFT)

        # Status / Progress
        self.status_label = tk.Label(root, text="待機中...", font=("Helvetica", 9), bg="#1e1e2e", fg="#a6adc8")
        self.status_label.pack(anchor="w", padx=20, pady=(5, 2))

        self.progress = ttk.Progressbar(root, mode="indeterminate")
        self.progress.pack(fill=tk.X, padx=20, pady=(0, 15))

    def select_files(self):
        files = filedialog.askopenfilenames(
            title="変換するMP4ファイルを選択",
            filetypes=[("MP4 Video", "*.mp4"), ("All Files", "*.*")]
        )
        if files:
            self.start_conversion(files)

    def on_files_dropped(self, files):
        # Convert byte paths to strings if needed
        file_list = [f.decode('utf-8', errors='ignore') if isinstance(f, bytes) else f for f in files]
        mp4_files = [f for f in file_list if f.lower().endswith('.mp4')]
        if mp4_files:
            self.start_conversion(mp4_files)
        else:
            messagebox.showwarning("警告", "MP4ファイルのみ選択・ドロップしてください。")

    def start_conversion(self, file_paths):
        threading.Thread(target=self._convert_worker, args=(file_paths,), daemon=True).start()

    def _convert_worker(self, file_paths):
        self.progress.start(10)
        remove_audio = self.audio_var.get()

        for idx, in_path in enumerate(file_paths):
            out_path = os.path.splitext(in_path)[0] + ".webm"
            filename = os.path.basename(in_path)
            
            self.status_label.config(text=f"[{idx+1}/{len(file_paths)}] 変換中: {filename} ...")

            cmd = [
                "ffmpeg",
                "-i", in_path,
                "-c:v", "libvpx-vp9",
                "-crf", "30",
                "-b:v", "0",
                "-pix_fmt", "yuv420p",
                "-row-mt", "1",
                "-y",
                out_path
            ]
            if remove_audio:
                cmd.insert(-1, "-an")

            try:
                subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                print(f"[Success] Converted {in_path} -> {out_path}")
            except Exception as e:
                print(f"[Error] Failed to convert {in_path}: {e}")

        self.progress.stop()
        self.status_label.config(text=f"完了! {len(file_paths)} 件のファイルを変換しました。")
        messagebox.showinfo("完了", "すべての変換が完了しました！")

if __name__ == "__main__":
    root = tk.Tk()
    app = WebMConverterApp(root)
    root.mainloop()
