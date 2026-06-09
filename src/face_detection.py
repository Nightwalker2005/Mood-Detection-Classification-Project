import os
import cv2

# YuNet face detector (the same model the project used before, via OpenCV directly).
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "face_detection_yunet.onnx")

SCORE_THRESHOLD = 0.9
NMS_THRESHOLD = 0.3
TOP_K = 5000

_detector = None


def _get_detector():
    """Lazily create the YuNet detector (reused across calls)."""
    global _detector
    if _detector is None:
        _detector = cv2.FaceDetectorYN.create(
            MODEL_PATH, "", (320, 320),
            SCORE_THRESHOLD, NMS_THRESHOLD, TOP_K,
        )
    return _detector


def detect_faces(image):
    """Detect faces with YuNet. Returns a list of (x, y, w, h) boxes."""
    try:
        H, W = image.shape[:2]
        detector = _get_detector()
        detector.setInputSize((W, H))
        _, faces = detector.detect(image)
    except Exception:
        return []

    if faces is None:
        return []

    boxes = []
    H, W = image.shape[:2]
    for f in faces:
        x, y, w, h = int(f[0]), int(f[1]), int(f[2]), int(f[3])
        # Clamp to image bounds; YuNet can return slightly out-of-frame coords.
        x = max(x, 0)
        y = max(y, 0)
        w = min(w, W - x)
        h = min(h, H - y)
        if w > 0 and h > 0:
            boxes.append((x, y, w, h))
    return boxes


def draw_faces(image, faces):
    """Draw a green rectangle around each detected face."""
    for (x, y, w, h) in faces:
        cv2.rectangle(image, (x, y), (x + w, y + h), (0, 255, 0), 2)
    return image


def extract_faces(image, padding=0):
    """
    Detect faces and return a list of (face_crop, box) pairs.
    - face_crop: the cut-out face image, to send to the mood model
    - box: the (x, y, w, h) location, for drawing/labeling later
    """
    results = []
    H, W = image.shape[:2]
    for (x, y, w, h) in detect_faces(image):
        x1 = max(x - padding, 0)
        y1 = max(y - padding, 0)
        x2 = min(x + w + padding, W)
        y2 = min(y + h + padding, H)
        if x2 > x1 and y2 > y1:
            results.append((image[y1:y2, x1:x2], (x, y, w, h)))
    return results
