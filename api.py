import os
import sys
import base64
import threading
import webbrowser
import numpy as np
import cv2
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Add src/ to path so we can import from it
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from face_detection import extract_faces
from predict import predict_mood

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR)
CORS(app)


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)

def decode_image(data):
    """Decode a base64 image string or raw bytes into an OpenCV image."""
    if isinstance(data, str):
        if "," in data:
            data = data.split(",", 1)[1]
        img_bytes = base64.b64decode(data)
    else:
        img_bytes = data
    arr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def analyze_image(image):
    """Run face detection + mood classification and return results list."""
    results = []
    for face_crop, (x, y, w, h) in extract_faces(image):
        mood, confidence = predict_mood(face_crop)
        results.append({
            "mood": mood,
            "confidence": round(float(confidence) * 100, 1),
            "box": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
        })
    return results


def draw_results(image, results):
    """Draw boxes + labels onto the image and return as base64 JPEG."""
    for r in results:
        b = r["box"]
        x, y, w, h = b["x"], b["y"], b["w"], b["h"]
        cv2.rectangle(image, (x, y), (x + w, y + h), (0, 255, 0), 2)
        text = f"{r['mood']} ({r['confidence']}%)"
        cv2.putText(image, text, (x, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    _, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode()


@app.route("/analyze/image", methods=["POST"])
def analyze_uploaded_image():
    """Accept a multipart file upload and return labeled image + mood data."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    image = decode_image(file.read())
    if image is None:
        return jsonify({"error": "Could not decode image"}), 400

    h, w = image.shape[:2]
    scale = 900 / max(h, w)
    if scale < 1:
        image = cv2.resize(image, (int(w * scale), int(h * scale)))

    results = analyze_image(image)
    labeled = draw_results(image, results)
    return jsonify({"faces": results, "labeled_image": labeled})


@app.route("/analyze/frame", methods=["POST"])
def analyze_webcam_frame():
    """Accept a base64 webcam frame and return labeled image + mood data."""
    data = request.get_json(silent=True)
    if not data or "frame" not in data:
        return jsonify({"error": "No frame provided"}), 400
    image = decode_image(data["frame"])
    if image is None:
        return jsonify({"error": "Could not decode frame"}), 400

    results = analyze_image(image)
    labeled = draw_results(image, results)
    return jsonify({"faces": results, "labeled_image": labeled})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = 5000
    url = f"http://127.0.0.1:{port}"
    # Open the browser after a short delay so the server is ready
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    print(f"Starting MoodScan — opening {url} in your browser...")
    app.run(host="0.0.0.0", port=port, debug=False)