#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MindVault Whisper Setup
# Installs OpenAI Whisper into the existing clip-env venv so Mind-space videos
# are automatically transcribed after download.
#
# Whisper runs 100% locally — no API key, no internet connection required.
# Uses the same clip-env venv as CLIP:
#   ~/Library/Application Support/MindVault/clip-env/
#
# Prerequisite: run setup-clip.sh first (creates the venv + PyTorch).
# Run once: bash backend/scripts/setup-whisper.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

VENV_DIR="$HOME/Library/Application Support/MindVault/clip-env"
VENV_PYTHON="$VENV_DIR/bin/python3"

echo ""
echo "🎙️  MindVault — Whisper Local Transcription Setup"
echo "──────────────────────────────────────────────────"
echo "  Installing to: $VENV_DIR"
echo ""

# ── Check venv exists ─────────────────────────────────────────────────────────
if [ ! -f "$VENV_PYTHON" ]; then
  echo "❌ clip-env not found at: $VENV_DIR"
  echo "   Please run setup-clip.sh first to create the Python environment."
  exit 1
fi

echo "✅ clip-env found: $VENV_PYTHON"

# ── Install Whisper ───────────────────────────────────────────────────────────
echo ""
echo "📦 Installing OpenAI Whisper (~140 MB)…"
"$VENV_PYTHON" -m pip install --upgrade pip --quiet
"$VENV_PYTHON" -m pip install \
  openai-whisper \
  --quiet 2>&1 | tail -5

# ── Verify ────────────────────────────────────────────────────────────────────
echo ""
echo "🔍 Verifying installation…"
"$VENV_PYTHON" - << 'PYCHECK'
import whisper
print("  whisper: ✅")
print(f"  version: {whisper.__version__}")
PYCHECK

# ── Pre-download base model ───────────────────────────────────────────────────
echo ""
echo "📥 Pre-loading Whisper 'base' model (~140 MB, cached after this)…"
echo "   (Transcribes ~32x real-time on Apple Silicon)"
"$VENV_PYTHON" - << 'PYDOWNLOAD'
import whisper
model = whisper.load_model("base")
print("  Model 'base' loaded ✅")
print("  Cached at: ~/.cache/whisper/")
PYDOWNLOAD

echo ""
echo "──────────────────────────────────────────────────────────────────"
echo "✅ Whisper setup complete!"
echo ""
echo "   Venv:  $VENV_DIR"
echo "   Model: base (140 MB, good balance of speed vs accuracy)"
echo ""
echo "   How it works:"
echo "   - Save a video to a Mind link and click Download"
echo "   - MindVault auto-transcribes the audio after download"
echo "   - Transcript is stored as the link's note"
echo "   - AI tagging uses the transcript for smarter tags"
echo ""
echo "   Optional: install larger models for better accuracy:"
echo "   pip install --upgrade openai-whisper   (already done)"
echo "   Then change model in MindVault settings (coming soon)"
echo "──────────────────────────────────────────────────────────────────"
echo ""
