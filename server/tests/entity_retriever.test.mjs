import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rankEntitiesLexically,
  reciprocalRankFusion,
  resolveExplicitEntityReferences,
  retrieveEntityContext,
} from '../entity_retriever.mjs';

const cards = [
  { entity_id: 'light.living_room', friendly_name: 'Living Room Light', domain: 'light', area: 'Living Room', supported_actions: ['light.turn_on'] },
  { entity_id: 'switch.coffee', friendly_name: 'Coffee Maker', domain: 'switch', area: 'Kitchen', supported_actions: ['switch.turn_on'] },
  { entity_id: 'climate.bedroom', friendly_name: 'Bedroom Thermostat', domain: 'climate', area: 'Bedroom', supported_actions: ['climate.set_temperature'] },
];

test('lexical retrieval is deterministic and domain agnostic', () => {
  const ranked = rankEntitiesLexically('Set the bedroom thermostat temperature', cards);
  assert.equal(ranked[0].card.entity_id, 'climate.bedroom');
  assert.deepEqual(ranked.map(({ card }) => card.entity_id), [
    'climate.bedroom',
    'light.living_room',
    'switch.coffee',
  ]);
});

test('explicit entity resolution binds a unique name and asks before duplicate-name selection', () => {
  const result = resolveExplicitEntityReferences('Turn on the living room light', [
    ...cards,
    { entity_id: 'light.living_room_lamp', friendly_name: 'Living Room Light', domain: 'light', supported_actions: ['light.turn_on'] },
  ]);
  assert.deepEqual(result, [{
    reference: 'livingroomlight', status: 'ambiguous', evidence: 'multiple_normalized_name_matches',
    candidates: [
      { entity_id: 'light.living_room', name: 'Living Room Light', area: 'Living Room', domain: 'light' },
      { entity_id: 'light.living_room_lamp', name: 'Living Room Light', area: null, domain: 'light' },
    ],
  }]);

  const selected = resolveExplicitEntityReferences('Turn on the living room light', [
    ...cards,
    { entity_id: 'light.living_room_lamp', friendly_name: 'Living Room Light', domain: 'light', supported_actions: ['light.turn_on'] },
  ], { entity_references: { livingroomlight: 'light.living_room_lamp' } });
  assert.deepEqual(selected, [{
    reference: 'livingroomlight', status: 'resolved', entity_id: 'light.living_room_lamp',
    evidence: 'user_selected_candidate',
  }]);
});

test('hybrid retrieval uses dense multilingual evidence without a room dictionary', async () => {
  const result = await retrieveEntityContext('거실 조명을 켜줘', cards, {
    mode: 'hybrid',
    maxCards: 3,
    embed: async (inputs) => ({
      model: 'test-multilingual',
      embeddings: inputs.map((input, index) => (
        index === 0 || input.includes('light.living_room') ? [1, 0] : [0, 1]
      )),
    }),
  });
  assert.equal(result.method, 'hybrid_rrf');
  assert.equal(result.cards[0].entity_id, 'light.living_room');
});

test('hybrid retrieval falls back to lexical ranking when embeddings are unavailable', async () => {
  const result = await retrieveEntityContext('coffee maker', cards, {
    mode: 'hybrid',
    embed: async () => { throw new Error('model unavailable'); },
  });
  assert.equal(result.method, 'lexical');
  assert.equal(result.fallback, true);
  assert.equal(result.cards[0].entity_id, 'switch.coffee');
});

test('FastEmbed hybrid retrieval fuses a cached external multilingual ranking', async () => {
  const result = await retrieveEntityContext('거실 조명을 켜줘', cards, {
    mode: 'fastembed_hybrid',
    maxCards: 3,
    fastembed: async () => ({
      embedding_model: 'intfloat/multilingual-e5-small',
      cache: { cache_hits: 2, embedded_cards: 1 },
      ranking: [
        { entity_id: 'light.living_room', rank: 1, score: 0.91 },
        { entity_id: 'switch.coffee', rank: 2, score: 0.12 },
        { entity_id: 'climate.bedroom', rank: 3, score: 0.08 },
      ],
    }),
  });
  assert.equal(result.method, 'fastembed_hybrid_rrf');
  assert.equal(result.embedding_model, 'intfloat/multilingual-e5-small');
  assert.equal(result.cards[0].entity_id, 'light.living_room');
  assert.equal(result.cache.cache_hits, 2);
});

test('hybrid retrieval reserves bounded event and action candidates for ECA requests', async () => {
  const ecaCards = [
    ...Array.from({ length: 20 }, (_, index) => ({
      entity_id: `sensor.environment_${index}`,
      friendly_name: `Environment ${index}`,
      domain: 'sensor',
    })),
    { entity_id: 'binary_sensor.entry_motion', friendly_name: 'PIR (Entrance)', domain: 'binary_sensor', device_class: 'motion' },
    ...Array.from({ length: 7 }, (_, index) => ({
      entity_id: `fan.room_${index}`,
      friendly_name: `Room Fan ${index}`,
      domain: 'fan',
      supported_actions: ['fan.turn_on'],
    })),
    { entity_id: 'light.living_room', friendly_name: 'Livingroom Light', domain: 'light', supported_actions: ['light.turn_on'] },
  ];
  const result = await retrieveEntityContext('현관 센서가 감지되면 거실 불을 켜줘', ecaCards, {
    mode: 'fastembed_hybrid',
    maxCards: 24,
    fastembed: async () => ({
      ranking: ecaCards.map((card, index) => ({ entity_id: card.entity_id, rank: index + 1, score: 1 - index / 100 })),
    }),
  });
  assert.ok(result.cards.some(({ entity_id }) => entity_id === 'binary_sensor.entry_motion'));
  assert.ok(result.cards.some(({ entity_id }) => entity_id === 'light.living_room'));
});

test('FastEmbed retrieval failure safely falls back to lexical ranking', async () => {
  const result = await retrieveEntityContext('coffee maker', cards, {
    mode: 'fastembed_hybrid',
    fastembed: async () => { throw new Error('FastEmbed unavailable'); },
  });
  assert.equal(result.method, 'lexical');
  assert.equal(result.fallback, true);
  assert.equal(result.cards[0].entity_id, 'switch.coffee');
});

test('lexical fallback preserves domain diversity when no words match', async () => {
  const many = [
    ...Array.from({ length: 10 }, (_, index) => ({
      entity_id: `automation.rule_${index}`,
      friendly_name: `Rule ${index}`,
      domain: 'automation',
      supported_actions: ['automation.turn_on'],
    })),
    cards[0],
    cards[1],
  ];
  const result = await retrieveEntityContext('서로 일치하지 않는 요청', many, { maxCards: 3 });
  assert.deepEqual(
    new Set(result.cards.map(({ domain }) => domain)),
    new Set(['automation', 'light', 'switch']),
  );
});

test('RRF combines rankings without coupling to score scales', () => {
  const lexical = [{ card: cards[0] }, { card: cards[1] }];
  const dense = [{ card: cards[1] }, { card: cards[0] }];
  const fused = reciprocalRankFusion([lexical, dense]);
  assert.equal(fused.length, 2);
  assert.deepEqual(new Set(fused.map(({ card }) => card.entity_id)), new Set(['light.living_room', 'switch.coffee']));
});
