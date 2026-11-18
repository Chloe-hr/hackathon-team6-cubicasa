import numpy as np
from PIL import Image, ImageFilter, ImageOps


def drawing_array(image, size):
    inverted = ImageOps.invert(ImageOps.grayscale(image))
    side = max(inverted.size)
    square = Image.new('L', (side, side), 0)
    square.paste(inverted, ((side - inverted.width) // 2, (side - inverted.height) // 2))
    return np.asarray(square.resize((size, size), Image.Resampling.LANCZOS), dtype=np.uint8)


def clean_plan(plan):
    image = Image.fromarray(plan)

    wide = image.filter(
        ImageFilter.MinFilter(5)
    ).filter(
        ImageFilter.MaxFilter(5)
    )

    lines = (
        np.asarray(image, dtype=np.float32)
        - np.asarray(wide, dtype=np.float32)
    )

    strong = lines[lines > 8]

    if strong.size < 20:
        return np.zeros_like(plan)

    return (
        lines / np.percentile(strong, 90) > 0.35
    ).astype(np.uint8) * 255


def preprocess(image, size):
    cleaned = clean_plan(drawing_array(image, size))
    return (cleaned.astype(np.float32) / 255.0)[None, None]
