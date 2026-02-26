#!/bin/bash

# ╔══════════════════════════════════════════════════════════╗
# ║        MindVault — All-in-One Installer (Mac/Linux)     ║
# ╚══════════════════════════════════════════════════════════╝

# Colors
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
ORANGE='\033[0;33m'
NC='\033[0m'

OK="${GREEN}✓${NC}"
WARN="${YELLOW}⚠${NC}"
FAIL="${RED}✗${NC}"
AR="${ORANGE}→${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Detect OS
IS_MAC=false
IS_LINUX=false
if [[ "$OSTYPE" == "darwin"* ]]; then
    IS_MAC=true
elif [[ "$OSTYPE" == "linux"* ]]; then
    IS_LINUX=true
fi

clear
echo ""
echo -e "${ORANGE}${BOLD}  ╔══════════════════════════════════════════╗${NC}"
echo -e "${ORANGE}${BOLD}  ║       🧠 MindVault — Full Installer      ║${NC}"
echo -e "${ORANGE}${BOLD}  ╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${DIM}Installiert automatisch alles was du brauchst:${NC}"
echo -e "  ${DIM}Homebrew, Node.js, yt-dlp, ffmpeg & MindVault${NC}"
echo ""
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo ""

TOTAL_STEPS=5
CURRENT=0

progress() {
    CURRENT=$((CURRENT + 1))
    echo ""
    echo -e "${CYAN}${BOLD}  [$CURRENT/$TOTAL_STEPS]${NC} $1"
    echo ""
}

# ═══════════════════════════════════════════════════════════
# STEP 1: Homebrew (Mac only)
# ═══════════════════════════════════════════════════════════
progress "Paketmanager"

if [ "$IS_MAC" = true ]; then
    if command -v brew &> /dev/null; then
        BREW_VERSION=$(brew --version | head -1)
        echo -e "  $OK Homebrew bereits installiert ${DIM}($BREW_VERSION)${NC}"
    else
        echo -e "  $AR Homebrew wird installiert..."
        echo -e "  ${DIM}(Dies kann 1-2 Minuten dauern)${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null

        # Add brew to PATH for Apple Silicon Macs
        if [[ $(uname -m) == "arm64" ]]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi

        if command -v brew &> /dev/null; then
            echo -e "  $OK Homebrew installiert"
        else
            echo -e "  $FAIL Homebrew Installation fehlgeschlagen"
            echo -e "  ${DIM}Manuell installieren: https://brew.sh${NC}"
            exit 1
        fi
    fi
elif [ "$IS_LINUX" = true ]; then
    if command -v apt-get &> /dev/null; then
        echo -e "  $OK apt Paketmanager gefunden (Debian/Ubuntu)"
        PKG_MANAGER="apt"
    elif command -v dnf &> /dev/null; then
        echo -e "  $OK dnf Paketmanager gefunden (Fedora/RHEL)"
        PKG_MANAGER="dnf"
    elif command -v pacman &> /dev/null; then
        echo -e "  $OK pacman Paketmanager gefunden (Arch)"
        PKG_MANAGER="pacman"
    else
        echo -e "  $WARN Kein bekannter Paketmanager gefunden"
        PKG_MANAGER="none"
    fi
fi

# ═══════════════════════════════════════════════════════════
# STEP 2: Node.js
# ═══════════════════════════════════════════════════════════
progress "Node.js"

install_node() {
    if [ "$IS_MAC" = true ]; then
        echo -e "  $AR Node.js wird via Homebrew installiert..."
        brew install node 2>&1 | tail -1
    elif [ "$IS_LINUX" = true ]; then
        echo -e "  $AR Node.js wird installiert..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            # Use NodeSource for latest LTS
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - 2>/dev/null
            sudo apt-get install -y nodejs 2>&1 | tail -1
        elif [ "$PKG_MANAGER" = "dnf" ]; then
            sudo dnf install -y nodejs 2>&1 | tail -1
        elif [ "$PKG_MANAGER" = "pacman" ]; then
            sudo pacman -S --noconfirm nodejs npm 2>&1 | tail -1
        fi
    fi
}

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "  $OK Node.js ${NODE_VERSION} ${DIM}(OK)${NC}"
    else
        echo -e "  $WARN Node.js ${NODE_VERSION} ist veraltet (v18+ benötigt)"
        install_node
    fi
else
    install_node
    if command -v node &> /dev/null; then
        echo -e "  $OK Node.js $(node -v) installiert"
    else
        echo -e "  $FAIL Node.js konnte nicht installiert werden"
        echo -e "  ${DIM}Manuell installieren: https://nodejs.org${NC}"
        exit 1
    fi
fi

# Verify npm
if command -v npm &> /dev/null; then
    echo -e "  $OK npm $(npm -v)"
else
    echo -e "  $FAIL npm nicht gefunden"
    exit 1
fi

# ═══════════════════════════════════════════════════════════
# STEP 3: Media Tools (yt-dlp + ffmpeg)
# ═══════════════════════════════════════════════════════════
progress "Media Tools (yt-dlp + ffmpeg)"

# ── yt-dlp ──
if command -v yt-dlp &> /dev/null; then
    echo -e "  $OK yt-dlp $(yt-dlp --version 2>/dev/null || echo 'installiert')"
else
    echo -e "  $AR yt-dlp wird installiert..."
    if [ "$IS_MAC" = true ]; then
        brew install yt-dlp 2>&1 | tail -1
    elif [ "$IS_LINUX" = true ]; then
        if command -v pip3 &> /dev/null; then
            pip3 install yt-dlp 2>&1 | tail -1
        elif [ "$PKG_MANAGER" = "apt" ]; then
            sudo apt-get install -y yt-dlp 2>&1 | tail -1
        fi
    fi

    if command -v yt-dlp &> /dev/null; then
        echo -e "  $OK yt-dlp installiert"
    else
        echo -e "  $WARN yt-dlp konnte nicht automatisch installiert werden"
        echo -e "  ${DIM}  Manuell: https://github.com/yt-dlp/yt-dlp#installation${NC}"
    fi
fi

# ── ffmpeg ──
if command -v ffmpeg &> /dev/null; then
    echo -e "  $OK ffmpeg installiert"
else
    echo -e "  $AR ffmpeg wird installiert..."
    if [ "$IS_MAC" = true ]; then
        brew install ffmpeg 2>&1 | tail -1
    elif [ "$IS_LINUX" = true ]; then
        if [ "$PKG_MANAGER" = "apt" ]; then
            sudo apt-get install -y ffmpeg 2>&1 | tail -1
        elif [ "$PKG_MANAGER" = "dnf" ]; then
            sudo dnf install -y ffmpeg 2>&1 | tail -1
        elif [ "$PKG_MANAGER" = "pacman" ]; then
            sudo pacman -S --noconfirm ffmpeg 2>&1 | tail -1
        fi
    fi

    if command -v ffmpeg &> /dev/null; then
        echo -e "  $OK ffmpeg installiert"
    else
        echo -e "  $WARN ffmpeg konnte nicht automatisch installiert werden"
        echo -e "  ${DIM}  Manuell: https://ffmpeg.org/download.html${NC}"
    fi
fi

# ═══════════════════════════════════════════════════════════
# STEP 4: MindVault Dependencies
# ═══════════════════════════════════════════════════════════
progress "MindVault einrichten"

echo -e "  $AR Backend-Pakete installieren..."
cd "$BACKEND_DIR"
npm install --loglevel=error 2>&1 | while IFS= read -r line; do echo "    $line"; done
echo -e "  $OK Backend bereit"

echo ""
echo -e "  $AR Frontend-Pakete installieren..."
cd "$FRONTEND_DIR"
npm install --loglevel=error 2>&1 | while IFS= read -r line; do echo "    $line"; done
echo -e "  $OK Frontend bereit"

echo ""
echo -e "  $AR Frontend wird gebaut..."
npm run build --loglevel=error 2>&1 | while IFS= read -r line; do echo "    $line"; done
echo -e "  $OK Frontend gebaut"

# Make start.sh executable
chmod +x "$SCRIPT_DIR/start.sh" 2>/dev/null

# ═══════════════════════════════════════════════════════════
# STEP 5: Summary
# ═══════════════════════════════════════════════════════════
progress "Zusammenfassung"

echo -e "  ${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo -e "  ${GREEN}${BOLD}  ✓ MindVault ist bereit!${NC}"
echo -e "  ${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo ""

# Status overview
echo -e "  ${BOLD}Installiert:${NC}"
command -v node &> /dev/null && echo -e "  $OK Node.js $(node -v)" || echo -e "  $FAIL Node.js"
command -v npm &> /dev/null && echo -e "  $OK npm $(npm -v)" || echo -e "  $FAIL npm"
command -v yt-dlp &> /dev/null && echo -e "  $OK yt-dlp" || echo -e "  $WARN yt-dlp (nicht installiert)"
command -v ffmpeg &> /dev/null && echo -e "  $OK ffmpeg" || echo -e "  $WARN ffmpeg (nicht installiert)"
echo -e "  $OK MindVault Backend"
echo -e "  $OK MindVault Frontend"
echo ""

echo -e "  ${BOLD}Nächste Schritte:${NC}"
echo ""
echo -e "  ${CYAN}1.${NC} MindVault starten:"
echo -e "     ${CYAN}./start.sh${NC}"
echo ""
echo -e "  ${CYAN}2.${NC} Im Browser öffnen:"
echo -e "     ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "  ${CYAN}3.${NC} Telegram Bot & AI einrichten:"
echo -e "     ${CYAN}Öffne setup-guide.html${NC} im Browser"
echo ""
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo ""

# Ask to start now
read -p "  MindVault jetzt starten? (j/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Jj]$ ]]; then
    echo ""
    echo -e "  $AR MindVault wird gestartet..."

    # Open setup guide in browser
    if [ "$IS_MAC" = true ]; then
        open "$SCRIPT_DIR/setup-guide.html" 2>/dev/null &
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$SCRIPT_DIR/setup-guide.html" 2>/dev/null &
    fi

    # Start MindVault
    cd "$SCRIPT_DIR"
    exec ./start.sh
fi

echo ""
