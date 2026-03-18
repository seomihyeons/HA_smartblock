import os
import time
import json
import signal
from typing import Any, Optional, Tuple, Dict

import paho.mqtt.client as mqtt

# ===== pop-xhome =====
from xhome.actuator import Lamp, Fan, DoorLock, GasBreaker, Curtain, MoodLamp
from xhome.sensors import Pir, Dust, Tphg, Gas, Light, Reed, Accel


# =========================
# Config (env)
# =========================
BROKER = os.getenv("BROKER_DOMAIN", "192.168.0.22")
PORT = int(os.getenv("MQTT_PORT", "1883"))
KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))

# Root: xhome/<INSTITUTION+DEVNUM>
ROOT = os.getenv("XHOME_ROOT", "xhome/TNG02")

SET_SUB = f"{ROOT}/+/+/set"

ENABLE_SENSORS = os.getenv("ENABLE_SENSORS", "1").lower() not in ("0", "false", "no")
SENSOR_INTERVAL = float(os.getenv("SENSOR_INTERVAL", "2.0"))


RETAIN_STATE = os.getenv("RETAIN_STATE", "0").lower() in ("1", "true", "yes")
RETAIN_PIR = os.getenv("RETAIN_PIR", "0").lower() in ("1", "true", "yes")
PUBLISH_SENSOR_ON_CHANGE = os.getenv("PUBLISH_SENSOR_ON_CHANGE", "1").lower() not in ("0", "false", "no")
PUBLISH_PLACE_FIRST_STATE = os.getenv("PUBLISH_PLACE_FIRST_STATE", "1").lower() not in ("0", "false", "no")
DEBOUNCE_SEC = float(os.getenv("DEBOUNCE_SEC", "0.3"))
PIR_POLL_INTERVAL = float(os.getenv("PIR_POLL_INTERVAL", "0.1"))  # 100ms
PIR_HOLD_SEC = float(os.getenv("PIR_HOLD_SEC", "2.0"))            # detect 유지 시간


# =========================
# XHome instances
# =========================
lamp = Lamp()
fan = Fan()
doorlock = DoorLock()
gasbreaker = GasBreaker()
curtain = Curtain()
moodlamp = MoodLamp()

pir = Pir()
dust = Dust()
tphg = Tphg()
gas = Gas()
illuminance = Light()
reed = Reed()
accel = Accel()

KNOWN_ACTUATORS = {"lamp", "fan", "doorlock", "gasbreaker", "curtain", "moodlamp"}


# =========================
# Logging helpers
# =========================
def log_set(topic: str, payload: str, parsed: Optional[Tuple[str, str]] = None):
    if parsed:
        device, place = parsed
        print(f"[SET RX]    {topic}  payload={payload!r}  -> device={device}, place={place}")
    else:
        print(f"[SET RX]    {topic}  payload={payload!r}  -> (unparsed)")

def log_state(topic: str, payload: Any):
    print(f"[STATE TX]  {topic}  payload={payload}")

def log_sensor(topic: str, payload: Any):
    print(f"[SENSOR TX] {topic}  payload={payload}")

def log_drop(reason: str, topic: str, payload: str):
    print(f"[DROP] {reason}  topic={topic} payload={payload!r}")


# =========================
# MQTT helpers
# =========================
def mqtt_publish(client: mqtt.Client, topic: str, payload: Any, retain: bool = False):
    if isinstance(payload, (dict, list)):
        payload_str = json.dumps(payload, ensure_ascii=False)
    else:
        payload_str = str(payload)
    client.publish(topic, payload_str, qos=0, retain=retain)

def norm_payload(s: str) -> str:
    return s.strip().lower()

def parse_set_topic(topic: str) -> Optional[Tuple[str, str]]:
    """
    Accept ONLY set topics:
      - ROOT/<device>/<place>/set
      - ROOT/<place>/<device>/set
    Return (device, place)
    """
    parts = topic.split("/")
    root_parts = ROOT.split("/")

    if len(parts) != len(root_parts) + 3:
        return None
    if parts[:len(root_parts)] != root_parts:
        return None

    a = parts[len(root_parts) + 0]
    b = parts[len(root_parts) + 1]
    action = parts[len(root_parts) + 2]
    if action != "set":
        return None

    if a in KNOWN_ACTUATORS:
        return (a, b)       # device-first
    if b in KNOWN_ACTUATORS:
        return (b, a)       # place-first

    return None


# =========================
# State publishing (device-first + optional place-first)
# =========================
def publish_simple_state(client: mqtt.Client, device: str, place: str, state: str):
    # device-first (현재 HA가 쓰는 방식)
    t1 = f"{ROOT}/{device}/{place}/state"
    mqtt_publish(client, t1, state, retain=RETAIN_STATE)
    log_state(t1, state)

    # place-first (pop-xhome/호환)
    if PUBLISH_PLACE_FIRST_STATE:
        t2 = f"{ROOT}/{place}/{device}/state"
        mqtt_publish(client, t2, state, retain=RETAIN_STATE)
        log_state(t2, state)

def publish_moodlamp_state(client: mqtt.Client, place: str, is_on: bool, r: int = 255, g: int = 255, b: int = 255):
    # device-first
    t1 = f"{ROOT}/moodlamp/{place}/state"
    payload = {"state": "ON" if is_on else "OFF"}
    if is_on:
        payload["color_mode"] = "rgb"
        payload["color"] = {"r": int(r), "g": int(g), "b": int(b)}
    mqtt_publish(client, t1, payload, retain=RETAIN_STATE)
    log_state(t1, payload)

    # place-first (옵션)
    if PUBLISH_PLACE_FIRST_STATE:
        t2 = f"{ROOT}/{place}/moodlamp/state"
        mqtt_publish(client, t2, payload, retain=RETAIN_STATE)
        log_state(t2, payload)


# =========================
# Debounce
# =========================
_last_cmd_at: Dict[str, float] = {}
_last_cmd_sig: Dict[str, str] = {}

def should_drop_debounced(key: str, sig: str) -> bool:
    now = time.time()
    last_t = _last_cmd_at.get(key, 0.0)
    last_sig = _last_cmd_sig.get(key)

    if last_sig == sig and (now - last_t) < DEBOUNCE_SEC:
        return True
    if (now - last_t) < (DEBOUNCE_SEC / 2.0):
        return True

    _last_cmd_at[key] = now
    _last_cmd_sig[key] = sig
    return False


# =========================
# Sensor change-only publish
# =========================
_last_sensor_payload: Dict[str, str] = {}

def sensor_publish(client: mqtt.Client, topic: str, payload: Any, retain: bool):
    """
    변화 있을 때만 publish(옵션). payload는 문자열 비교로 안정적으로 처리.
    """
    if isinstance(payload, (dict, list)):
        payload_str = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    else:
        payload_str = str(payload)

    if PUBLISH_SENSOR_ON_CHANGE:
        prev = _last_sensor_payload.get(topic)
        if prev == payload_str:
            return
        _last_sensor_payload[topic] = payload_str

    client.publish(topic, payload_str, qos=0, retain=retain)
    log_sensor(topic, payload)


# =========================
# PIR: fast poll + hold + change-only
# =========================
_pir_state: Optional[str] = None
_pir_hold_until = 0.0

def publish_pir_fast(client: mqtt.Client):
    global _pir_state, _pir_hold_until

    raw = str(pir.read()).strip().lower()
    now = time.time()

    detected = raw in ("detect", "detected", "motion", "on", "1", "true")
    if detected:
        _pir_hold_until = now + PIR_HOLD_SEC
        state = "detect"
    else:
        state = "detect" if now < _pir_hold_until else "not detect"

    if state != _pir_state:
        _pir_state = state
        t = f"{ROOT}/sensor/pir/entrance/state"
        sensor_publish(client, t, state, retain=RETAIN_PIR)


# =========================
# Other Sensors (bulk)
# =========================
def publish_sensors_bulk(client: mqtt.Client):
    try:
        v = illuminance.read()
        t = f"{ROOT}/sensor/light/room/state"
        sensor_publish(client, t, v, retain=RETAIN_STATE)
    except Exception as e:
        print("⚠️ Light read failed:", e)

    try:
        v = reed.read()
        t = f"{ROOT}/sensor/reed/room/state"
        sensor_publish(client, t, v, retain=RETAIN_STATE)
    except Exception as e:
        print("⚠️ Reed read failed:", e)

    try:
        v = gas.read()
        t = f"{ROOT}/sensor/gas/kitchen/state"
        sensor_publish(client, t, v, retain=RETAIN_STATE)
    except Exception as e:
        print("⚠️ Gas read failed:", e)

    try:
        d = tphg.read()
        if isinstance(d, dict):
            for k in ("temperature", "humidity", "pressure", "gas"):
                t = f"{ROOT}/sensor/tphg/livingroom/{k}/state"
                sensor_publish(client, t, d.get(k), retain=RETAIN_STATE)
        else:
            t = f"{ROOT}/sensor/tphg/livingroom/state"
            sensor_publish(client, t, d, retain=RETAIN_STATE)
    except Exception as e:
        print("⚠️ TPHG read failed:", e)

    try:
        d = dust.read()
        if isinstance(d, dict):
            for k in ("1.0", "2.5", "10"):
                t = f"{ROOT}/sensor/dust/livingroom/{k}/state"
                sensor_publish(client, t, d.get(k), retain=RETAIN_STATE)
        else:
            t = f"{ROOT}/sensor/dust/livingroom/state"
            sensor_publish(client, t, d, retain=RETAIN_STATE)
    except Exception as e:
        print("⚠️ Dust read failed:", e)

    try:
        d = accel.read()
        if isinstance(d, dict):
            for k in ("x", "y", "z"):
                t = f"{ROOT}/sensor/accel/home/{k}/state"
                sensor_publish(client, t, d.get(k), retain=RETAIN_STATE)
        else:
            t = f"{ROOT}/sensor/accel/home/state"
            sensor_publish(client, t, d, retain=RETAIN_STATE)
    except Exception as e:
        print("⚠️ Accel read failed:", e)


# =========================
# MQTT callbacks
# =========================
def on_connect(client, userdata, flags, rc):
    print("✅ connected rc=", rc)
    client.subscribe(SET_SUB)
    print("✅ subscribed:", SET_SUB)

def on_disconnect(client, userdata, rc):
    # rc != 0 이면 비정상 종료(네트워크 끊김 등)
    print(f"⚠️ disconnected rc={rc} (will auto-reconnect if possible)")

def on_message(client, userdata, msg):
    payload_raw = msg.payload.decode("utf-8", errors="ignore")
    payload_norm = norm_payload(payload_raw)

    parsed = parse_set_topic(msg.topic)
    log_set(msg.topic, payload_raw, parsed)

    if not parsed:
        log_drop("topic-not-a-supported-set-pattern", msg.topic, payload_raw)
        return

    device, place = parsed

    # ---------------- Lamp ----------------
    if device == "lamp":
        key = f"lamp:{place}"
        if payload_norm in ("on", "1", "true"):
            if should_drop_debounced(key, "on"):
                log_drop("debounced", msg.topic, payload_raw); return
            lamp.on(place)
            publish_simple_state(client, "lamp", place, "on")
            print(f"💡 lamp.on({place})")
            return

        if payload_norm in ("off", "0", "false"):
            if should_drop_debounced(key, "off"):
                log_drop("debounced", msg.topic, payload_raw); return
            lamp.off(place)
            publish_simple_state(client, "lamp", place, "off")
            print(f"🌙 lamp.off({place})")
            return

        log_drop("unknown-lamp-payload", msg.topic, payload_raw)
        return

    # ---------------- Fan ----------------
    if device == "fan":
        key = f"fan:{place}"
        if payload_norm in ("on", "1", "true"):
            if should_drop_debounced(key, "on"):
                log_drop("debounced", msg.topic, payload_raw); return
            fan.on(place)
            publish_simple_state(client, "fan", place, "on")
            print(f"🌀 fan.on({place})")
            return

        if payload_norm in ("off", "0", "false"):
            if should_drop_debounced(key, "off"):
                log_drop("debounced", msg.topic, payload_raw); return
            fan.off(place)
            publish_simple_state(client, "fan", place, "off")
            print(f"🌀 fan.off({place})")
            return

        log_drop("unknown-fan-payload", msg.topic, payload_raw)
        return

    # ---------------- DoorLock ----------------
    if device == "doorlock":
        key = f"doorlock:{place}"
        if payload_norm in ("open", "unlock", "on", "1", "true"):
            if should_drop_debounced(key, "open"):
                log_drop("debounced", msg.topic, payload_raw); return
            doorlock.open()
            publish_simple_state(client, "doorlock", place, "open")
            print("🚪 doorlock.open()")
            return

        if payload_norm in ("close", "lock", "off", "0", "false"):
            if should_drop_debounced(key, "close"):
                log_drop("debounced", msg.topic, payload_raw); return
            doorlock.close()
            publish_simple_state(client, "doorlock", place, "close")
            print("🚪 doorlock.close()")
            return

        log_drop("unknown-doorlock-payload", msg.topic, payload_raw)
        return

    # ---------------- GasBreaker ----------------
    if device == "gasbreaker":
        key = f"gasbreaker:{place}"
        if payload_norm in ("open", "unlock", "on", "1", "true"):
            if should_drop_debounced(key, "open"):
                log_drop("debounced", msg.topic, payload_raw); return
            gasbreaker.open()
            publish_simple_state(client, "gasbreaker", place, "open")
            print("⛽ gasbreaker.open()")
            return

        if payload_norm in ("close", "lock", "off", "0", "false"):
            if should_drop_debounced(key, "close"):
                log_drop("debounced", msg.topic, payload_raw); return
            gasbreaker.close()
            publish_simple_state(client, "gasbreaker", place, "close")
            print("⛽ gasbreaker.close()")
            return

        log_drop("unknown-gasbreaker-payload", msg.topic, payload_raw)
        return

    # ---------------- Curtain ----------------
    if device == "curtain":
        key = f"curtain:{place}"
        if payload_norm in ("open", "on", "1", "true"):
            if should_drop_debounced(key, "open"):
                log_drop("debounced", msg.topic, payload_raw); return
            curtain.open()
            publish_simple_state(client, "curtain", place, "open")
            print("🪟 curtain.open()")
            return

        if payload_norm in ("close", "off", "0", "false"):
            if should_drop_debounced(key, "close"):
                log_drop("debounced", msg.topic, payload_raw); return
            curtain.close()
            publish_simple_state(client, "curtain", place, "close")
            print("🪟 curtain.close()")
            return

        if payload_norm in ("stop", "pause"):
            if should_drop_debounced(key, "stop"):
                log_drop("debounced", msg.topic, payload_raw); return
            curtain.stop()
            publish_simple_state(client, "curtain", place, "stop")
            print("🪟 curtain.stop()")
            return

        log_drop("unknown-curtain-payload", msg.topic, payload_raw)
        return

    # ---------------- MoodLamp ----------------
    if device == "moodlamp":
        key = f"moodlamp:{place}"

        if payload_norm in ("off", "0", "false"):
            if should_drop_debounced(key, "off"):
                log_drop("debounced", msg.topic, payload_raw); return
            moodlamp.off()
            publish_moodlamp_state(client, place, False)
            print("🌈 moodlamp.off()")
            return

        if payload_norm in ("on", "1", "true"):
            if should_drop_debounced(key, "on"):
                log_drop("debounced", msg.topic, payload_raw); return
            moodlamp.setColor(255, 255, 255)
            publish_moodlamp_state(client, place, True, 255, 255, 255)
            print("🌈 moodlamp.setColor(255,255,255) [plain-on]")
            return

        try:
            obj = json.loads(payload_raw)

            st = str(obj.get("state", "")).upper().strip()
            if st == "OFF":
                if should_drop_debounced(key, "off"):
                    log_drop("debounced", msg.topic, payload_raw); return
                moodlamp.off()
                publish_moodlamp_state(client, place, False)
                print("🌈 moodlamp.off() [json]")
                return

            color = obj.get("color")
            if isinstance(color, dict):
                r = int(color.get("r", color.get("red", 255)))
                g = int(color.get("g", color.get("green", 255)))
                b = int(color.get("b", color.get("blue", 255)))
            else:
                r = int(obj.get("r", obj.get("red", 255)))
                g = int(obj.get("g", obj.get("green", 255)))
                b = int(obj.get("b", obj.get("blue", 255)))

            sig = f"rgb({r},{g},{b})"
            if should_drop_debounced(key, sig):
                log_drop("debounced", msg.topic, payload_raw); return

            moodlamp.setColor(r, g, b)
            publish_moodlamp_state(client, place, True, r, g, b)
            print(f"🌈 moodlamp.setColor({r},{g},{b}) [debounced]")
            return

        except Exception as e:
            log_drop(f"moodlamp-json-parse-failed: {e}", msg.topic, payload_raw)
            return

    log_drop("unknown-device", msg.topic, payload_raw)


# =========================
# Main
# =========================
running = True

def _stop(*_):
    global running
    running = False

signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)

client = mqtt.Client()
client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_message = on_message

# ✅ paho 기본 자동 재연결 옵션 (안전)
client.reconnect_delay_set(min_delay=1, max_delay=10)

client.connect(BROKER, PORT, KEEPALIVE)
client.loop_start()

print("🚀 SAFE bridge running... Ctrl+C to stop")
print("   broker =", BROKER, "port =", PORT)
print("   root   =", ROOT)
print("   sub    =", f"{SET_SUB} (ONLY set)")
print("   sensors=", "ON" if ENABLE_SENSORS else "OFF", "bulk_interval=", SENSOR_INTERVAL)
print("   PIR    =", "poll", PIR_POLL_INTERVAL, "hold", PIR_HOLD_SEC, "sec", "retain=", RETAIN_PIR)
print("   debounce=", DEBOUNCE_SEC, "sec")
print("   sensor_change_only=", PUBLISH_SENSOR_ON_CHANGE)
print("   publish_place_first_state=", PUBLISH_PLACE_FIRST_STATE)

try:
    last_bulk = 0.0
    last_pir = 0.0

    while running:
        now = time.time()

        if ENABLE_SENSORS:
            if now - last_pir >= PIR_POLL_INTERVAL:
                publish_pir_fast(client)
                last_pir = now

            if now - last_bulk >= SENSOR_INTERVAL:
                publish_sensors_bulk(client)
                last_bulk = now

        time.sleep(0.01)

finally:
    client.loop_stop()
    client.disconnect()
    print("🛑 stopped")
