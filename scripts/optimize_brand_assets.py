from pathlib import Path

from PIL import Image


ASSET_DIR = Path(__file__).resolve().parents[1] / "assets" / "images"
TARGETS = {
    "icon.png": 1024,
    "splash-icon.png": 1024,
    "android-icon-foreground.png": 1024,
    "favicon.png": 512,
}


for filename, longest_side in TARGETS.items():
    path = ASSET_DIR / filename
    with Image.open(path) as image:
        image = image.convert("RGB")
        image.thumbnail((longest_side, longest_side), Image.Resampling.LANCZOS)
        image.save(path, "PNG", optimize=True, compress_level=9)
        print(f"optimized {filename}: {image.width}x{image.height}")
