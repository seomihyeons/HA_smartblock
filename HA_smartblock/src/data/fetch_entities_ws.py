import json
from dotenv import load_dotenv
import os
import websocket
from urllib.parse import urlparse

# =========================
# CONFIG
# =========================

load_dotenv()

HA_BASE_URL = os.getenv("HA_BASE_URL")  # 예: http://100.78.25.15:8123
ACCESS_TOKEN = os.getenv("HA_TOKEN")

if not HA_BASE_URL or not ACCESS_TOKEN:
    raise RuntimeError("HA_BASE_URL 또는 HA_TOKEN이 .env에 설정되지 않았습니다.")

OUT_FILE = os.path.join(os.path.dirname(__file__), "test_entities.json")
REQ_ID = 1

def to_ws_url(base_url: str) -> str:
    """
    http(s)://host:port -> ws(s)://host:port/api/websocket
    """
    p = urlparse(base_url)

    if p.scheme not in ("http", "https"):
        raise ValueError(f"HA_BASE_URL scheme must be http or https: {base_url}")

    ws_scheme = "wss" if p.scheme == "https" else "ws"
    netloc = p.netloc  # host:port 포함
    return f"{ws_scheme}://{netloc}/api/websocket"

# =========================
# WebSocket handlers
# =========================
def on_open(ws):
    print("🔌 ws opened -> sending auth")
    ws.send(json.dumps({
        "type": "auth",
        "access_token": ACCESS_TOKEN
    }))

def on_message(ws, message):
    data = json.loads(message)
    msg_type = data.get("type")

    if msg_type == "auth_required":
        print("🔐 auth_required")
        return

    if msg_type == "auth_ok":
        print("✅ auth_ok -> requesting states")
        ws.send(json.dumps({
            "id": REQ_ID,
            "type": "get_states"
        }))
        return

    if msg_type == "auth_invalid":
        print("❌ auth_invalid:", data)
        ws.close()
        return

    if data.get("id") == REQ_ID:
        entities = data.get("result", [])
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(entities, f, ensure_ascii=False, indent=2)

        print(f"✅ entity {len(entities)}개 저장 완료 → {OUT_FILE}")
        ws.close()

def on_error(ws, error):
    print("💥 ws error:", repr(error))

def on_close(ws, code, msg):
    print("🔒 ws closed:", code, msg)

# =========================
# Main
# =========================
if __name__ == "__main__":
    url = to_ws_url(HA_BASE_URL)
    print("➡️ connecting:", url)

    ws = websocket.WebSocketApp(
        url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    ws.run_forever(
        ping_interval=30,
        ping_timeout=10,
    )
