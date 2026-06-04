import os
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["DEEPFACE_HOME"] = "C:/deepface"

from deepface import DeepFace


def predict_mood(face_crop):
    """
    Take a cropped face image and return (mood, confidence).
    - mood: "Positive", "Negative", "Neutral", or "Unknown"
    - confidence: a float between 0 and 1
    """
    try:
        result = DeepFace.analyze(
            face_crop,
            actions=["emotion"],
            detector_backend="skip",   # we already cropped the face ourselves
        )
        scores = result[0]["emotion"]  # 7 emotions, each a score out of 100

        # Fold DeepFace's 7 emotions into your 3 groups
        groups = {
            "Positive": scores["happy"] + scores["surprise"],
            "Negative": scores["angry"] + scores["disgust"] + scores["fear"] + scores["sad"],
            "Neutral":  scores["neutral"],
        }

        mood = max(groups, key=groups.get)   # whichever group scores highest
        confidence = groups[mood] / 100.0    # turn the percentage into 0–1
        return mood, confidence

    except Exception:
        return "Unknown", 0.0