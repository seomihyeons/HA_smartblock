import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAssistantRequest,
  createAssistantRequestRouter,
} from "../assistant_request_router.mjs";

test("routes conditional and scheduled requests to automation drafting", () => {
  assert.equal(
    classifyAssistantRequest("현관에서 움직임이 감지되면 거실 불을 켜줘"),
    "automation",
  );
  assert.equal(classifyAssistantRequest("매일 밤 11시에 조명을 꺼줘"), "automation");
  assert.equal(
    classifyAssistantRequest("When entrance motion is detected, turn on the living room light"),
    "automation",
  );
});

test("routes explicit Korean and English light commands to control preview", () => {
  assert.equal(classifyAssistantRequest("거실 불을 켜줘"), "immediate_control");
  assert.equal(classifyAssistantRequest("Turn off the kitchen light"), "immediate_control");
});

test("keeps abstract and unsupported goals in the safe drafting path", () => {
  assert.equal(classifyAssistantRequest("잠들 준비를 해줘"), "automation");
  assert.equal(classifyAssistantRequest("현관문을 잠가줘"), "automation");
});

test("automation evidence takes precedence over an embedded light action", () => {
  assert.equal(
    classifyAssistantRequest("If I arrive, switch on the entrance lamp"),
    "automation",
  );
});

test("delegates to only the selected handler and preserves selections", async () => {
  const calls = [];
  const router = createAssistantRequestRouter({
    createDraft: async (payload) => {
      calls.push(["draft", payload]);
      return { status: "success" };
    },
    previewControl: async (payload) => {
      calls.push(["control", payload]);
      return { status: "ready_to_execute" };
    },
  });

  const control = await router.handle({
    command: "Turn on the kitchen light",
    selected_entity_id: "light.kitchen",
  });
  assert.equal(control.intent, "immediate_control");
  assert.equal(control.status, "ready_to_execute");
  assert.deepEqual(calls[0], ["control", {
    command: "Turn on the kitchen light",
    selected_entity_id: "light.kitchen",
  }]);

  const draft = await router.handle({
    command: "When motion is detected, turn on the light",
    selections: { trigger_entity_id: "binary_sensor.motion" },
  });
  assert.equal(draft.intent, "automation");
  assert.equal(draft.status, "success");
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], "draft");
});
