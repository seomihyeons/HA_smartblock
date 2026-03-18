#!/usr/bin/env python3
import argparse
import sys
import yaml
import json
import os
import ssl
import urllib.request
import urllib.error
import re
from collections import defaultdict, Counter
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional, Set, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

@dataclass(frozen=True)
class Event:
    kind: str
    entity_id: Optional[str]
    to: Optional[str]
    extra: Tuple[Tuple[str, Any], ...] = ()
    def label(self) -> str:
        base = f"{self.kind}"
        if self.entity_id:
            base += f"({self.entity_id}"
            if self.to is not None:
                base += f"→{self.to}"
            base += ")"
        if self.extra:
            base += f"[{dict(self.extra)}]"
        return base

@dataclass(frozen=True)
class Action:
    domain: str
    service: str
    entity_id: Optional[str]
    value: Optional[str] = None
    extra: Tuple[Tuple[str, Any], ...] = ()
    def label(self) -> str:
        base = f"{self.domain}.{self.service}"
        if self.entity_id:
            base += f"({self.entity_id}"
            if self.value is not None:
                base += f"={self.value}"
            base += ")"
        if self.extra:
            base += f"[{dict(self.extra)}]"
        return base

CONFLICT_CATALOG: Dict[Tuple[str, str], Set[Tuple[str, str]]] = {
    ("switch", "turn_on"):  {("switch", "turn_off")},
    ("switch", "turn_off"): {("switch", "turn_on")},
    ("light", "turn_on"):   {("light", "turn_off")},
    ("light", "turn_off"):  {("light", "turn_on")},
    ("lock", "lock"):       {("lock", "unlock")},
    ("lock", "unlock"):     {("lock", "lock")},
    ("cover", "open_cover"):  {("cover", "close_cover")},
    ("cover", "close_cover"): {("cover", "open_cover")},
    ("valve", "open_valve"):  {("valve", "close_valve")},
    ("valve", "close_valve"): {("valve", "open_valve")},
    ("media_player", "play"):  {("media_player", "stop"), ("media_player", "pause")},
    ("media_player", "stop"):  {("media_player", "play")},
    ("media_player", "mute"):  {("media_player", "unmute")},
    ("media_player", "unmute"):{("media_player", "mute")},
    ("climate", "set_hvac_mode:cool"): {("climate", "set_hvac_mode:heat")},
    ("climate", "set_hvac_mode:heat"): {("climate", "set_hvac_mode:cool")},
    ("homeassistant", "turn_on"): {("homeassistant", "turn_off")},
    ("homeassistant", "turn_off"): {("homeassistant", "turn_on")},
}

ACTION_STATE_EFFECTS: Dict[Tuple[str, str], str] = {
    ("switch", "turn_on"): "on",
    ("switch", "turn_off"): "off",
    ("light", "turn_on"): "on",
    ("light", "turn_off"): "off",
    ("lock", "lock"): "locked",
    ("lock", "unlock"): "unlocked",
    ("cover", "open_cover"): "open",
    ("cover", "close_cover"): "closed",
    ("valve", "open_valve"): "open",
    ("valve", "close_valve"): "closed",
    ("media_player", "play"): "playing",
    ("media_player", "stop"): "idle",
    ("media_player", "pause"): "paused",
    ("media_player", "mute"): "muted",
    ("media_player", "unmute"): "unmuted",
    ("climate", "set_hvac_mode"): "hvac_mode_changed",
}

def make_hashable(obj):
    if isinstance(obj, dict):
        return frozenset((k, make_hashable(v)) for k, v in obj.items())
    if isinstance(obj, list):
        return tuple(make_hashable(x) for x in obj)
    if isinstance(obj, set):
        return frozenset(make_hashable(x) for x in obj)
    if isinstance(obj, tuple):
        return tuple(make_hashable(x) for x in obj)
    return obj

_SURROGATE_RE = re.compile(r"[\ud800-\udfff]")
_BAD_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

def _sanitize_yaml_text(text: str) -> str:
    """
    PyYAML fails on lone UTF-16 surrogate chars and disallowed control chars.
    Replace them with U+FFFD so analysis can proceed instead of crashing.
    """
    if not isinstance(text, str) or not text:
        return ""
    text = _SURROGATE_RE.sub("\uFFFD", text)
    text = _BAD_CTRL_RE.sub("\uFFFD", text)
    return text

def _normalize_event(trigger: Dict[str, Any]) -> List[Event]:
    if trigger.get("platform") == "state" or trigger.get("type") == "state" or trigger.get("trigger") == "state":
        entity = trigger.get("entity_id")
        to = trigger.get("to")
        if isinstance(entity, list):
            return [Event(
                kind="state",
                entity_id=e,
                to=to,
                extra=make_hashable(tuple(sorted({
                    k: v for k, v in trigger.items()
                    if k not in ("platform", "entity_id", "to", "from")
                }.items())))
            ) for e in entity]
        return [Event(
            kind="state",
            entity_id=entity,
            to=to,
            extra=make_hashable(tuple(sorted({
                k: v for k, v in trigger.items()
                if k not in ("platform", "entity_id", "to", "from")
            }.items())))
        )]
    kind = trigger.get("platform", "event")
    name = trigger.get("event_type")
    extra = dict(trigger)
    return [Event(
        kind=kind if not name else f"{kind}:{name}",
        entity_id=None,
        to=None,
        extra=make_hashable(tuple(sorted(extra.items())))
    )]

def _normalize_action(step: Dict[str, Any]) -> List[Action]:
    out: List[Action] = []
    if "service" in step or "action" in step:
        service = step.get("service") or step.get("action")
        if isinstance(service, str) and "." in service:
            domain, svc = service.split(".", 1)
        else:
            domain, svc = "unknown", str(service)

        entity = None
        if "entity_id" in step:
            entity = step["entity_id"]
        elif "target" in step and isinstance(step["target"], dict):
            entity = step["target"].get("entity_id")

        entities = entity if isinstance(entity, list) else [entity]

        for e in entities:
            value = None
            if (domain, svc) in ACTION_STATE_EFFECTS:
                value = ACTION_STATE_EFFECTS[(domain, svc)]
            elif domain == "climate" and svc == "set_hvac_mode":
                mode = step.get("data", {}).get("hvac_mode") or step.get("data_template", {}).get("hvac_mode")
                value = "cool" if mode == "cool" else ("heat" if mode == "heat" else "hvac_mode_changed")

            extra = tuple(sorted({
                k: make_hashable(v)
                for k, v in step.items()
                if k not in ("service", "entity_id", "target", "data", "data_template")
            }.items()))
            out.append(Action(domain=domain, service=svc, entity_id=e, value=value, extra=extra))

    elif "choose" in step and isinstance(step["choose"], list):
        for choice in step["choose"]:
            for act in choice.get("sequence", []):
                out.extend(_normalize_action(act))
        if "default" in step:
            for act in step["default"]:
                out.extend(_normalize_action(act))

    elif "repeat" in step and isinstance(step["repeat"], dict):
        for act in step["repeat"].get("sequence", []):
            out.extend(_normalize_action(act))

    return make_hashable(out)

def parse_ha_automations(yaml_text: str) -> List[Dict[str, Any]]:
    safe_yaml_text = _sanitize_yaml_text(yaml_text)
    docs = list(yaml.safe_load_all(safe_yaml_text))
    automations: List[Dict[str, Any]] = []
    for doc in docs:
        if isinstance(doc, list):
            automations.extend(doc)
        elif isinstance(doc, dict) and "automation" in doc:
            automations.extend(doc["automation"])
        elif isinstance(doc, dict):
            automations.append(doc)
    return automations

class EFG:
    def __init__(self):
        self.events: Set[Event] = set()
        self.actions: Set[Action] = set()
        self.id_map: Dict[Any, int] = {}
        self.rev_id_map: Dict[int, Any] = {}
        self.next_id = 0
        self.edges: Dict[int, Set[int]] = defaultdict(set)

    def _get_id(self, node: Any) -> int:
        if node not in self.id_map:
            idx = self.next_id
            self.id_map[node] = idx
            self.rev_id_map[idx] = node
            self.next_id += 1
        return self.id_map[node]

    def add_event(self, e: Event) -> int:
        self.events.add(e)
        return self._get_id(("E", e))

    def add_action(self, a: Action) -> int:
        self.actions.add(a)
        return self._get_id(("A", a))

    def add_edge(self, src: Any, dst: Any):
        s = self._get_id(src)
        d = self._get_id(dst)
        self.edges[s].add(d)

    def nodes(self) -> List[int]:
        return list(self.rev_id_map.keys())

    def label(self, node_id: int) -> str:
        kind, obj = self.rev_id_map[node_id]
        prefix = "E:" if kind == "E" else "A:"
        return prefix + obj.label()

def build_efg(automations: List[Dict[str, Any]]) -> EFG:
    g = EFG()
    rules: List[Tuple[List[Event], List[Action], str]] = []

    for i, auto in enumerate(automations):
        name = str(auto.get("alias") or auto.get("id") or auto.get("description") or f"rule_{i}")
        triggers = auto.get("trigger") or auto.get("triggers") or []
        triggers = triggers if isinstance(triggers, list) else [triggers]
        events: List[Event] = []
        for t in triggers:
            events.extend(_normalize_event(t))

        steps = auto.get("action") or auto.get("sequence") or auto.get("actions") or []
        steps = steps if isinstance(steps, list) else [steps]
        actions: List[Action] = []
        for s in steps:
            actions.extend(_normalize_action(s))

        if not events or not actions:
            continue

        for a in actions:
            rules.append((events, [a], name))

    for evs, acts, _name in rules:
        for e in evs:
            for a in acts:
                g.add_edge(("E", e), ("A", a))
                g.add_event(e)
                g.add_action(a)

    all_events = list(g.events)
    for a in list(g.actions):
        resulting_state = a.value
        for e in all_events:
            if e.kind == "state" and e.entity_id and a.entity_id and e.entity_id == a.entity_id:
                if e.to is None or resulting_state is None or e.to == resulting_state:
                    g.add_edge(("A", a), ("E", e))
    return g

def tarjan_scc(nodes: List[int], edges: Dict[int, Set[int]]) -> List[List[int]]:
    index = 0
    indices: Dict[int, int] = {}
    lowlink: Dict[int, int] = {}
    stack: List[int] = []
    onstack: Set[int] = set()
    sccs: List[List[int]] = []

    def strongconnect(v: int):
        nonlocal index
        indices[v] = index
        lowlink[v] = index
        index += 1
        stack.append(v)
        onstack.add(v)
        for w in edges.get(v, set()):
            if w not in indices:
                strongconnect(w)
                lowlink[v] = min(lowlink[v], lowlink[w])
            elif w in onstack:
                lowlink[v] = min(lowlink[v], indices[w])
        if lowlink[v] == indices[v]:
            comp: List[int] = []
            while True:
                w = stack.pop()
                onstack.remove(w)
                comp.append(w)
                if w == v:
                    break
            sccs.append(comp)

    for v in nodes:
        if v not in indices:
            strongconnect(v)
    return sccs

def reachable_actions_from_event(g: EFG, start_event_id: int, path_limit: int = 6) -> Counter:
    counts: Counter = Counter()

    def dfs(node_id: int, depth: int, visited: List[int]):
        if depth > path_limit:
            return
        kind, _obj = g.rev_id_map[node_id]
        if kind == "A":
            counts[node_id] += 1
        for nxt in g.edges.get(node_id, set()):
            if nxt in visited:
                continue
            dfs(nxt, depth + 1, visited + [nxt])

    dfs(start_event_id, 0, [start_event_id])
    return counts

def _conflict_key(a: Action) -> Tuple[str, str]:
    if a.domain == "climate" and a.service == "set_hvac_mode":
        mode = a.value if a.value in ("cool", "heat") else "other"
        return (a.domain, f"{a.service}:{mode}")
    return (a.domain, a.service)

def detect_inconsistency(g: EFG) -> List[Dict[str, Any]]:
    issues = []
    for e in g.events:
        e_id = g._get_id(("E", e))
        multiset = reachable_actions_from_event(g, e_id, path_limit=6)
        actions = [g.rev_id_map[a_id][1] for a_id in multiset.keys()]
        by_entity: Dict[Optional[str], List[Action]] = defaultdict(list)
        for a in actions:
            by_entity[a.entity_id].append(a)
        for entity, acts in by_entity.items():
            n = len(acts)
            for i in range(n):
                for j in range(i + 1, n):
                    a1, a2 = acts[i], acts[j]
                    k1, k2 = _conflict_key(a1), _conflict_key(a2)
                    if (k1 in CONFLICT_CATALOG and k2 in CONFLICT_CATALOG[k1]) or \
                       (k2 in CONFLICT_CATALOG and k1 in CONFLICT_CATALOG[k2]):
                        issues.append({
                            "event": g.label(e_id),
                            "action1": a1.label(),
                            "action2": a2.label(),
                            "entity": entity,
                            "issue": "Inconsistency"
                        })
    return issues

def analyze_ha_automations(yaml_text: str) -> Dict[str, Any]:
    automations = parse_ha_automations(yaml_text)
    g = build_efg(automations)
    inconsistency = detect_inconsistency(g)
    return {
        "summary": {
            "automations": len(automations),
            "events": len(g.events),
            "actions": len(g.actions),
            "edges": sum(len(v) for v in g.edges.values()),
            "inconsistency_issues": len(inconsistency),
        },
        "inconsistency": inconsistency,
    }

def _ha_get_json(base_url: str, token: str, path: str) -> Any:
    url = base_url.rstrip("/") + path
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    ctx = None
    if url.lower().startswith("https://"):
        verify = os.getenv("HA_SSL_VERIFY", "true").strip().lower() not in ("0", "false", "no")
        if not verify:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
        data = resp.read().decode("utf-8", errors="replace")
        return json.loads(data) if data else None

def _pull_editable_automations_from_ha(base_url: str, token: str, only_enabled: bool, concurrency: int) -> List[Dict[str, Any]]:
    states = _ha_get_json(base_url, token, "/api/states")
    autos = []
    for s in states or []:
        eid = str(s.get("entity_id") or "")
        if not eid.startswith("automation."):
            continue
        attrs = s.get("attributes") or {}
        aid = attrs.get("id")
        if not aid:
            continue
        st = str(s.get("state") or "")
        autos.append({"id": str(aid), "state": st})

    if only_enabled:
        autos = [a for a in autos if a["state"].lower() == "on"]

    def fetch_one(a):
        cfg = _ha_get_json(base_url, token, "/api/config/automation/config/" + urllib.parse.quote(a["id"]))
        return cfg

    configs: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
        futs = [ex.submit(fetch_one, a) for a in autos]
        for fut in as_completed(futs):
            try:
                cfg = fut.result()
                if isinstance(cfg, dict):
                    configs.append(cfg)
            except Exception:
                pass
    return configs

def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="infile")
    p.add_argument("--out", dest="outfile")
    p.add_argument("--ha", action="store_true")
    p.add_argument("--ha_base", dest="ha_base")
    p.add_argument("--ha_token", dest="ha_token")
    p.add_argument("--only_enabled", action="store_true", default=True)
    p.add_argument("--concurrency", type=int, default=3)
    args = p.parse_args(argv)

    if args.ha:
        base_url = args.ha_base or os.getenv("HA_BASE_URL") or ""
        token = args.ha_token or os.getenv("HA_TOKEN") or ""
        if not base_url or not token:
            raise SystemExit("Missing HA_BASE_URL / HA_TOKEN")
        configs = _pull_editable_automations_from_ha(
            base_url=base_url,
            token=token,
            only_enabled=bool(args.only_enabled),
            concurrency=int(args.concurrency),
        )
        yaml_text = yaml.safe_dump(configs, allow_unicode=True, sort_keys=False)
    else:
        if args.infile:
            with open(args.infile, "r", encoding="utf-8", errors="replace") as f:
                yaml_text = f.read()
        else:
            # Read raw bytes and force UTF-8 with replacement to avoid
            # locale/encoding-induced surrogate characters on Windows.
            yaml_text = sys.stdin.buffer.read().decode("utf-8", errors="replace")

    report = analyze_ha_automations(yaml_text)
    # Keep stdout ASCII-safe on Windows consoles with legacy encodings.
    out_json = json.dumps(report, ensure_ascii=True, indent=2)

    if args.outfile and args.outfile.strip().lower() == "stdout":
        print(out_json)
    elif args.outfile:
        with open(args.outfile, "w", encoding="utf-8") as f:
            f.write(out_json)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
