import os
import cv2
import numpy as np
import onnxruntime as ort

# FER+ emotion model (8 emotions), loaded once and reused.
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "emotion-ferplus-8.onnx")

# FER+ output order
EMOTIONS = ["neutral", "happiness", "surprise", "sadness",
            "anger", "disgust", "fear", "contempt"]

_session = None
_input_name = None


def _get_session():
    """Lazily create the ONNX inference session (single-threaded, CPU)."""
    global _session, _input_name
    if _session is None:
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        _session = ort.InferenceSession(
            MODEL_PATH, sess_options=opts, providers=["CPUExecutionProvider"]
        )
        _input_name = _session.get_inputs()[0].name
    return _session


def _softmax(x):
    e = np.exp(x - np.max(x))
    return e / e.sum()


def predict_mood(face_crop):
    """
    Take a cropped face image (BGR) and return (mood, confidence).
    - mood: "Positive", "Negative", "Neutral", or "Unknown"
    - confidence: a float between 0 and 1
    """
    try:
        # FER+ expects a 64x64 grayscale image, raw 0-255 pixel values.
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        resized = cv2.resize(gray, (64, 64)).astype(np.float32)
        tensor = resized.reshape(1, 1, 64, 64)

        session = _get_session()
        logits = session.run(None, {_input_name: tensor})[0][0]
        probs = _softmax(logits)
        scores = dict(zip(EMOTIONS, probs))

        # Fold the 8 emotions into 3 groups (matches the old DeepFace mapping).
        groups = {
            "Positive": scores["happiness"] + scores["surprise"],
            "Negative": scores["anger"] + scores["disgust"] + scores["fear"]
                        + scores["sadness"] + scores["contempt"],
            "Neutral":  scores["neutral"],
        }

        mood = max(groups, key=groups.get)
        confidence = float(groups[mood])
        return mood, confidence

    except Exception:
        return "Unknown", 0.0
