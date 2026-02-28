#!/usr/bin/env python3
"""
MindVault CLIP Tagger
─────────────────────
Scores a thumbnail image against the MindVault tag catalog using
OpenAI CLIP (ViT-B/32). Returns ranked tags as JSON.

Usage (called by ai.js via child_process):
  python3 clip_tagger.py '<json_input>'

JSON input:
  {
    "imagePath": "/abs/path/to/thumb.jpg",
    "tags": ["Natural Light", "Handheld", ...],   // full catalog
    "topK": 12,                                    // how many tags to return
    "threshold": 0.008                             // min similarity to include
  }

JSON output:
  { "tags": ["tag1", "tag2", ...], "scores": { "tag1": 0.045, ... } }

On error:
  { "error": "description" }
"""

import sys
import json
import os

def main():
    # ── Parse input ──────────────────────────────────────────────────────────
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input JSON provided"}))
        sys.exit(1)

    try:
        data = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    image_path = data.get("imagePath", "")
    tags       = data.get("tags", [])
    top_k      = int(data.get("topK", 12))
    threshold  = float(data.get("threshold", 0.008))

    if not image_path or not os.path.exists(image_path):
        print(json.dumps({"error": f"Image not found: {image_path}"}))
        sys.exit(1)

    if not tags:
        print(json.dumps({"error": "No tags provided"}))
        sys.exit(1)

    # ── Load CLIP (lazy import so startup errors are readable) ───────────────
    try:
        import torch
        import clip
        from PIL import Image
    except ImportError as e:
        print(json.dumps({"error": f"Missing dependency: {e}. Run setup-clip.sh first."}))
        sys.exit(1)

    # ── Device selection: MPS (Apple Silicon) > CUDA > CPU ──────────────────
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    # ── Load model (cached in ~/.cache/clip/ after first download) ───────────
    try:
        model, preprocess = clip.load("ViT-B/32", device=device)
        model.eval()
    except Exception as e:
        print(json.dumps({"error": f"CLIP model load failed: {e}"}))
        sys.exit(1)

    # ── Load and preprocess image ─────────────────────────────────────────────
    try:
        img = Image.open(image_path).convert("RGB")
        image_tensor = preprocess(img).unsqueeze(0).to(device)
    except Exception as e:
        print(json.dumps({"error": f"Image load failed: {e}"}))
        sys.exit(1)

    # ── Encode image and tags ─────────────────────────────────────────────────
    try:
        with torch.no_grad():
            image_features = model.encode_image(image_tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            # CLIP tokenizer has a max of 77 tokens — long tags are fine
            text_inputs = clip.tokenize(tags, truncate=True).to(device)
            text_features = model.encode_text(text_inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            # Cosine similarity scaled to [0, 1]
            similarity = (image_features @ text_features.T).squeeze(0)
            # Softmax so scores sum to 1 (makes threshold meaningful)
            scores = similarity.softmax(dim=-1).cpu().tolist()

    except Exception as e:
        print(json.dumps({"error": f"CLIP inference failed: {e}"}))
        sys.exit(1)

    # ── Rank — always return exactly top_k, no threshold cutoff ─────────────
    tag_scores = sorted(zip(tags, scores), key=lambda x: x[1], reverse=True)
    selected   = tag_scores[:top_k]

    result_tags   = [tag for tag, _ in selected]
    result_scores = {tag: round(score, 6) for tag, score in selected}

    print(json.dumps({
        "tags":   result_tags,
        "scores": result_scores,
        "device": device,
    }))


if __name__ == "__main__":
    main()
