"""Local multilingual Entity Card retrieval with FastEmbed and a memory cache."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import math
import os
from threading import RLock
from typing import Any, Iterable


DEFAULT_MODEL = "intfloat/multilingual-e5-small"
MAX_ENTITY_CARDS = 512


class FastEmbedRetrievalError(RuntimeError):
    """A safe error suitable for returning to the local Node adapter."""


def _text(value: Any) -> str:
    return str(value or "").strip()


def _card_document(card: dict[str, Any]) -> str:
    return "\n".join((
        f"entity {_text(card.get('entity_id'))}",
        f"name {_text(card.get('friendly_name'))}",
        f"area {_text(card.get('area'))}",
        f"domain {_text(card.get('domain'))}",
        f"device class {_text(card.get('device_class'))}",
        "services " + " ".join(map(_text, card.get("supported_actions") or [])),
        "capabilities " + " ".join(map(_text, card.get("capabilities") or [])),
    ))


def _fingerprint(card: dict[str, Any]) -> str:
    document = _card_document(card)
    return sha256(document.encode("utf-8")).hexdigest()


def _cosine(left: Iterable[float], right: Iterable[float]) -> float:
    dot = left_norm = right_norm = 0.0
    for left_value, right_value in zip(left, right):
        left_number = float(left_value)
        right_number = float(right_value)
        dot += left_number * right_number
        left_norm += left_number * left_number
        right_norm += right_number * right_number
    if not left_norm or not right_norm:
        return -1.0
    return dot / math.sqrt(left_norm * right_norm)


@dataclass(frozen=True)
class CachedVector:
    fingerprint: str
    vector: tuple[float, ...]


class FastEmbedEntityRetriever:
    """Embeds a query per request and only changed Entity Cards on cache misses."""

    def __init__(self, model_name: str | None = None, model_factory: Any = None):
        self.model_name = _text(model_name) or os.environ.get("FASTEMBED_MODEL", DEFAULT_MODEL)
        self._model_factory = model_factory
        self._model: Any = None
        self._cache: dict[str, CachedVector] = {}
        self._lock = RLock()

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model
        try:
            if self._model_factory is not None:
                self._model = self._model_factory(self.model_name)
            else:
                from fastembed import TextEmbedding
                try:
                    self._model = TextEmbedding(model_name=self.model_name)
                except ValueError:
                    # multilingual-e5-small is distributed with an ONNX model but is
                    # not in every FastEmbed version's built-in registry.
                    from fastembed.common.model_description import ModelSource, PoolingType
                    TextEmbedding.add_custom_model(
                        model=self.model_name,
                        pooling=PoolingType.MEAN,
                        normalization=True,
                        sources=ModelSource(hf=self.model_name),
                        dim=384,
                        model_file="onnx/model.onnx",
                        description="Multilingual E5 small entity retrieval model",
                        license="mit",
                        size_in_gb=0.45,
                    )
                    self._model = TextEmbedding(model_name=self.model_name)
        except ModuleNotFoundError as exc:
            raise FastEmbedRetrievalError(
                "FastEmbed is not installed. Run: python -m pip install fastembed"
            ) from exc
        except Exception as exc:
            raise FastEmbedRetrievalError("FastEmbed model could not be initialized.") from exc
        return self._model

    def _embed(self, texts: list[str]) -> list[tuple[float, ...]]:
        if not texts:
            return []
        try:
            vectors = list(self._load_model().embed(texts))
            result = [tuple(float(value) for value in vector) for vector in vectors]
        except FastEmbedRetrievalError:
            raise
        except Exception as exc:
            raise FastEmbedRetrievalError("FastEmbed vector generation failed.") from exc
        if len(result) != len(texts) or not all(result):
            raise FastEmbedRetrievalError("FastEmbed returned invalid vectors.")
        return result

    def rank(self, query: str, cards: list[dict[str, Any]]) -> dict[str, Any]:
        normalized_query = _text(query)
        if not normalized_query:
            raise FastEmbedRetrievalError("A retrieval query is required.")
        if not isinstance(cards, list) or not cards or len(cards) > MAX_ENTITY_CARDS:
            raise FastEmbedRetrievalError("Entity Card count is outside the allowed retrieval range.")

        valid_cards: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for card in cards:
            entity_id = _text(card.get("entity_id") if isinstance(card, dict) else "")
            if not entity_id or entity_id in seen_ids:
                continue
            seen_ids.add(entity_id)
            valid_cards.append(card)
        if not valid_cards:
            raise FastEmbedRetrievalError("No valid Entity Cards were supplied.")

        with self._lock:
            missing_cards: list[tuple[str, str, dict[str, Any]]] = []
            vectors: dict[str, tuple[float, ...]] = {}
            cache_hits = 0
            for card in valid_cards:
                entity_id = _text(card["entity_id"])
                fingerprint = _fingerprint(card)
                cached = self._cache.get(entity_id)
                if cached and cached.fingerprint == fingerprint:
                    vectors[entity_id] = cached.vector
                    cache_hits += 1
                else:
                    missing_cards.append((entity_id, fingerprint, card))

            embedded = self._embed([f"passage: {_card_document(card)}" for _, _, card in missing_cards])
            for (entity_id, fingerprint, _), vector in zip(missing_cards, embedded):
                self._cache[entity_id] = CachedVector(fingerprint=fingerprint, vector=vector)
                vectors[entity_id] = vector

            query_vector = self._embed([f"query: {normalized_query}"])[0]
            scored = [
                (card, _cosine(query_vector, vectors[_text(card["entity_id"])]))
                for card in valid_cards
            ]

        scored.sort(key=lambda item: (-item[1], _text(item[0]["entity_id"])))
        return {
            "method": "fastembed",
            "embedding_model": self.model_name,
            "ranking": [
                {"entity_id": _text(card["entity_id"]), "rank": index + 1, "score": round(score, 8)}
                for index, (card, score) in enumerate(scored)
            ],
            "cache": {
                "cache_hits": cache_hits,
                "embedded_cards": len(missing_cards),
                "cached_cards": len(self._cache),
            },
        }


_retriever: FastEmbedEntityRetriever | None = None


def get_fastembed_retriever() -> FastEmbedEntityRetriever:
    global _retriever
    if _retriever is None:
        _retriever = FastEmbedEntityRetriever()
    return _retriever
