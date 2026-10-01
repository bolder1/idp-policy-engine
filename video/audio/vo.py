"""
Voice-over — every spoken line of the film, synthesised once and cached.

  python vo.py <lines.json> <outDir> [--voice en-IN-PrabhatNeural] [--rate=+6%]
                                     [--pitch=+10Hz] [--ffmpeg <path>]

lines.json is {"id": "text", ...}. For every id the folder ends up holding

  <id>.mp3   what the service sent (24 kHz, 48 kbps CBR)
  <id>.wav   the same as 48 kHz mono 16-bit — what the audio pass places
  <id>.json  { id, text, hash, voice, rate, pitch, duration,
               words: [{ t, dur, text }], env: [...] }

`words` are the service's WordBoundary events in seconds from the start of the
wav (the cloud reveals them as they are said). `env` is an RMS envelope in
windows of exactly one output frame (30 Hz), 0..1 with the 95th percentile at 1
— the mascot's mouth follows it.

A line is skipped when its .json carries the same sha1 of text|voice|rate|pitch
and its wav is still there, so editing one line re-speaks one line. A failed
synthesis is retried three times with backoff; if a line still fails the run
stops with one `vo: ...` line on stderr and a non-zero exit — lib/vo.mjs
surfaces that line as the error.

Write negative values with '=' (`--rate=-4%`), or argparse reads them as flags.
"""
import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import wave
from array import array

import edge_tts

TICKS = 10_000_000  # WordBoundary offset/duration arrive in 100-ns ticks
RATE = 48_000
ENV_HZ = 30  # one envelope value per output frame
ATTEMPTS = 3
ID_OK = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')


class Failure(Exception):
    """Something that should stop the run, in one line."""


def line_hash(text, voice, rate, pitch):
    return hashlib.sha1(f'{text}|{voice}|{rate}|{pitch}'.encode('utf-8')).hexdigest()


def cached(meta_file, wav_file, h):
    if not (os.path.exists(meta_file) and os.path.exists(wav_file)):
        return False
    try:
        with open(meta_file, encoding='utf-8') as f:
            return json.load(f).get('hash') == h
    except (OSError, ValueError):
        return False


async def synthesise(text, voice, rate, pitch):
    """One request: the mp3 bytes and the word boundaries the service sent.

    `boundary='WordBoundary'` matters — 7.x defaults to sentence boundaries,
    which would give one event per line and nothing for the cloud to reveal."""
    tts = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary='WordBoundary')
    audio = bytearray()
    words = []
    async for chunk in tts.stream():
        if chunk['type'] == 'audio':
            audio += chunk['data']
        elif chunk['type'] == 'WordBoundary':
            words.append({
                't': round(chunk['offset'] / TICKS, 3),
                'dur': round(chunk['duration'] / TICKS, 3),
                'text': chunk['text'],
            })
    if not audio:
        raise RuntimeError('no audio received')
    return bytes(audio), words


async def synthesise_with_retry(line_id, text, voice, rate, pitch):
    last = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return await synthesise(text, voice, rate, pitch)
        except Exception as e:  # network, the service's clock check, a dropped socket — all worth another go
            last = e
            if attempt < ATTEMPTS:
                await asyncio.sleep(1.5 * 2 ** (attempt - 1))
    why = str(last).strip().splitlines()[0] if str(last).strip() else ''
    raise Failure(f'"{line_id}" failed after {ATTEMPTS} attempts: {type(last).__name__}{": " + why if why else ""}')


def find_ffmpeg(given):
    """A path is made absolute (CreateProcess will not search a relative one
    with forward slashes); a bare name is looked up on PATH. Checked once, up
    front, so a missing binary is one clear line and not a failure after the
    first line has already been spoken."""
    if '/' in given or os.sep in given:
        p = os.path.abspath(given)
        if not os.path.isfile(p):
            raise Failure(f'ffmpeg not found at {p}')
        return p
    p = shutil.which(given)
    if not p:
        raise Failure(f'ffmpeg not found on PATH ({given}); pass --ffmpeg <path>')
    return p


def to_wav(ffmpeg, mp3, wav):
    r = subprocess.run(
        [ffmpeg, '-y', '-loglevel', 'error', '-i', mp3, '-ar', str(RATE), '-ac', '1', '-c:a', 'pcm_s16le', wav],
        capture_output=True, text=True, encoding='utf-8', errors='replace',
    )
    if r.returncode != 0:
        err = r.stderr.strip().splitlines()
        raise Failure(f'ffmpeg failed on {os.path.basename(mp3)}: {err[-1] if err else "exit " + str(r.returncode)}')


def read_wav(file):
    with wave.open(file, 'rb') as w:
        ch, sw, rate, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if (ch, sw, rate) != (1, 2, RATE):
        raise Failure(f'{os.path.basename(file)} is {ch}ch {sw * 8}-bit {rate} Hz, expected mono 16-bit {RATE} Hz')
    samples = array('h')
    samples.frombytes(raw)
    if sys.byteorder == 'big':
        samples.byteswap()
    return samples


def envelope(samples):
    """RMS per output frame, 0..1.

    Normalised to the 95th percentile rather than the peak: one plosive would
    otherwise pin the rest of the line's mouth half-shut. The rare louder
    windows clip to 1."""
    win = RATE // ENV_HZ
    n = math.ceil(len(samples) / win)
    dot = getattr(math, 'sumprod', None) or (lambda a, b: sum(x * y for x, y in zip(a, b)))
    rms = []
    for i in range(n):
        seg = samples[i * win:(i + 1) * win]
        rms.append(math.sqrt(dot(seg, seg) / len(seg)) / 32768)
    if not rms:
        return []
    ranked = sorted(rms)
    p95 = ranked[min(n - 1, math.ceil(0.95 * n) - 1)]
    if p95 <= 0:
        return [0.0] * n
    return [round(min(1.0, v / p95), 3) for v in rms]


async def run(args):
    with open(args.lines, encoding='utf-8') as f:
        lines = json.load(f)
    if not isinstance(lines, dict):
        raise Failure(f'{args.lines} must be an object of id → text')
    args.ffmpeg = find_ffmpeg(args.ffmpeg)
    os.makedirs(args.out, exist_ok=True)
    spoken = kept = 0
    t0 = time.time()
    for line_id, text in lines.items():
        if not ID_OK.match(line_id):
            raise Failure(f'line id "{line_id}" is not a safe file name')
        if not isinstance(text, str) or not text.strip():
            raise Failure(f'line "{line_id}" has no text')
        base = os.path.join(args.out, line_id)
        h = line_hash(text, args.voice, args.rate, args.pitch)
        if cached(base + '.json', base + '.wav', h):
            kept += 1
            continue
        audio, words = await synthesise_with_retry(line_id, text, args.voice, args.rate, args.pitch)
        with open(base + '.mp3', 'wb') as f:
            f.write(audio)
        to_wav(args.ffmpeg, base + '.mp3', base + '.wav')
        samples = read_wav(base + '.wav')
        duration = round(len(samples) / RATE, 4)
        if not words:
            print(f'vo: warning: "{line_id}" came back with no word boundaries', file=sys.stderr, flush=True)
        meta = {
            'id': line_id,
            'text': text,
            'hash': h,
            'voice': args.voice,
            'rate': args.rate,
            'pitch': args.pitch,
            'duration': duration,
            'words': words,
            'env': envelope(samples),
        }
        # the .json is the cache's word that the wav beside it is whole, so it lands last and atomically
        tmp = base + '.json.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False)
        os.replace(tmp, base + '.json')
        spoken += 1
        print(f'  {line_id:<14} {duration:5.2f}s  {len(words):2d} words  {text}', flush=True)
    print(f'vo: {spoken} spoken, {kept} cached, {len(lines)} lines in {time.time() - t0:.1f}s -> {args.out}', flush=True)


def main():
    # the console may be cp1252; the script text is not
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description='Synthesise the voice-over lines with edge-tts.')
    ap.add_argument('lines', help='JSON object of id -> text')
    ap.add_argument('out', help='folder for <id>.mp3 / .wav / .json')
    ap.add_argument('--voice', default='en-IN-PrabhatNeural')
    ap.add_argument('--rate', default='+0%')
    ap.add_argument('--pitch', default='+0Hz')
    ap.add_argument('--ffmpeg', default=os.environ.get('FFMPEG', 'ffmpeg'))
    args = ap.parse_args()
    try:
        asyncio.run(run(args))
    except Failure as e:
        print(f'vo: {e}', file=sys.stderr, flush=True)
        sys.exit(1)
    except (OSError, ValueError) as e:
        print(f'vo: {type(e).__name__}: {e}', file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
