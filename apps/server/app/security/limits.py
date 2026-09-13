import asyncio
from collections import OrderedDict

MAX_IMAGE_BYTES = 1_500_000
MAX_METADATA_BYTES = 256 * 1024
ALLOWED_IMAGES = {"image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff"}


class ReplayGuard:
    """Bounded, process-local guard against duplicate planner steps."""

    def __init__(self, capacity: int = 10_000) -> None:
        self.capacity = capacity
        self._seen: OrderedDict[tuple[str, int], None] = OrderedDict()
        self._lock = asyncio.Lock()

    async def accept(self, session_id: str, step_id: int) -> bool:
        key = (session_id, step_id)
        async with self._lock:
            if key in self._seen:
                return False
            self._seen[key] = None
            while len(self._seen) > self.capacity:
                self._seen.popitem(last=False)
            return True


replay_guard = ReplayGuard()
