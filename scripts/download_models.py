"""Download the offline face models (OpenCV Zoo, Apache-2.0): YuNet detector + SFace recogniser.

    python scripts/download_models.py

Not needed if FACE_PROVIDER=rekognition.
"""
import sys
import urllib.request
from pathlib import Path

MODELS = Path(__file__).resolve().parent.parent / "models"
FILES = {
    "face_detection_yunet_2023mar.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}

MODELS.mkdir(exist_ok=True)
for name, url in FILES.items():
    dest = MODELS / name
    if dest.exists() and dest.stat().st_size > 10_000:
        print(f"ok   {name}")
        continue
    print(f"get  {name}")
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception as e:
        sys.exit(f"Failed to download {name}: {e}\nDownload it manually from {url} into {MODELS}/")
print("Face models ready. Set FACE_PROVIDER=local.")
