// Static test entities (user-defined)
export const dummyEntities = [
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
