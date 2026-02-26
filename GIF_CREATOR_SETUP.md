# MindVault GIF Creator Feature

## What's New 🎬→🎞️

The GIF Creator feature allows you to create animated GIFs directly from saved videos with in/out point selection.

## Features

✨ **Interactive Timeline** - Click or drag to set precise in/out points
⏱️ **Time Controls** - Numeric input for exact frame selection
🎚️ **Quality Settings** - Control FPS (1-30) and output width (100-1280px)
💾 **Multiple GIFs** - Create multiple GIFs from the same video
📥 **Download** - Direct download links for all created GIFs
🗑️ **Management** - Delete GIFs you no longer need

## How to Use

### 1. Download a Video
- Click the download button (⬇️) on any Instagram, YouTube, Vimeo, or TikTok link
- Wait for the download to complete (shows 📂 icon when done)

### 2. Create a GIF
- Click the GIF Creator button (🎬→🎞️) on downloaded videos
- The modal opens with the video player and timeline

### 3. Set In/Out Points
**Option A: Drag the Timeline Markers**
- Blue markers on the timeline represent start and end points
- Click and drag to adjust

**Option B: Click Timeline**
- Click anywhere on the timeline to play from that position
- Adjust using the numeric inputs below

**Option C: Type Times Directly**
- Use the "Start" and "Ende" input fields
- Type seconds with decimal precision (e.g., 2.5)

### 4. Configure GIF Settings
- **FPS**: Frames per second (higher = smoother but larger file)
  - Recommended: 10-15 for smooth animation
- **Width**: Output width in pixels
  - Recommended: 480 for web, 1280 for high quality

### 5. Create and Download
- Click "✨ GIF erstellen" to create the GIF
- Monitor the progress (shows "⏳ Erstelle GIF..." while processing)
- Once ready, your GIF appears in the list below
- Click the filename to download directly

## Technical Details

### Backend Implementation

**New Files:**
- `backend/src/gif-creator.js` - GIF creation module using ffmpeg

**New API Endpoints:**
- `GET /api/links/:id/video-info` - Get video duration and GIF list
- `POST /api/links/:id/create-gif` - Create GIF from video segment
- `DELETE /api/gifs/:filename` - Delete a GIF

**Static File Serving:**
- `/api/files/gifs/` - Serves created GIFs

### Frontend Implementation

**New Components:**
- `GifCreatorModal.js` - Main GIF creator interface
- `GifCreatorModal.module.css` - Styling

**Updated Components:**
- `LinkCard.js` - Added GIF creator button for downloaded videos

### GIF Quality & Performance

**Palette Generation:**
The system uses ffmpeg's palette generation for optimal GIF quality:
1. Extracts video frames at specified FPS
2. Generates a custom color palette (max 256 colors)
3. Creates GIF using palette with Sierra2-4a dithering

**Maximum Duration:** 120 seconds (to prevent huge file sizes)

**File Size Examples:**
- 5s @ 10 FPS, 480px: ~500KB - 2MB
- 10s @ 15 FPS, 720px: ~2MB - 5MB
- 30s @ 10 FPS, 480px: ~2MB - 8MB

## Dependencies

### Required

- `ffmpeg` - Video frame extraction and GIF creation
- `ffprobe` - Video duration detection

### Installation

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Verify
ffmpeg -version
ffprobe -version
```

## Troubleshooting

### GIF Creation Fails
1. Ensure ffmpeg is installed: `which ffmpeg`
2. Check video file exists: Files downloaded to `backend/data/media/`
3. Check duration limit: GIFs must be ≤ 120 seconds

### GIF is Too Large
- Reduce FPS (use 8-10 instead of 15-20)
- Reduce width (use 360 or 480 instead of 720+)
- Reduce duration (shorter segments = smaller GIFs)

### Timeline Not Working
- Ensure video has fully loaded in player
- Try numeric time input instead of dragging

### Video Not Showing in Creator
- Ensure video is fully downloaded (📂 icon visible)
- Try refreshing the page
- Check browser console for errors

## Performance Tips

1. **For Smooth Animation:** Use 12-15 FPS
2. **For Smaller File:** Use 8-10 FPS
3. **For Web:** Use 480px width
4. **For Social Media:** Create 5-15 second GIFs
5. **Batch Processing:** Create multiple GIFs in sequence

## API Reference

### Create GIF

```bash
POST /api/links/{linkId}/create-gif
Content-Type: application/json

{
  "startTime": 2.5,
  "endTime": 7.5,
  "fps": 10,
  "width": 480
}
```

Response:
```json
{
  "message": "GIF erfolgreich erstellt",
  "gif": {
    "filename": "gif-1708253456789.gif",
    "gifUrl": "/api/files/gifs/gif-1708253456789.gif",
    "size": 1245632,
    "duration": 5
  }
}
```

### Get Video Info

```bash
GET /api/links/{linkId}/video-info
```

Response:
```json
{
  "hasVideo": true,
  "videoDuration": 125.5,
  "gifs": [
    {
      "filename": "gif-1708253456789.gif",
      "gifUrl": "/api/files/gifs/gif-1708253456789.gif",
      "size": 1245632
    }
  ]
}
```

### Delete GIF

```bash
DELETE /api/gifs/{filename}
```

## Next Steps

Future enhancements could include:
- Video preview during GIF creation
- Batch GIF creation from templates
- GIF effects (speed, reverse, filters)
- Automatic quality optimization
- Direct social media sharing
