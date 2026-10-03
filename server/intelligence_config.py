import os
from pathlib import Path

SERVER_DIR = Path(__file__).parent
PROJECT_ROOT = SERVER_DIR.parent

_env_file = PROJECT_ROOT / ".env"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _value = _line.split("=", 1)
        os.environ.setdefault(_key.strip(), _value.strip().strip('"').strip("'"))

# obsidian host: 127.0.0.1 on same PC, or http://192.168.x.x:27123 from another laptop
OBSIDIAN_API_URL = os.getenv("OBSIDIAN_API_URL", "https://127.0.0.1:27124")
OBSIDIAN_INSECURE_URL = os.getenv("OBSIDIAN_INSECURE_URL", "http://127.0.0.1:27123")
OBSIDIAN_TRY_INSECURE = os.getenv("OBSIDIAN_TRY_INSECURE", "true").lower() == "true"
OBSIDIAN_API_KEY = os.getenv("OBSIDIAN_API_KEY", "")
OBSIDIAN_VAULT_PATH = Path(
    os.getenv("OBSIDIAN_VAULT_PATH", str(PROJECT_ROOT / "HAC"))
)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:1.5b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
