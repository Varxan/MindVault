#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MindVault CLIP Setup
# Installs Python dependencies for local AI tagging via OpenAI CLIP.
# Run once: bash backend/scripts/setup-clip.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "🧠 MindVault — CLIP Local AI Setup"
echo "────────────────────────────────────"
echo ""

# ── Check Python ──────────────────────────────────────────────────────────────
PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    VER=$("$cmd" -c "import sys; print(sys.version_info.major)" 2>/dev/null)
    if [ "$VER" = "3" ]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "❌ Python 3 not found."
  echo "   Install it via: brew install python"
  exit 1
fi

echo "✅ Python: $($PYTHON --version)"

# ── Check pip ─────────────────────────────────────────────────────────────────
if ! $PYTHON -m pip --version &>/dev/null; then
  echo "❌ pip not found. Install Python via brew: brew install python"
  exit 1
fi

# ── Install torch (CPU/MPS — no CUDA needed on Mac) ──────────────────────────
echo ""
echo "📦 Installing PyTorch…"
$PYTHON -m pip install torch torchvision --quiet \
  --index-url https://download.pytorch.org/whl/cpu 2>&1 | tail -3

# ── Install CLIP ──────────────────────────────────────────────────────────────
echo ""
echo "📦 Installing OpenAI CLIP…"
$PYTHON -m pip install \
  "git+https://github.com/openai/CLIP.git" \
  Pillow \
  ftfy \
  regex \
  tqdm \
  --quiet 2>&1 | tail -3

# ── Verify ────────────────────────────────────────────────────────────────────
echo ""
echo "🔍 Verifying installation…"
$PYTHON - << 'PYCHECK'
import clip, torch
from PIL import Image
print(f"  clip: OK")
print(f"  torch: {torch.__version__}")
mps = torch.backends.mps.is_available()
print(f"  Apple Silicon (MPS): {'✅ enabled' if mps else '❌ not available'}")
PYCHECK

# ── Pre-download model ────────────────────────────────────────────────────────
echo ""
echo "📥 Downloading CLIP model ViT-B/32 (~350 MB, once only)…"
$PYTHON - << 'PYDOWNLOAD'
import clip, torch
device = "mps" if torch.backends.mps.is_available() else "cpu"
model, _ = clip.load("ViT-B/32", device=device)
print(f"  Model loaded on: {device}")
print(f"  Cached at: ~/.cache/clip/")
PYDOWNLOAD

echo ""
echo "────────────────────────────────────"
echo "✅ CLIP setup complete!"
echo "   Enable it in MindVault → Settings → AI → Use Local AI (CLIP)"
echo ""
