#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MindVault — Build CLIP Bundle (run once before "npm run dist")
#
# Creates:
#   backend/clip-env/     → Python venv with PyTorch + CLIP + sentence-transformers
#   backend/clip-models/  → Pre-downloaded model weights (ViT-B/32 + MiniLM)
#
# Both folders are automatically included in the DMG by electron-builder
# (backend/**/* extraResources rule). No separate install step for users.
#
# Usage:
#   bash backend/scripts/build-clip-bundle.sh
#   npm run dist
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$BACKEND_DIR/clip-env"
MODELS_DIR="$BACKEND_DIR/clip-models"

echo ""
echo "🧠 MindVault — CLIP Bundle Builder"
echo "────────────────────────────────────"
echo "  clip-env:    $VENV_DIR"
echo "  clip-models: $MODELS_DIR"
echo ""

# ── Find Python 3 ─────────────────────────────────────────────────────────────
PYTHON=""
for cmd in /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if command -v "$cmd" &>/dev/null; then
    VER=$("$cmd" -c "import sys; print(sys.version_info.major)" 2>/dev/null)
    if [ "$VER" = "3" ]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "❌ Python 3 not found. Install via: brew install python"
  exit 1
fi

echo "✅ Python: $PYTHON ($($PYTHON --version))"

# ── Create venv ────────────────────────────────────────────────────────────────
echo ""
echo "📁 Creating virtual environment…"
rm -rf "$VENV_DIR"
"$PYTHON" -m venv "$VENV_DIR"
VENV_PYTHON="$VENV_DIR/bin/python3"
echo "   ✅ venv at $VENV_DIR"

# ── Install PyTorch ────────────────────────────────────────────────────────────
echo ""
echo "📦 Installing PyTorch (~500 MB)…"
"$VENV_PYTHON" -m pip install --upgrade pip --quiet
"$VENV_PYTHON" -m pip install torch torchvision --quiet 2>&1 | tail -3
echo "   ✅ PyTorch installed"

# ── Install OpenAI CLIP ────────────────────────────────────────────────────────
echo ""
echo "📦 Installing OpenAI CLIP…"
"$VENV_PYTHON" -m pip install \
  "git+https://github.com/openai/CLIP.git" \
  Pillow ftfy regex tqdm \
  --quiet 2>&1 | tail -3
echo "   ✅ CLIP installed"

# ── Install sentence-transformers ──────────────────────────────────────────────
echo ""
echo "📦 Installing sentence-transformers (~90 MB)…"
"$VENV_PYTHON" -m pip install sentence-transformers --quiet 2>&1 | tail -3
echo "   ✅ sentence-transformers installed"

# ── Prune unnecessary packages (not needed for inference) ─────────────────────
# These get pulled in as transitive deps but are only needed for training/math.
# Removing them reduces clip-env size by ~140 MB without breaking CLIP or embeddings.
echo ""
echo "🧹 Pruning unused packages to reduce bundle size…"
"$VENV_PYTHON" -m pip uninstall -y sympy networkx 2>/dev/null || true
echo "   ✅ Pruned: sympy, networkx"

# Remove __pycache__, test dirs, and dist-info to further reduce size
find "$VENV_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$VENV_DIR" -type d -name "tests" -path "*/site-packages/*" -exec rm -rf {} + 2>/dev/null || true
find "$VENV_DIR" -name "*.pyc" -delete 2>/dev/null || true
echo "   ✅ Removed __pycache__ and .pyc files"

# ── Pre-download model weights into clip-models/ (optional, skipped in CI) ───
# Models are NOT bundled in the DMG (too large, ~425 MB) — they download to
# ~/.cache/clip/ and ~/.cache/huggingface/ on first use automatically.
# This step is kept here to verify the download works, but the models dir
# is excluded from extraResources in package.json.
echo ""
echo "📥 Pre-downloading model weights (verify only — NOT included in DMG)…"
mkdir -p "$MODELS_DIR"

"$VENV_PYTHON" - <<PYDOWNLOAD
import os, sys
os.environ['TRANSFORMERS_OFFLINE'] = '0'

models_dir = "$MODELS_DIR"

# ── CLIP model (ViT-B/32, ~350 MB) ──
import clip, torch
device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"  Downloading CLIP ViT-B/32 to {models_dir}…")
model, _ = clip.load("ViT-B/32", device=device, download_root=models_dir)
print(f"  ✅ CLIP model ready (device: {device})")

# ── Sentence-transformers model (~90 MB) ──
from sentence_transformers import SentenceTransformer
print(f"  Downloading all-MiniLM-L6-v2 to {models_dir}…")
st = SentenceTransformer("all-MiniLM-L6-v2", cache_folder=models_dir)
test = st.encode("test", normalize_embeddings=True)
print(f"  ✅ Embedding model ready (dims: {len(test)})")
PYDOWNLOAD

# ── Verify ─────────────────────────────────────────────────────────────────────
echo ""
echo "🔍 Verifying bundle…"
"$VENV_PYTHON" - <<PYCHECK
import clip, torch
from sentence_transformers import SentenceTransformer
from PIL import Image
import os, sys

# Verify against locally pre-downloaded models (same download_root as at runtime)
models_dir = "$MODELS_DIR"

device = "mps" if torch.backends.mps.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device, download_root=models_dir)
st = SentenceTransformer("all-MiniLM-L6-v2", cache_folder=models_dir)

print(f"  clip:                  ✅  (device: {device})")
print(f"  sentence-transformers: ✅")
print(f"  torch:                 {torch.__version__}")
mps = torch.backends.mps.is_available()
print(f"  Apple Silicon MPS:     {'✅ fast!' if mps else '⚠️  CPU mode'}")
PYCHECK

# ── Summary ───────────────────────────────────────────────────────────────────
VENV_SIZE=$(du -sh "$VENV_DIR" 2>/dev/null | cut -f1 || echo "?")
MODEL_SIZE=$(du -sh "$MODELS_DIR" 2>/dev/null | cut -f1 || echo "?")

echo ""
echo "────────────────────────────────────────────────────────────"
echo "✅  CLIP bundle ready for distribution!"
echo ""
echo "   clip-env/    $VENV_SIZE  → bundled in DMG (Python + PyTorch + CLIP)"
echo "   clip-models/ $MODEL_SIZE → NOT in DMG (downloads to ~/.cache on first use)"
echo ""
echo "   App size estimate: clip-env + existing app (~500 MB total)"
echo ""
echo "   Next step: npm run dist"
echo "────────────────────────────────────────────────────────────"
echo ""
