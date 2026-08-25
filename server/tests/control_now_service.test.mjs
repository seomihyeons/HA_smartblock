import assert from "node:assert/strict";
import test from "node:test";
import { createControlNowService } from "../control_now_service.mjs";

const lights = [
  {
    entity_id: "light.kitchen_ceiling",
    friendly_name: "Kitchen Ceiling",
    area: "Kitchen",
    domain: "light",
    supported_actions: ["light.turn_on", "light.turn_off"],
  },
  {
    entity_id: "light.kitchen_counter",
    friendly_name: "Kitchen Counter",
    area: "Kitchen",
    domain: "light",
    supported_actions: ["light.turn_on", "light.turn_off"],
  },
  {
    entity_id: "light.livingroom_light",
    friendly_name: "Livingroom Light",
    area: "Living Room",
    domain: "light",
    supported_actions: ["light.turn_on", "light.turn_off"],
  },
  {
    entity_id: "switch.fan",
    friendly_name: "Fan",
    area: "Kitchen",
    domain: "switch",
    supported_actions: [],
  },
];

function fixture(overrides = {}) {
  const calls = [];
  let time = 1000;
  let cards = structuredClone(lights);
  const service = createControlNowService({
    fetchEntityCards: async () => cards,
    callLightService: async (request) => { calls.push(request); },
    createId: () => "preview-1",
    now: () => time,
    ...overrides,
  });
  return {
    service,
    calls,
    setCards(value) { cards = value; },
    advance(ms) { time += ms; },
  };
}

test("previews and executes one explicit light action exactly once", async () => {
  const f = fixture();
  const preview = await f.service.preview({ command: "Turn on Kitchen Ceiling" });
  assert.equal(preview.status, "ready_to_execute");
  assert.equal(preview.service, "light.turn_on");
  assert.equal(preview.entity.entity_id, "light.kitchen_ceiling");

  const result = await f.service.execute({ execution_id: preview.execution_id });
  assert.equal(result.status, "success");
  assert.deepEqual(f.calls, [{ service: "light.turn_on", entity_id: "light.kitchen_ceiling" }]);
  await assert.rejects(
    f.service.execute({ execution_id: preview.execution_id }),
    (error) => error.code === "invalid_or_used_preview" && error.statusCode === 409,
  );
});

test("requires candidate selection for an ambiguous light target", async () => {
  const f = fixture();
  const ambiguous = await f.service.preview({ command: "Kitchen lights off" });
  assert.equal(ambiguous.status, "needs_confirmation");
  assert.deepEqual(
    ambiguous.candidates.map(({ entity_id }) => entity_id),
    ["light.kitchen_ceiling", "light.kitchen_counter"],
  );

  const selected = await f.service.preview({
    command: "Kitchen lights off",
    selected_entity_id: "light.kitchen_counter",
  });
  assert.equal(selected.status, "ready_to_execute");
  assert.equal(selected.entity.entity_id, "light.kitchen_counter");
  assert.equal(selected.service, "light.turn_off");
});

test("grounds a Korean room name against an English Home Assistant entity", async () => {
  const f = fixture();
  const preview = await f.service.preview({ command: "거실 불을 켜줘" });
  assert.equal(preview.status, "ready_to_execute");
  assert.equal(preview.service, "light.turn_on");
  assert.equal(preview.entity.entity_id, "light.livingroom_light");
});

test("rejects inferred, conditional, non-light, and forged selections", async () => {
  const f = fixture();
  await assert.rejects(f.service.preview({ command: "Make it comfortable" }), /Explicitly ask/);
  await assert.rejects(f.service.preview({ command: "When I arrive, turn on the light" }), /immediate/);
  await assert.rejects(f.service.preview({ command: "Turn on the fan" }), /supports only a light/);
  await assert.rejects(
    f.service.preview({ command: "Turn on the lights", selected_entity_id: "light.not_in_ha" }),
    /no longer an eligible candidate/,
  );
  assert.equal(f.calls.length, 0);
});

test("revalidates the entity against current Home Assistant cards before execution", async () => {
  const f = fixture();
  const preview = await f.service.preview({ command: "Turn off Kitchen Ceiling" });
  f.setCards(lights.filter(({ entity_id }) => entity_id !== "light.kitchen_ceiling"));
  await assert.rejects(
    f.service.execute({ execution_id: preview.execution_id }),
    (error) => error.code === "entity_revalidation_failed",
  );
  assert.equal(f.calls.length, 0);
});

test("surfaces Home Assistant service failures without allowing a retry", async () => {
  const f = fixture({
    callLightService: async () => { throw new Error("Home Assistant service request failed: 500"); },
  });
  const preview = await f.service.preview({ command: "Turn on Kitchen Ceiling" });
  await assert.rejects(f.service.execute({ execution_id: preview.execution_id }), /failed: 500/);
  await assert.rejects(
    f.service.execute({ execution_id: preview.execution_id }),
    (error) => error.code === "invalid_or_used_preview",
  );
});
