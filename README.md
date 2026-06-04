# Mood-Detection-Classification-Project

A real-time facial mood detector. It finds faces in a webcam feed or uploaded image, classifies each face's mood into one of three groups — **Positive**, **Negative**, or **Neutral** — and displays the result with a confidence score.

## How It Works

The system runs a two-stage pipeline on each video frame:

1. **Face detection** (`src/face_detection.py`) — uses DeepFace's YuNet detector to locate faces and crop them out of the frame.
2. **Mood classification** (`src/predict.py`) — passes each cropped face to DeepFace's pre-trained emotion model, which returns seven emotion scores. These are folded into three groups, and the strongest group is reported with its confidence.

The entry point (`src/app.py`) ties the two stages together and draws the labeled results onto the live video.

### Emotion grouping

| Group    | Emotions                  |
|----------|---------------------------|
| Positive | happy, surprise           |
| Negative | angry, disgust, fear, sad |
| Neutral  | neutral                   |

## Project Structure

```
src/
  face_detection.py   # detect and crop faces (DeepFace YuNet)
  predict.py          # classify mood with DeepFace, group into 3 categories
  app.py              # entry point: runs the webcam/image/video pipeline
api.py                # Flask REST API for the web frontend
frontend/
  index.html          # page structure
  style.css           # all styling
  app.js              # all JavaScript (camera loop, upload, results)
data/                 # placeholder (for a future custom-model dataset)
models/               # placeholder (for a future custom-trained model)
notebooks/            # placeholder (for experiments)
requirements.txt      # Python dependencies
```

> `data/`, `models/`, `notebooks/`, and the empty `train.py`/`preprocess.py` are scaffolding for a possible future version that trains its own model. The current version uses DeepFace's pre-trained model and does not need them.

## Setup

**Requires Python 3.13** (TensorFlow does not yet support Python 3.14).

1. Clone the repository:
   ```
   git clone https://github.com/Nightwalker2005/Mood-Detection-Classification-Project.git
   cd Mood-Detection-Classification-Project
   ```

2. Create and activate a virtual environment with Python 3.13:
   ```
   py -3.13 -m venv venv
   venv\Scripts\activate
   ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Usage

### Command-line (terminal)

Run from the project root:

```
python src\app.py
```

A webcam window opens with a green box and a mood label (e.g. `Positive (87%)`) over each detected face. Press **q** in the window to quit.

You can also process images or videos directly:

| Command | Description |
|---|---|
| `python src\app.py photo.jpg` | Analyze a single image from the `inputs/` folder |
| `python src\app.py all` | Process all images in the `inputs/` folder |
| `python src\app.py pick` | Open a file picker to select an image or video |

Supported image formats: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`

Labeled output images are saved to the `outputs/` folder automatically.

> On the **first run**, DeepFace downloads its emotion model (~6 MB), so it needs internet and takes a little longer to start. After that it runs offline.

### Web frontend

The project includes a browser-based UI with live camera mode and image upload.

**Start the API server** from the project root:
```
python api.py
```

Your browser will open automatically at `http://localhost:5000`. From there you can:

- **Camera mode** — streams your webcam live at 60fps with mood labels overlaid directly on the video. The API is polled every 0.5 seconds in the background to update the detections without interrupting the feed.
- **Upload mode** — drag and drop (or browse for) an image and click **Analyze** to get mood labels drawn over each detected face.

Both modes use colour-coded labels:

| Colour | Mood |
|--------|------|
| 🟢 Green | Positive |
| 🔴 Red | Negative |
| 🟣 Purple | Neutral |

The **Detection Results** panel on the right shows each detected face with its mood and a confidence bar. The **Session Stats** panel shows how many frames have been analyzed and how many faces are currently detected.

## Notes

- `predict.py` sets `TF_USE_LEGACY_KERAS=1` so DeepFace works with the Keras 3 bundled in recent TensorFlow, and stores model weights in an ASCII-only path. These are handled in code — no extra setup needed.
- The emotion model is trained on FER-2013. Like most models trained on it, it can read calm or concentrating faces as sad/negative; clear expressions (a big smile, a frown) classify more reliably.

## Tech Stack

- Python 3.13
- OpenCV — image processing
- DeepFace + TensorFlow / tf-keras — face detection and emotion classification
- NumPy
- Flask + flask-cors — REST API for the web frontend
- HTML / CSS / JavaScript — web frontend

## Team

- Prince Geraldo
- Andy Sackey