# fetch_GOW.py
# ------------------------------------------------------------
# Scans automations/geekofweek/*.yaml and generates
# src/data/entities_geekofweek.js
# ------------------------------------------------------------

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, Iterable, List, Set


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent
GOW_ROOT = PROJECT_ROOT / "automations" / "geekofweek"
OUT_ENTITIES_JS = HERE / "entities_geekofweek.js"


# Accepts legacy mixed-case ids used in some example YAML files.
ENTITY_ID_RE = re.compile(r"^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$")
ENTITY_KEY_RE = re.compile(r"^(\s*)entity_id\s*:\s*(.*)$")
CONDITION_KEY_RE = re.compile(
    r"^(\s*)(?:-\s*)?condition\s*:\s*['\"]?([A-Za-z_]+)['\"]?(?:\s+#.*)?\s*$"
)
ATTRIBUTE_KEY_RE = re.compile(r"^(\s*)attribute\s*:\s*(.*)$")
NOTIFY_SERVICE_RE = re.compile(
    r"^\s*(?:-\s*)?(?:action|service|notify_service)\s*:\s*['\"]?notify\.([A-Za-z0-9_]+)['\"]?(?:\s+#.*)?\s*$"
)


DEFAULT_STATE_BY_DOMAIN: Dict[str, str] = {
    "light": "off",
    "switch": "off",
    "fan": "off",
    "lock": "locked",
    "cover": "closed",
    "media_player": "idle",
    "climate": "off",
    "camera": "idle",
    "sensor": "0",
    "binary_sensor": "off",
    "input_boolean": "off",
    "input_number": "0",
    "input_select": "None",
    "input_text": "",
    "person": "not_home",
    "sun": "below_horizon",
    "automation": "on",
    "alarm_control_panel": "disarmed",
    "button": "unknown",
    "calendar": "off",
    "event": "unknown",
    "group": "off",
    "humidifier": "off",
    "persistent_notification": "unknown",
    "select": "unknown",
    "vacuum": "docked",
    "valve": "closed",
}


def strip_quotes(v: str) -> str:
    s = v.strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1]
    return s


def to_name(entity_id: str) -> str:
    object_id = entity_id.split(".", 1)[1] if "." in entity_id else entity_id
    return object_id.replace("_", " ")


def parse_inline_entity_values(raw: str) -> List[str]:
    s = raw.strip()
    if not s:
        return []

    if s.startswith("[") and s.endswith("]"):
        inner = s[1:-1].strip()
        if not inner:
            return []
        parts = [p.strip() for p in inner.split(",")]
        return [strip_quotes(p) for p in parts if strip_quotes(p)]

    return [strip_quotes(s)]


def extract_entity_ids_from_lines(lines: List[str]) -> Set[str]:
    out: Set[str] = set()
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        m = ENTITY_KEY_RE.match(line)
        if not m:
            i += 1
            continue

        base_indent = len(m.group(1))
        tail = (m.group(2) or "").strip()

        # Case A) "entity_id: xxx" or "entity_id: [a,b]"
        if tail:
            for v in parse_inline_entity_values(tail):
                if ENTITY_ID_RE.match(v):
                    out.add(v)
            i += 1
            continue

        # Case B) multiline:
        # entity_id:
        #   - light.xxx
        #   light.xxx  (invalid YAML style but seen in source files)
        i += 1
        while i < n:
            next_line = lines[i]
            stripped = next_line.strip()

            if not stripped:
                i += 1
                continue

            indent = len(next_line) - len(next_line.lstrip(" "))
            if indent <= base_indent:
                break

            candidate = stripped
            if candidate.startswith("-"):
                candidate = candidate[1:].strip()
            elif ":" in candidate:
                # next key/value inside same parent map, stop entity_id list parsing
                break

            candidate = strip_quotes(candidate)
            if ENTITY_ID_RE.match(candidate):
                out.add(candidate)

            i += 1

    return out


def extract_notify_devices_from_lines(lines: List[str]) -> Set[str]:
    """Return custom notify service suffixes used by the source YAML."""
    return {
        match.group(1)
        for line in lines
        if (match := NOTIFY_SERVICE_RE.match(line))
    }


def extract_numeric_attributes_from_lines(lines: List[str]) -> Dict[str, Set[str]]:
    """Collect numeric-state attribute references declared by GOW YAML.

    GOW is a static corpus, not a live Home Assistant instance.  An attribute
    is therefore marked numeric only when the source explicitly uses it in a
    ``condition: numeric_state`` expression.  This provides enough schema
    evidence for Blockly's fixture dropdowns without guessing device data.
    """
    found: Dict[str, Set[str]] = {}
    i = 0

    while i < len(lines):
        match = CONDITION_KEY_RE.match(lines[i])
        if not match or match.group(2) != "numeric_state":
            i += 1
            continue

        base_indent = len(match.group(1))
        section = [lines[i]]
        i += 1
        while i < len(lines):
            line = lines[i]
            if line.strip():
                indent = len(line) - len(line.lstrip(" "))
                if indent <= base_indent:
                    break
            section.append(line)
            i += 1

        entity_ids = extract_entity_ids_from_lines(section)
        attribute = None
        for section_line in section[1:]:
            attribute_match = ATTRIBUTE_KEY_RE.match(section_line)
            if attribute_match:
                attribute = strip_quotes(attribute_match.group(2))
                break

        if attribute and ENTITY_ID_RE.match(attribute) is None:
            # Attribute names are not entity IDs; retain ordinary YAML keys
            # such as wind_speed while rejecting an empty value.
            for entity_id in entity_ids:
                found.setdefault(entity_id, set()).add(attribute)

    return found


def iter_yaml_files(root: Path) -> Iterable[Path]:
    for ext in ("*.yaml", "*.yml"):
        yield from root.rglob(ext)


def build_entities(
    entity_ids: Iterable[str],
    numeric_attributes: Dict[str, Set[str]],
) -> List[Dict[str, object]]:
    items: List[Dict[str, object]] = []
    for entity_id in sorted(set(entity_ids), key=lambda s: (s.split(".", 1)[0], s)):
        domain = entity_id.split(".", 1)[0]
        attributes: Dict[str, object] = {
            "friendly_name": to_name(entity_id),
        }
        # `0` is a fixture type marker, not a claimed live device value.
        for attribute in sorted(numeric_attributes.get(entity_id, set())):
            attributes[attribute] = 0

        item = {
            "entity_id": entity_id,
            "domain": domain,
            "name": to_name(entity_id),
            "state": DEFAULT_STATE_BY_DOMAIN.get(domain, "unknown"),
            "attributes": attributes,
        }
        items.append(item)
    return items


def write_entities_js(
    path: Path,
    entities: List[Dict[str, object]],
    notify_devices: Iterable[str],
) -> None:
    content = (
        "// AUTO-GENERATED by fetch_GOW.py\n"
        "// Source: automations/geekofweek/**/*.yaml\n\n"
        "export const dummyEntities = "
        + json.dumps(entities, ensure_ascii=False, indent=2)
        + ";\n\n"
        "export const notifyDevices = "
        + json.dumps(sorted(set(notify_devices)), ensure_ascii=False)
        + ";\n"
    )
    path.write_text(content, encoding="utf-8")


def main() -> None:
    if not GOW_ROOT.exists():
        raise RuntimeError(f"Path not found: {GOW_ROOT}")

    all_ids: Set[str] = set()
    notify_devices: Set[str] = set()
    numeric_attributes: Dict[str, Set[str]] = {}
    files = list(iter_yaml_files(GOW_ROOT))
    for file_path in files:
        text = file_path.read_text(encoding="utf-8")
        lines = text.replace("\r\n", "\n").split("\n")
        all_ids.update(extract_entity_ids_from_lines(lines))
        notify_devices.update(extract_notify_devices_from_lines(lines))
        for entity_id, attributes in extract_numeric_attributes_from_lines(lines).items():
            numeric_attributes.setdefault(entity_id, set()).update(attributes)

    entities = build_entities(all_ids, numeric_attributes)
    write_entities_js(OUT_ENTITIES_JS, entities, notify_devices)
    print(f"Scanned {len(files)} YAML files")
    print(f"Extracted {len(entities)} unique entity_id values")
    print(f"Extracted numeric attributes for {len(numeric_attributes)} entities")
    print(f"Extracted {len(notify_devices)} notify service targets")
    print(f"Wrote: {OUT_ENTITIES_JS}")


if __name__ == "__main__":
    main()
