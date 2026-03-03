#!/usr/bin/env python3
"""
MindVault CLIP Tagger
─────────────────────
Scores one or more images against the MindVault tag catalog using
OpenAI CLIP (ViT-B/32). When multiple images are given (e.g. video
frames), their embeddings are averaged before scoring — giving CLIP
a holistic view of the whole video rather than a single frame.

Usage (called by ai.js via child_process):
  python3 clip_tagger.py '<json_input>'

JSON input:
  {
    "imagePaths": ["/abs/frame1.jpg", "/abs/frame2.jpg"],   // multi-frame
    "imagePath":  "/abs/path/to/thumb.jpg",                 // legacy single
    "tags": ["Natural Light", "Handheld", ...],
    "topK": 15,
    "threshold": 0.001
  }

JSON output:
  { "tags": [...], "scores": {...}, "device": "mps", "frames": 3 }

On error:
  { "error": "description" }
"""

import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input JSON provided"}))
        sys.exit(1)

    try:
        data = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    # Accept both imagePaths (array) and imagePath (legacy single string)
    image_paths = data.get("imagePaths", None)
    if not image_paths:
        single = data.get("imagePath", "")
        image_paths = [single] if single else []

    tags      = data.get("tags", [])
    top_k     = int(data.get("topK", 15))
    threshold = float(data.get("threshold", 0.001))

    # Validate all paths exist
    valid_paths = [p for p in image_paths if p and os.path.exists(p)]
    if not valid_paths:
        missing = [p for p in image_paths if not os.path.exists(p)]
        print(json.dumps({"error": f"No valid image paths. Missing: {missing[:3]}"}))
        sys.exit(1)

    if not tags:
        print(json.dumps({"error": "No tags provided"}))
        sys.exit(1)

    # ── Load CLIP ─────────────────────────────────────────────────────────────
    try:
        import torch
        import clip
        from PIL import Image
    except ImportError as e:
        print(json.dumps({"error": f"Missing dependency: {e}. Run setup-clip.sh first."}))
        sys.exit(1)

    # Device: MPS (Apple Silicon) > CUDA > CPU
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    try:
        model, preprocess = clip.load("ViT-B/32", device=device)
        model.eval()
    except Exception as e:
        print(json.dumps({"error": f"CLIP model load failed: {e}"}))
        sys.exit(1)

    # ── Encode all images, then average embeddings ────────────────────────────
    try:
        with torch.no_grad():
            image_embeddings = []
            for img_path in valid_paths:
                try:
                    img = Image.open(img_path).convert("RGB")
                    tensor = preprocess(img).unsqueeze(0).to(device)
                    feat = model.encode_image(tensor)
                    feat = feat / feat.norm(dim=-1, keepdim=True)
                    image_embeddings.append(feat)
                except Exception as e:
                    # Skip unreadable frames, continue with others
                    pass

            if not image_embeddings:
                print(json.dumps({"error": "All image frames failed to load"}))
                sys.exit(1)

            # Average all frame embeddings → holistic video representation
            if len(image_embeddings) > 1:
                avg_features = torch.stack(image_embeddings).mean(dim=0)
                avg_features = avg_features / avg_features.norm(dim=-1, keepdim=True)
            else:
                avg_features = image_embeddings[0]

            # Encode tags
            text_inputs = clip.tokenize(tags, truncate=True).to(device)
            text_features = model.encode_text(text_inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            # Cosine similarity → softmax
            similarity = (avg_features @ text_features.T).squeeze(0)
            scores = similarity.softmax(dim=-1).cpu().tolist()

    except Exception as e:
        print(json.dumps({"error": f"CLIP inference failed: {e}"}))
        sys.exit(1)

    # ── Rank and return top-k ─────────────────────────────────────────────────
    tag_scores = sorted(zip(tags, scores), key=lambda x: x[1], reverse=True)
    selected   = tag_scores[:top_k]

    result_tags   = [tag for tag, _ in selected]
    result_scores = {tag: round(score, 6) for tag, score in selected}

    print(json.dumps({
        "tags":   result_tags,
        "scores": result_scores,
        "device": device,
        "frames": len(valid_paths),
    }))


if __name__ == "__main__":
    main()
