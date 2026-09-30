// Static test entities (user-defined)
export const dummyEntities = [
  // Synthetic Home fixture for RT-BEH-001: Door open -> Light on.
  {
    domain: 'binary_sensor',
    entity_id: 'binary_sensor.sb_test_door',
    state: 'off',
    attributes: {
      friendly_name: 'SB Test Door',
      device_class: 'door',
    },
  },
  {
    domain: 'light',
    entity_id: 'light.sb_test_light',
    state: 'off',
    attributes: {
      friendly_name: 'SB Test Light',
      supported_color_modes: ['onoff'],
      color_mode: 'onoff',
    },
  },
  {
    domain: 'input_datetime',
    entity_id: 'input_datetime.morning_start',
    state: '07:30:00',
    attributes: { friendly_name: 'Morning Start' },
  },
  {
    domain: 'time',
    entity_id: 'time.workday_start',
    state: '09:00:00',
    attributes: { friendly_name: 'Workday Start' },
  },
  {
    domain: 'sensor',
    entity_id: 'sensor.next_alarm_timestamp',
    state: '2026-02-16T07:30:00+00:00',
    attributes: {
      friendly_name: 'Next Alarm Timestamp',
      device_class: 'timestamp',
    },
  },
];
export const notifyDevices = [];
