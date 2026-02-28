#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MindVault CLIP Setup
# Installs Python + CLIP into a dedicated venv so MindVault always finds it,
# whether running in dev mode or as an installed .app.
#
# Venv location: ~/Library/Application Support/MindVault/clip-env/
# Run once: bash backend/scripts/setup-clip.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

VENV_DIR="$HOME/Library/Application Support/MindVault/clip-env"

echo ""
echo "🧠 MindVault — CLIP Local AI Setup"
echo "────────────────────────────────────"
echo "  Installing to: $VENV_DIR"
echo ""

# ── Check Python ──────────────────────────────────────────────────────────────
PYTHON=""
for cmd in /opt/homebrew/bin/python3 python3 python; do
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

echo "✅ Python found: $PYTHON ($($PYTHON --version))"

# ── Create venv ───────────────────────────────────────────────────────────────
echo ""
echo "📁 Creating virtual environment…"
"$PYTHON" -m venv "$VENV_DIR"
VENV_PYTHON="$VENV_DIR/bin/python3"
echo "  ✅ venv created at: $VENV_DIR"

# ── Install PyTorch (CPU/MPS — no CUDA needed on Mac) ────────────────────────
echo ""
echo "📦 Installing PyTorch (~500 MB, once only)…"
"$VENV_PYTHON" -m pip install --upgrade pip --quiet
"$VENV_PYTHON" -m pip install torch torchvision --quiet 2>&1 | tail -5

# ── Install CLIP ──────────────────────────────────────────────────────────────
echo ""
echo "📦 Installing OpenAI CLIP…"
"$VENV_PYTHON" -m pip install \
  "git+https://github.com/openai/CLIP.git" \
  Pillow \
  ftfy \
  regex \
  tqdm \
  --quiet 2>&1 | tail -5

# ── Verify ────────────────────────────────────────────────────────────────────
echo ""
echo "🔍 Verifying installation…"
"$VENV_PYTHON" - << 'PYCHECK'
import clip, torch
from PIL import Image
print(f"  clip:  ✅")
print(f"  torch: {torch.__version__}")
mps = torch.backends.mps.is_available()
print(f"  Apple Silicon (MPS): {'✅ enabled — fast!' if mps else '⚠️  not available (CPU mode)'}")
PYCHECK

# ── Pre-download model ────────────────────────────────────────────────────────
echo ""
echo "📥 Pre-loading CLIP model ViT-B/32 (~350 MB, cached after this)…"
"$VENV_PYTHON" - << 'PYDOWNLOAD'
import clip, torch
device = "mps" if torch.backends.mps.is_available() else "cpu"
model, _ = clip.load("ViT-B/32", device=device)
print(f"  Model ready on: {device}")
print(f"  Cached at: ~/.cache/clip/")
PYDOWNLOAD

echo ""
echo "────────────────────────────────────────────────────────────"
echo "✅ CLIP setup complete!"
echo ""
echo "   Venv: $VENV_DIR"
echo "   The app will automatically use this Python for AI tagging."
echo ""
echo "   Enable in MindVault → Settings → AI Tagging → Local AI"
echo "────────────────────────────────────────────────────────────"
echo ""
