import { afterEach } from 'node:test';
import { dummyEntities, notifyDevices } from '../../src/data/entities_index.js';

const savedEntities = [...dummyEntities];
const savedNotifyDevices = [...notifyDevices];

// Isolated unit-test fixtures; production always imports the bundled catalog.
export function setFixtureEntities(entities) {
  dummyEntities.splice(0, dummyEntities.length, ...entities.map((entity) => ({
    ...entity,
    domain: entity.domain || entity.entity_id.split('.')[0],
  })));
  notifyDevices.splice(0, notifyDevices.length);
}

afterEach(() => {
  dummyEntities.splice(0, dummyEntities.length, ...savedEntities);
  notifyDevices.splice(0, notifyDevices.length, ...savedNotifyDevices);
});
