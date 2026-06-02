"""Structured JSON logger — mirrors mossy-wave _logger.ts pattern."""
import json
import sys
from datetime import datetime, timezone
from typing import Any


def _log(level: str, message: str, **context: Any) -> None:
    entry = {
        "level": level,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **context,
    }
    print(json.dumps(entry), file=sys.stdout, flush=True)


def info(message: str, **context: Any) -> None:
    _log("INFO", message, **context)


def error(message: str, **context: Any) -> None:
    _log("ERROR", message, **context)


def warn(message: str, **context: Any) -> None:
    _log("WARN", message, **context)
