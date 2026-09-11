import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.seed import run_seed  # noqa: E402

logging.basicConfig(level=logging.INFO)

if __name__ == "__main__":
    asyncio.run(run_seed())
