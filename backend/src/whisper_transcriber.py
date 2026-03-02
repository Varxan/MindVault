#!/usr/bin/env python3
"""
MindVault Whisper Transcriber
Transcribes audio/video files using OpenAI Whisper (local, offline, MIT license).
Called as a subprocess by whisper.js — takes JSON input via argv[1], outputs JSON to stdout.
"""

import sys
import json
import os


def transcribe(media_path, model_name='base', language=None):
    import whisper

    model = whisper.load_model(model_name)

    options = {}
    if language:
        options['language'] = language

    result = model.transcribe(media_path, **options, verbose=False)

    text = result.get('text', '').strip()
    detected_language = result.get('language', 'unknown')

    # Estimate duration from segments if available
    segments = result.get('segments', [])
    duration = segments[-1]['end'] if segments else None

    return {
        'transcript': text,
        'language':   detected_language,
        'duration':   round(duration, 1) if duration else None,
        'segments':   len(segments),
    }


if __name__ == '__main__':
    try:
        if len(sys.argv) < 2:
            print(json.dumps({'error': 'No input provided'}))
            sys.exit(1)

        data       = json.loads(sys.argv[1])
        media_path = data.get('mediaPath', '')
        model_name = data.get('model', 'base')
        language   = data.get('language', None)

        if not media_path:
            print(json.dumps({'error': 'mediaPath is required'}))
            sys.exit(1)

        if not os.path.exists(media_path):
            print(json.dumps({'error': f'File not found: {media_path}'}))
            sys.exit(1)

        result = transcribe(media_path, model_name, language)
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
