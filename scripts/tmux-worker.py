#!/usr/bin/env python3
"""Persistent WSL-side tmux interaction and capture worker."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import shlex
import statistics
import subprocess
import sys
import time
from typing import Any


INITIAL_HOLD_MS = 1000.0
CHARACTER_CADENCE_MS = 80.0
COMMAND_PAUSE_MS = 700.0
WINNING_HOLD_MS = 1500.0


def _assert_range(name: str, values: list[float], minimum: float, maximum: float) -> None:
    if not values:
        raise ValueError(f"{name} has no samples")
    for index, value in enumerate(values):
        if not math.isfinite(value) or value < minimum or value > maximum:
            raise ValueError(
                f"{name} at index {index} was {value:.1f}ms; expected {minimum:.1f}..{maximum:.1f}ms"
            )


def validate_timing(timing: dict[str, Any]) -> None:
    """Reject nominal or slow timing while allowing ordinary scheduler jitter."""
    if timing.get("clock") != "CLOCK_MONOTONIC":
        raise ValueError("clock must be CLOCK_MONOTONIC")
    if timing.get("workerProcessCount") != 1:
        raise ValueError("interaction/capture must use one persistent WSL-side worker")

    _assert_range(
        "inter-character capture delta",
        timing.get("interCharacterCaptureDeltasMs", []),
        # Send deadlines remain the cadence proof. Captures can complete just
        # before the next deadline after a slow prior capture, so their visible
        # dwell may be shorter without accelerating input.
        15.0,
        200.0,
    )
    _assert_range(
        "inter-character send delta",
        timing.get("interCharacterSendDeltasMs", []),
        40.0,
        180.0,
    )
    _assert_range(
        "character-to-submit send delta",
        timing.get("characterToSubmitSendDeltasMs", []),
        40.0,
        180.0,
    )
    _assert_range(
        "character-to-submit capture delta",
        timing.get("characterToSubmitCaptureDeltasMs", []),
        15.0,
        250.0,
    )
    _assert_range(
        "command-pause capture delta",
        timing.get("commandPauseCaptureDeltasMs", []),
        575.0,
        925.0,
    )
    _assert_range("initial hold", [float(timing.get("initialHoldMs", 0))], 850.0, 1250.0)
    _assert_range("winning hold", [float(timing.get("winningHoldMs", 0))], 1350.0, 1750.0)
    _assert_range("capture span", [float(timing.get("captureSpanMs", 0))], 10000.0, 12000.0)
    if abs(float(timing.get("captureSpanMs", 0)) - float(timing.get("totalFrameDurationMs", 0))) > 0.1:
        raise ValueError("total frame duration must equal the observed capture span")


def _monotonic_ms() -> float:
    return time.monotonic_ns() / 1_000_000


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _filename_timestamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%f")[:-3] + "Z"


def _wait_until(deadline_ms: float) -> None:
    while True:
        remaining_ms = deadline_ms - _monotonic_ms()
        if remaining_ms <= 0:
            return
        time.sleep(remaining_ms / 1000)


class TmuxWorker:
    def __init__(
        self,
        session: str,
        artifact_root: Path,
        evidence_root: Path,
        result_path: Path,
        run_id: str,
        solution: list[str],
    ) -> None:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", run_id):
            raise ValueError("unsafe run id")
        self.session = session
        self.target = f"{session}:0.0"
        self.artifact_root = artifact_root
        self.evidence_root = evidence_root
        self.pane_root = evidence_root / "panes"
        self.result_path = result_path
        self.run_id = run_id
        if not solution or any(not isinstance(command, str) or not command for command in solution):
            raise ValueError("solution must contain non-empty command strings")
        self.solution = solution
        self.frames: list[dict[str, Any]] = []
        self.transcript_sections: list[str] = []
        self.move_characters: list[list[dict[str, Any]]] = []
        self.submissions: list[dict[str, float]] = []
        self.executed_tmux_commands: list[str] = []
        self.worker_started_at_utc = _utc_now()

    def tmux(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        self.executed_tmux_commands.append(shlex.join(["tmux", *arguments]))
        return subprocess.run(
            ["tmux", *arguments],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    def capture_text(self) -> tuple[str, float, str]:
        result = self.tmux("capture-pane", "-p", "-t", self.target)
        return result.stdout, _monotonic_ms(), _utc_now()

    def wait_for_marker(self, marker: str, timeout_ms: float = 5000.0) -> tuple[str, float, str]:
        deadline = _monotonic_ms() + timeout_ms
        while True:
            text, captured_ms, captured_utc = self.capture_text()
            if marker in text:
                return text, captured_ms, captured_utc
            if captured_ms >= deadline:
                raise RuntimeError(
                    f"timed out waiting for pane marker: {marker}\nLast pane:\n{text.rstrip()}"
                )
            time.sleep(0.015)

    def record_capture(
        self,
        label: str,
        text: str,
        captured_ms: float,
        captured_utc: str,
        event_ms: float | None = None,
    ) -> dict[str, Any]:
        safe_label = re.sub(r"[^A-Za-z0-9-]", "-", label)
        filename = f"{len(self.frames) + 1:03d}-{_filename_timestamp()}-{safe_label}.txt"
        path = self.pane_root / filename
        path.write_text(text if text.endswith("\n") else f"{text}\n", encoding="utf-8")
        frame: dict[str, Any] = {
            "label": label,
            "path": path.relative_to(self.artifact_root).as_posix(),
            "capturedAtUtc": captured_utc,
            "capturedMonotonicMs": round(captured_ms, 3),
        }
        if event_ms is not None:
            frame["eventAtMonotonicMs"] = round(event_ms, 3)
        self.frames.append(frame)
        self.transcript_sections.append(f"--- {label} ---\n{text.rstrip()}\n")
        return frame

    def send_literal_and_capture(self, label: str, character: str) -> dict[str, Any]:
        self.tmux("send-keys", "-t", self.target, "-l", character)
        event_ms = _monotonic_ms()
        text, captured_ms, captured_utc = self.capture_text()
        self.record_capture(label, text, captured_ms, captured_utc, event_ms)
        return {"event": event_ms, "capture": captured_ms, "character": character}

    def submit_and_capture(self, move_number: int) -> dict[str, float]:
        self.tmux("send-keys", "-t", self.target, "Enter")
        event_ms = _monotonic_ms()
        marker = f"moves={move_number} won="
        text, captured_ms, captured_utc = self.wait_for_marker(marker)
        self.record_capture(
            f"move-{move_number}-submitted",
            text,
            captured_ms,
            captured_utc,
            event_ms,
        )
        return {"event": event_ms, "capture": captured_ms}

    def timing(self, interaction_ended_ms: float) -> dict[str, Any]:
        for index, frame in enumerate(self.frames):
            next_capture_ms = (
                self.frames[index + 1]["capturedMonotonicMs"]
                if index + 1 < len(self.frames)
                else round(interaction_ended_ms, 3)
            )
            frame["durationMs"] = round(next_capture_ms - frame["capturedMonotonicMs"], 3)

        inter_character_send: list[float] = []
        inter_character_capture: list[float] = []
        character_to_submit_send: list[float] = []
        character_to_submit_capture: list[float] = []
        command_pause_capture: list[float] = []
        for move_index, characters in enumerate(self.move_characters):
            for previous, current in zip(characters, characters[1:]):
                inter_character_send.append(round(current["event"] - previous["event"], 3))
                inter_character_capture.append(round(current["capture"] - previous["capture"], 3))
            character_to_submit_send.append(round(self.submissions[move_index]["event"] - characters[-1]["event"], 3))
            character_to_submit_capture.append(round(self.submissions[move_index]["capture"] - characters[-1]["capture"], 3))
            next_capture = (
                self.move_characters[move_index + 1][0]["capture"]
                if move_index + 1 < len(self.move_characters)
                else self.frames[-1]["capturedMonotonicMs"]
            )
            command_pause_capture.append(round(next_capture - self.submissions[move_index]["capture"], 3))

        capture_span = round(interaction_ended_ms - self.frames[0]["capturedMonotonicMs"], 3)
        total_duration = round(sum(frame["durationMs"] for frame in self.frames), 3)
        return {
            "clock": "CLOCK_MONOTONIC",
            "workerProcessCount": 1,
            "workerPid": os.getpid(),
            "workerStartedAtUtc": self.worker_started_at_utc,
            "interactionEndedAtUtc": _utc_now(),
            "interactionEndedMonotonicMs": round(interaction_ended_ms, 3),
            "targetInitialHoldMs": INITIAL_HOLD_MS,
            "targetCharacterCadenceMs": CHARACTER_CADENCE_MS,
            "targetCommandPauseMs": COMMAND_PAUSE_MS,
            "targetWinningHoldMs": WINNING_HOLD_MS,
            "initialHoldMs": self.frames[0]["durationMs"],
            "winningHoldMs": self.frames[-1]["durationMs"],
            "captureSpanMs": capture_span,
            "totalFrameDurationMs": total_duration,
            "interCharacterSendDeltasMs": inter_character_send,
            "interCharacterCaptureDeltasMs": inter_character_capture,
            "characterToSubmitSendDeltasMs": character_to_submit_send,
            "characterToSubmitCaptureDeltasMs": character_to_submit_capture,
            "commandPauseCaptureDeltasMs": command_pause_capture,
        }

    def run(self) -> dict[str, Any]:
        self.pane_root.mkdir(parents=True, exist_ok=True)
        # WSL interop and the Windows Bun executable can cold-start slowly. This
        # readiness wait precedes the measured interaction and is condition-based.
        initial_text, initial_ms, initial_utc = self.wait_for_marker(
            "moves=0 won=false", timeout_ms=15000.0
        )
        self.record_capture("initial", initial_text, initial_ms, initial_utc)

        first_character_deadline = initial_ms + INITIAL_HOLD_MS
        for move_index, command in enumerate(self.solution):
            character_records: list[dict[str, Any]] = []
            character_deadline = first_character_deadline
            for character_index, character in enumerate(command):
                _wait_until(character_deadline)
                character_records.append(
                    self.send_literal_and_capture(
                        f"move-{move_index + 1}-char-{character_index + 1}",
                        character,
                    )
                )
                character_deadline += CHARACTER_CADENCE_MS
            self.move_characters.append(character_records)

            _wait_until(character_deadline)
            submission = self.submit_and_capture(move_index + 1)
            self.submissions.append(submission)
            first_character_deadline = submission["capture"] + COMMAND_PAUSE_MS

        _wait_until(self.submissions[-1]["capture"] + COMMAND_PAUSE_MS)
        won_text, won_ms, won_utc = self.capture_text()
        if "moves=7 won=true" not in won_text or "YOU WIN" not in won_text or "__APP_EXIT__=0" not in won_text:
            raise RuntimeError("winning pane did not contain required terminal markers")
        self.record_capture("won-hold", won_text, won_ms, won_utc)

        _wait_until(won_ms + WINNING_HOLD_MS)
        interaction_ended_ms = _monotonic_ms()
        timing = self.timing(interaction_ended_ms)
        transcript = "\n".join(self.transcript_sections)
        required_markers = ["moves=0 won=false", *[f"moves={index} won=" for index in range(1, 8)], "moves=7 won=true", "YOU WIN", "__APP_EXIT__=0"]
        for marker in required_markers:
            if marker not in transcript:
                raise RuntimeError(f"transcript assertion failed: missing {marker}")

        transcript_path = self.evidence_root / "transcript.txt"
        transcript_path.write_text(transcript, encoding="utf-8")
        result = {
            "frames": self.frames,
            "solution": self.solution,
            "executedSolution": [
                "".join(character["character"] for character in characters)
                for characters in self.move_characters
            ],
            "tmuxCommands": self.executed_tmux_commands,
            "timing": timing,
            "transcriptPath": transcript_path.relative_to(self.artifact_root).as_posix(),
        }
        temporary_result = self.result_path.with_suffix(self.result_path.suffix + ".tmp")
        temporary_result.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary_result, self.result_path)
        validate_timing(timing)
        return result


def _timing_summary(timing: dict[str, Any]) -> str:
    captures = timing["interCharacterCaptureDeltasMs"]
    return (
        f"measured timing passed captureSpanMs={timing['captureSpanMs']:.1f} "
        f"charCaptureMinMs={min(captures):.1f} charCaptureMeanMs={statistics.mean(captures):.1f} "
        f"charCaptureMaxMs={max(captures):.1f}"
    )


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "--validate-timing":
        try:
            timing = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
            validate_timing(timing)
            print(_timing_summary(timing))
            return 0
        except Exception as error:  # validation CLI must be concise
            print(f"timing validation failed: {error}", file=sys.stderr)
            return 1

    parser = argparse.ArgumentParser()
    parser.add_argument("--session", required=True)
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--evidence-root", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--solution-file", type=Path, required=True)
    arguments = parser.parse_args(argv)
    try:
        worker = TmuxWorker(
            session=arguments.session,
            artifact_root=arguments.artifact_root,
            evidence_root=arguments.evidence_root,
            result_path=arguments.result,
            run_id=arguments.run_id,
            solution=json.loads(arguments.solution_file.read_text(encoding="utf-8")),
        )
        result = worker.run()
        print(_timing_summary(result["timing"]))
        return 0
    except Exception as error:
        print(f"persistent tmux worker failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
