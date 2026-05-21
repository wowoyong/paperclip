#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable


TIMESTAMP_RE = re.compile(
    r"(?P<start>\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(?P<end>\d{2}:\d{2}:\d{2}\.\d{3})"
)


def sanitize_video_id(url: str) -> str:
    patterns = [
        r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{6,})",
        r"/shorts/([A-Za-z0-9_-]{6,})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return re.sub(r"[^A-Za-z0-9_-]+", "-", url)[:40] or "video"


def run_command(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=str(cwd) if cwd else None, text=True, capture_output=True, check=False)


def hhmmss(seconds: float | int | None) -> str:
    if seconds is None:
        return "00:00"
    total = max(0, int(seconds))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def parse_vtt_timestamp(raw: str) -> float:
    hours, minutes, seconds = raw.split(":")
    whole, millis = seconds.split(".")
    return int(hours) * 3600 + int(minutes) * 60 + int(whole) + int(millis) / 1000


def unique_lines(lines: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for line in lines:
        normalized = re.sub(r"\s+", " ", line).strip()
        if not normalized or normalized in seen:
            continue
        if result:
            previous = result[-1]
            if normalized in previous or previous in normalized:
                if len(normalized) > len(previous):
                    result[-1] = normalized
                    seen.add(normalized)
                continue
        seen.add(normalized)
        result.append(normalized)
    return result


def parse_vtt_file(path: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    current_start: float | None = None
    current_end: float | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal current_start, current_end, buffer
        if current_start is None or current_end is None:
            buffer = []
            return
        text_lines = unique_lines(buffer)
        if text_lines:
            entries.append(
                {
                    "start": current_start,
                    "end": current_end,
                    "text": " ".join(text_lines),
                    "lines": text_lines,
                }
            )
        current_start = None
        current_end = None
        buffer = []

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip("\ufeff").strip()
        if not line:
            flush()
            continue
        if line == "WEBVTT" or line.startswith("Kind:") or line.startswith("Language:") or line.startswith("NOTE"):
            continue
        match = TIMESTAMP_RE.match(line)
        if match:
            flush()
            current_start = parse_vtt_timestamp(match.group("start"))
            current_end = parse_vtt_timestamp(match.group("end"))
            continue
        if "-->" in line:
            continue
        if re.fullmatch(r"\d+", line):
            continue
        clean = re.sub(r"<[^>]+>", "", line).strip()
        if clean:
            buffer.append(clean)
    flush()
    compacted: list[dict[str, object]] = []
    for entry in entries:
        text = str(entry["text"]).strip()
        if compacted:
            previous_text = str(compacted[-1]["text"]).strip()
            if text == previous_text or text in previous_text or previous_text in text:
                if len(text) > len(previous_text):
                    compacted[-1] = entry
                continue
        compacted.append(entry)
    return compacted


def choose_transcript_file(work_dir: Path, video_id: str) -> tuple[Path | None, str | None]:
    candidates = sorted(work_dir.glob(f"{video_id}*.vtt"))
    if not candidates:
        return None, None

    def priority(path: Path) -> tuple[int, str]:
        name = path.name.lower()
        if ".ko" in name:
            return (0, name)
        if ".en" in name:
            return (1, name)
        return (2, name)

    selected = sorted(candidates, key=priority)[0]
    lang = "unknown"
    lang_match = re.search(rf"{re.escape(video_id)}\.([a-zA-Z0-9-]+)\.vtt$", selected.name)
    if lang_match:
      lang = lang_match.group(1)
    return selected, lang


def build_topic_slices(entries: list[dict[str, object]], duration: float | int | None) -> list[dict[str, object]]:
    if not entries:
        return []
    slice_count = min(5, max(3, math.ceil((duration or len(entries) * 20) / 420)))
    if duration and duration > 0:
        window = max(180, math.ceil(duration / slice_count))
        buckets: list[dict[str, object]] = []
        start_time = 0
        while start_time < duration and len(buckets) < slice_count:
            end_time = min(duration, start_time + window)
            bucket_entries = [entry for entry in entries if isinstance(entry.get("start"), (int, float)) and start_time <= float(entry["start"]) < end_time]
            if bucket_entries:
                buckets.append(
                    {
                        "label": f"{hhmmss(start_time)}–{hhmmss(end_time)}",
                        "entries": bucket_entries,
                    }
                )
            start_time = end_time
        if buckets:
            return buckets

    chunk_size = math.ceil(len(entries) / slice_count)
    return [
        {
            "label": f"part {index + 1}",
            "entries": entries[index * chunk_size : (index + 1) * chunk_size],
        }
        for index in range(slice_count)
        if entries[index * chunk_size : (index + 1) * chunk_size]
    ]


def format_slice_markdown(slices: list[dict[str, object]]) -> str:
    blocks: list[str] = []
    for index, item in enumerate(slices, start=1):
        entries = item["entries"]
        assert isinstance(entries, list)
        topic_lines = []
        for entry in entries[:6]:
            text = str(entry.get("text", "")).strip()
            if text:
                topic_lines.append(f"- {text}")
        if not topic_lines:
            continue
        blocks.append(f"### Topic Slice {index} ({item['label']})")
        blocks.extend(topic_lines)
        blocks.append("")
    return "\n".join(blocks).strip()


def run_stt_command(command_template: str, audio_path: Path, transcript_output_path: Path, lang_hint: str | None) -> tuple[bool, str]:
    rendered = command_template.format(
        audio_path=str(audio_path),
        output_path=str(transcript_output_path),
        lang=(lang_hint or "auto"),
    )
    result = run_command(shlex.split(rendered))
    if result.returncode != 0:
        return False, (result.stderr or result.stdout or "stt command failed").strip()
    if not transcript_output_path.exists():
        return False, "stt command succeeded but transcript output file was not created"
    return True, "ok"


def transcribe_with_local_python(audio_path: Path, transcript_output_path: Path) -> tuple[bool, str]:
    stt_candidates = [
        """
from pathlib import Path
from faster_whisper import WhisperModel
audio_path = Path(r"{audio_path}")
output_path = Path(r"{output_path}")
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(str(audio_path), vad_filter=True)
lines = []
for segment in segments:
    text = (segment.text or "").strip()
    if text:
        lines.append(text)
output_path.write_text("\\n".join(lines) + ("\\n" if lines else ""), encoding="utf-8")
print(f"provider=faster_whisper language={getattr(info, 'language', 'unknown')}")
""",
        """
from pathlib import Path
import whisper
audio_path = Path(r"{audio_path}")
output_path = Path(r"{output_path}")
model = whisper.load_model("base")
result = model.transcribe(str(audio_path), fp16=False)
segments = result.get("segments") or []
lines = []
for segment in segments:
    text = (segment.get("text") or "").strip()
    if text:
        lines.append(text)
output_path.write_text("\\n".join(lines) + ("\\n" if lines else ""), encoding="utf-8")
print(f"provider=openai_whisper language={result.get('language', 'unknown')}")
""",
        """
from pathlib import Path
import mlx_whisper
audio_path = Path(r"{audio_path}")
output_path = Path(r"{output_path}")
result = mlx_whisper.transcribe(str(audio_path), path_or_hf_repo="mlx-community/whisper-base")
segments = result.get("segments") or []
lines = []
for segment in segments:
    text = (segment.get("text") or "").strip()
    if text:
        lines.append(text)
output_path.write_text("\\n".join(lines) + ("\\n" if lines else ""), encoding="utf-8")
print(f"provider=mlx_whisper language={result.get('language', 'unknown')}")
""",
    ]
    for candidate in stt_candidates:
        code = candidate.format(audio_path=str(audio_path), output_path=str(transcript_output_path))
        result = run_command([sys.executable, "-c", code])
        if result.returncode == 0 and transcript_output_path.exists():
            detail = (result.stdout or "provider=python_stt").strip()
            return True, detail
    return False, "no local python STT provider available (tried faster_whisper, whisper, mlx_whisper)"


def extract_sample_frames(video_url: str, out_dir: Path, video_id: str, frame_count: int) -> tuple[list[dict[str, object]], list[str]]:
    notes: list[str] = []
    frame_dir = out_dir / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    video_path = out_dir / f"{video_id}.video.mp4"
    download = run_command(
        [
            "yt-dlp",
            "-f",
            "mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
            "--merge-output-format",
            "mp4",
            "--output",
            str(video_path),
            video_url,
        ]
    )
    if download.returncode != 0 or not video_path.exists():
        notes.append(f"video download failed for frame extraction: {(download.stderr or download.stdout).strip()}")
        return [], notes

    probe = run_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
    )
    duration = None
    if probe.returncode == 0:
        try:
            duration = float((probe.stdout or "").strip())
        except ValueError:
            duration = None

    if not duration or duration <= 0:
        notes.append("ffprobe could not determine video duration for frame extraction")
        return [], notes

    timestamps = [max(0.0, duration * idx / (frame_count + 1)) for idx in range(1, frame_count + 1)]
    frames: list[dict[str, object]] = []
    for index, ts in enumerate(timestamps, start=1):
        frame_path = frame_dir / f"{video_id}-frame-{index:02d}.jpg"
        capture = run_command(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{ts:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                str(frame_path),
            ]
        )
        if capture.returncode == 0 and frame_path.exists():
            frames.append(
                {
                    "timestamp_sec": ts,
                    "timestamp_label": hhmmss(ts),
                    "path": str(frame_path),
                }
            )
        else:
            notes.append(f"failed to capture frame at {hhmmss(ts)}: {(capture.stderr or capture.stdout).strip()}")

    if frames:
        notes.append(f"sampled {len(frames)} visual frames")
    return frames, notes


def run_vision_command(command_template: str, frame_paths: list[str], output_path: Path) -> tuple[bool, str]:
    rendered = command_template.format(
        frame_paths=" ".join(shlex.quote(path) for path in frame_paths),
        output_path=str(output_path),
    )
    result = run_command(shlex.split(rendered))
    if result.returncode != 0:
        return False, (result.stderr or result.stdout or "vision command failed").strip()
    if not output_path.exists():
        return False, "vision command succeeded but output file was not created"
    return True, "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch YouTube metadata/transcript/audio for richer brief generation.")
    parser.add_argument("url")
    parser.add_argument("--out-dir", dest="out_dir", default=None)
    parser.add_argument("--download-audio", action="store_true", help="Download audio for STT fallback.")
    parser.add_argument("--stt-command", dest="stt_command", default=os.environ.get("PAPERCLIP_VIDEO_STT_COMMAND"))
    parser.add_argument("--extract-frames", action="store_true", help="Download video and extract evenly sampled frames.")
    parser.add_argument("--frame-count", type=int, default=6, help="Number of frames to sample when --extract-frames is enabled.")
    parser.add_argument("--vision-command", dest="vision_command", default=os.environ.get("PAPERCLIP_VIDEO_VISION_COMMAND"))
    parser.add_argument("--json", action="store_true", help="Print manifest json to stdout.")
    args = parser.parse_args()

    video_id = sanitize_video_id(args.url)
    out_dir = Path(args.out_dir) if args.out_dir else Path("/tmp/paperclip-video-briefs") / video_id
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "source_url": args.url,
        "video_id": video_id,
        "work_dir": str(out_dir),
        "transcript_status": "missing",
        "transcript_lang": None,
        "transcript_path": None,
        "audio_path": None,
        "stt_transcript_path": None,
        "stt_provider": None,
        "frames": [],
        "vision_notes_path": None,
        "notes": [],
    }

    info_args = [
        "yt-dlp",
        "--no-update",
        "--skip-download",
        "--write-info-json",
        "--output",
        str(out_dir / "%(id)s.%(ext)s"),
        args.url,
    ]
    info_fetch = run_command(info_args)
    if info_fetch.returncode != 0:
        manifest["notes"] = [f"yt-dlp metadata fetch failed: {(info_fetch.stderr or info_fetch.stdout).strip()}"]
    else:
        manifest["notes"] = ["yt-dlp metadata fetch succeeded"]

    subtitle_attempt_notes: list[str] = []
    for lang_spec in ("ko.*,ko", "en.*,en"):
        ytdlp_args = [
            "yt-dlp",
            "--no-update",
            "--skip-download",
            "--no-write-info-json",
            "--write-auto-subs",
            "--write-subs",
            "--sub-langs",
            lang_spec,
            "--sub-format",
            "vtt",
            "--output",
            str(out_dir / "%(id)s.%(ext)s"),
            args.url,
        ]
        fetch = run_command(ytdlp_args)
        transcript_file, transcript_lang = choose_transcript_file(out_dir, video_id)
        if transcript_file:
            manifest["transcript_status"] = "captions"
            manifest["transcript_lang"] = transcript_lang
            manifest["transcript_path"] = str(transcript_file)
            subtitle_attempt_notes.append(f"subtitle fetch succeeded with lang spec: {lang_spec}")
            break
        subtitle_attempt_notes.append(
            f"subtitle fetch failed for {lang_spec}: {(fetch.stderr or fetch.stdout).strip()}"
        )

    manifest["notes"] = [*list(manifest.get("notes", [])), *subtitle_attempt_notes]

    info_path = out_dir / f"{video_id}.info.json"
    if info_path.exists():
        try:
            info = json.loads(info_path.read_text(encoding="utf-8"))
            manifest.update(
                {
                    "title": info.get("title"),
                    "channel": info.get("channel") or info.get("uploader"),
                    "duration_sec": info.get("duration"),
                    "upload_date": info.get("upload_date"),
                    "description_excerpt": (info.get("description") or "")[:800],
                }
            )
        except Exception as exc:
            cast_notes = list(manifest.get("notes", []))
            cast_notes.append(f"failed to parse info json: {exc}")
            manifest["notes"] = cast_notes

    transcript_file, transcript_lang = choose_transcript_file(out_dir, video_id)
    transcript_entries: list[dict[str, object]] = []
    if transcript_file:
        transcript_entries = parse_vtt_file(transcript_file)
    else:
        cast_notes = list(manifest.get("notes", []))
        cast_notes.append("no subtitle file found after sequential yt-dlp subtitle fetch")
        manifest["notes"] = cast_notes

    audio_path = out_dir / f"{video_id}.audio.mp3"
    if not transcript_entries and (args.download_audio or args.stt_command):
        audio_fetch = run_command(
            [
                "yt-dlp",
                "-f",
                "bestaudio/best",
                "--extract-audio",
                "--audio-format",
                "mp3",
                "--output",
                str(out_dir / "%(id)s.audio.%(ext)s"),
                args.url,
            ]
        )
        if audio_fetch.returncode == 0 and audio_path.exists():
            manifest["audio_path"] = str(audio_path)
        else:
            cast_notes = list(manifest.get("notes", []))
            cast_notes.append(f"audio download failed: {(audio_fetch.stderr or audio_fetch.stdout).strip()}")
            manifest["notes"] = cast_notes

    stt_output_path = out_dir / f"{video_id}.stt.txt"
    if not transcript_entries and audio_path.exists():
        ok = False
        detail = ""
        if args.stt_command:
            ok, detail = run_stt_command(args.stt_command, audio_path, stt_output_path, None)
        else:
            ok, detail = transcribe_with_local_python(audio_path, stt_output_path)
        if ok:
            lines = unique_lines(stt_output_path.read_text(encoding="utf-8", errors="ignore").splitlines())
            transcript_entries = [
                {"start": 0.0, "end": float(manifest.get("duration_sec") or 0), "text": " ".join(lines), "lines": lines}
            ]
            manifest["transcript_status"] = "stt"
            manifest["stt_transcript_path"] = str(stt_output_path)
            manifest["stt_provider"] = detail
            cast_notes = list(manifest.get("notes", []))
            cast_notes.append(f"local stt transcript generated ({detail})")
            manifest["notes"] = cast_notes
        else:
            cast_notes = list(manifest.get("notes", []))
            cast_notes.append(f"stt failed: {detail}")
            manifest["notes"] = cast_notes

    frame_notes: list[str] = []
    if args.extract_frames:
        frames, frame_notes = extract_sample_frames(args.url, out_dir, video_id, max(1, args.frame_count))
        manifest["frames"] = frames
        if frames and args.vision_command:
            vision_output_path = out_dir / f"{video_id}.vision-notes.md"
            ok, detail = run_vision_command(args.vision_command, [str(frame["path"]) for frame in frames], vision_output_path)
            cast_notes = list(manifest.get("notes", []))
            if ok:
                manifest["vision_notes_path"] = str(vision_output_path)
                cast_notes.append("vision command generated frame notes")
            else:
                cast_notes.append(f"vision command failed: {detail}")
            manifest["notes"] = cast_notes
    if frame_notes:
        manifest["notes"] = [*list(manifest.get("notes", [])), *frame_notes]

    transcript_text = "\n".join(entry["text"] for entry in transcript_entries if entry.get("text"))
    transcript_txt_path = out_dir / f"{video_id}.transcript.txt"
    if transcript_text:
        transcript_txt_path.write_text(transcript_text, encoding="utf-8")
        if manifest["transcript_path"] is None:
            manifest["transcript_path"] = str(transcript_txt_path)

    slices = build_topic_slices(transcript_entries, manifest.get("duration_sec") if isinstance(manifest.get("duration_sec"), (int, float)) else None)
    topic_markdown = format_slice_markdown(slices)

    briefing_lines = [
        "# Video Brief Pipeline Output",
        "",
        f"- source_url: {args.url}",
        f"- video_id: {video_id}",
        f"- title: {manifest.get('title') or '-'}",
        f"- channel: {manifest.get('channel') or '-'}",
        f"- duration: {hhmmss(manifest.get('duration_sec') if isinstance(manifest.get('duration_sec'), (int, float)) else None)}",
        f"- transcript_status: {manifest.get('transcript_status')}",
        f"- transcript_lang: {manifest.get('transcript_lang') or '-'}",
        f"- transcript_path: {manifest.get('transcript_path') or '-'}",
        f"- audio_path: {manifest.get('audio_path') or '-'}",
        f"- stt_provider: {manifest.get('stt_provider') or '-'}",
        f"- sampled_frames: {len(manifest.get('frames') or [])}",
        f"- vision_notes_path: {manifest.get('vision_notes_path') or '-'}",
        "",
        "## Notes",
        "",
    ]
    for note in manifest.get("notes", []):
        briefing_lines.append(f"- {note}")

    if manifest.get("description_excerpt"):
        briefing_lines.extend(
            [
                "",
                "## Description Excerpt",
                "",
                str(manifest["description_excerpt"]).strip(),
            ]
        )

    if topic_markdown:
        briefing_lines.extend(
            [
                "",
                "## Suggested Topic Slices",
                "",
                topic_markdown,
            ]
        )

    frames = manifest.get("frames") or []
    if isinstance(frames, list) and frames:
        briefing_lines.extend(
            [
                "",
                "## Sampled Frames",
                "",
            ]
        )
        for frame in frames:
            if not isinstance(frame, dict):
                continue
            briefing_lines.append(
                f"- {frame.get('timestamp_label')}: {frame.get('path')}"
            )

    if manifest.get("vision_notes_path"):
        vision_path = Path(str(manifest["vision_notes_path"]))
        if vision_path.exists():
            briefing_lines.extend(
                [
                    "",
                    "## Vision Notes",
                    "",
                    vision_path.read_text(encoding="utf-8", errors="ignore").strip(),
                ]
            )

    if transcript_text:
        excerpt_lines = transcript_text.splitlines()[:60]
        briefing_lines.extend(
            [
                "",
                "## Transcript Excerpt",
                "",
                "\n".join(f"- {line}" for line in excerpt_lines if line.strip()),
            ]
        )

    briefing_path = out_dir / f"{video_id}.briefing.md"
    briefing_path.write_text("\n".join(briefing_lines).strip() + "\n", encoding="utf-8")
    manifest["briefing_path"] = str(briefing_path)

    manifest_path = out_dir / f"{video_id}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.json:
        sys.stdout.write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stdout.write(f"briefing_path={briefing_path}\n")
        sys.stdout.write(f"manifest_path={manifest_path}\n")
        sys.stdout.write(f"transcript_status={manifest.get('transcript_status')}\n")
        if manifest.get("transcript_path"):
            sys.stdout.write(f"transcript_path={manifest.get('transcript_path')}\n")
        if manifest.get("audio_path"):
            sys.stdout.write(f"audio_path={manifest.get('audio_path')}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
