#!/usr/bin/env python3
"""
MindVault CLIP Tagger
─────────────────────
Scores a thumbnail image against the MindVault tag catalog using
OpenAI CLIP (ViT-B/32). Uses descriptive prompts for better zero-shot
accuracy, but returns human-readable tag labels.

Usage (called by ai.js via child_process):
  python3 clip_tagger.py '<json_input>'

JSON input (new format with prompts):
  {
    "imagePath": "/abs/path/to/thumb.jpg",
    "tagDefs": [{ "label": "Natural Light", "prompt": "a scene lit by natural sunlight" }, ...],
    "topK": 15,
    "threshold": 0.008    // min softmax score to include (filters irrelevant tags)
  }

JSON output:
  { "tags": ["tag1", "tag2", ...], "scores": { "tag1": 0.045, ... }, "device": "mps" }

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
    top_k      = int(data.get("topK", 12))
    threshold  = float(data.get("threshold", 0.008))

    # Support both new { tagDefs: [{label, prompt}] } and legacy { tags: [...] } format
    tag_defs = data.get("tagDefs", None)
    if tag_defs and isinstance(tag_defs, list) and len(tag_defs) > 0 and isinstance(tag_defs[0], dict):
        labels  = [t["label"]  for t in tag_defs]
        prompts = [t.get("prompt", t["label"]) for t in tag_defs]
    else:
        # Fallback: legacy plain string array
        legacy_tags = data.get("tags", [])
        labels  = legacy_tags
        prompts = legacy_tags

    if not image_path or not os.path.exists(image_path):
        print(json.dumps({"error": f"Image not found: {image_path}"}))
        sys.exit(1)

    if not labels:
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

    # ── Encode image and prompts ──────────────────────────────────────────────
    # Use descriptive prompts for CLIP inference (much better zero-shot accuracy
    # than short labels). Return original labels in output.
    try:
        with torch.no_grad():
            image_features = model.encode_image(image_tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            # CLIP tokenizer has a max of 77 tokens — truncate long prompts
            text_inputs = clip.tokenize(prompts, truncate=True).to(device)
            text_features = model.encode_text(text_inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            # Cosine similarity, then softmax so all scores sum to 1
            similarity = (image_features @ text_features.T).squeeze(0)
            scores = similarity.softmax(dim=-1).cpu().tolist()

    except Exception as e:
        print(json.dumps({"error": f"CLIP inference failed: {e}"}))
        sys.exit(1)

    # ── Rank and filter by threshold ──────────────────────────────────────────
    # Pair labels (not prompts) with scores, sort descending
    tag_scores = sorted(zip(labels, scores), key=lambda x: x[1], reverse=True)

    # Apply threshold — only include tags with meaningful confidence
    # Uniform distribution across N tags ≈ 1/N, so threshold > 1/N means
    # "better than random guessing"
    uniform_baseline = 1.0 / len(labels)
    effective_threshold = max(threshold, uniform_baseline * 1.2)  # at least 20% above baseline

    above_threshold = [(tag, score) for tag, score in tag_scores if score >= effective_threshold]

    # Return up to top_k; if fewer pass threshold, return those (could be 0)
    selected = above_threshold[:top_k]

    result_tags   = [tag for tag, _ in selected]
    result_scores = {tag: round(score, 6) for tag, score in selected}

    print(json.dumps({
        "tags":      result_tags,
        "scores":    result_scores,
        "device":    device,
        "threshold": round(effective_threshold, 6),
        "total_candidates": len(labels),
    }))


if __name__ == "__main__":
    main()
