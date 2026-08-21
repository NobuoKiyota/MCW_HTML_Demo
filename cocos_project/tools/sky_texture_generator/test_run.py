import os
from PIL import Image
from sky_processor import process_sky_image, get_unique_output_path

def run_test():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    test_img_path = os.path.join(test_dir, "sample_sky.png")

    # 4032x1816 のサンプル空画像を作成
    img = Image.new("RGBA", (4032, 1816), (70, 130, 220, 255))
    img.save(test_img_path)

    print(f"Created sample image: {test_img_path} ({img.size})")

    # シームレス加工テスト
    processed = process_sky_image(
        input_path=test_img_path,
        target_width=1024,
        target_height=4096,
        auto_rotate=True,
        auto_scale=True,
        crop_offset=0.5,
        blend_percent=0.08,
        enable_chromakey=True,
        chromakey_color=(70, 130, 220),
        chromakey_tolerance=30.0,
        chromakey_softness=10.0
    )

    out_path = get_unique_output_path(test_img_path)
    processed.save(out_path, format="PNG")

    print(f"Successfully processed image!")
    print(f"Output Path: {out_path}")
    print(f"Output Size: {processed.size}")

    # クリーンアップ
    if os.path.exists(test_img_path):
        os.remove(test_img_path)

if __name__ == "__main__":
    run_test()
