import unittest

from ha_llm_control.llm_assistant.embedding import FastEmbedEntityRetriever


class FakeEmbeddingModel:
    def __init__(self):
        self.calls = []

    def embed(self, texts):
        self.calls.append(list(texts))
        vectors = []
        for text in texts:
            normalized = text.lower()
            vectors.append(
                [1.0, 0.0] if "livingroom" in normalized or "거실" in normalized else [0.0, 1.0]
            )
        return vectors


class FastEmbedEntityRetrieverTests(unittest.TestCase):
    def setUp(self):
        self.model = FakeEmbeddingModel()
        self.retriever = FastEmbedEntityRetriever(model_factory=lambda _name: self.model)
        self.cards = [
            {
                "entity_id": "light.livingroom_light",
                "friendly_name": "Livingroom Light",
                "domain": "light",
                "supported_actions": ["light.turn_on", "light.turn_off"],
            },
            {
                "entity_id": "switch.coffee_maker",
                "friendly_name": "Coffee Maker",
                "domain": "switch",
                "supported_actions": ["switch.turn_on"],
            },
        ]

    def test_ranks_multilingual_query_and_reuses_cached_card_vectors(self):
        first = self.retriever.rank("거실 조명을 켜줘", self.cards)
        self.assertEqual(first["ranking"][0]["entity_id"], "light.livingroom_light")
        self.assertEqual(first["cache"]["embedded_cards"], 2)
        self.assertEqual(first["cache"]["cache_hits"], 0)
        self.assertTrue(self.model.calls[0][0].startswith("passage: "))
        self.assertTrue(self.model.calls[1][0].startswith("query: "))

        second = self.retriever.rank("거실 조명 상태", self.cards)
        self.assertEqual(second["cache"]["embedded_cards"], 0)
        self.assertEqual(second["cache"]["cache_hits"], 2)
        self.assertEqual(len(self.model.calls), 3)

    def test_reembeds_only_changed_card(self):
        self.retriever.rank("거실 조명", self.cards)
        changed = [*self.cards]
        changed[1] = {**changed[1], "friendly_name": "Kitchen Coffee Maker"}
        result = self.retriever.rank("거실 조명", changed)
        self.assertEqual(result["cache"]["embedded_cards"], 1)
        self.assertEqual(result["cache"]["cache_hits"], 1)


if __name__ == "__main__":
    unittest.main()
