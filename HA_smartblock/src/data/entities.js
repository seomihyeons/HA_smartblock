// src/data/entities.js

export const dummyEntities = [
  // --- LIGHTS (Light Domain) ---
  {
    entity_id: 'light.living_room_light',
    state: 'on',
    attributes: { friendly_name: 'Living Room Light', brightness: 180 }
  },
  {
    entity_id: 'light.kitchen_light',
    state: 'off',
    attributes: { friendly_name: 'Kitchen Light' }
  },
  {
    entity_id: 'light.bedroom_lamp',
    state: 'on',
    attributes: { friendly_name: 'Bedroom Lamp' }
  },
  {
    entity_id: 'light.hallway_light',
    state: 'off',
    attributes: { friendly_name: 'Hallway Light' }
  },

  // --- BINARY SENSORS (Binary_sensor Domain) ---
  {
    entity_id: 'binary_sensor.front_door_contact',
    state: 'off',
    attributes: { friendly_name: 'Front Door Sensor', device_class: 'door' }
  },
  {
    entity_id: 'binary_sensor.window_office_contact',
    state: 'on',
    attributes: { friendly_name: 'Office Window', device_class: 'window' }
  },
  {
    entity_id: 'binary_sensor.living_room_motion',
    state: 'off',
    attributes: { friendly_name: 'Living Room Motion Sensor', device_class: 'motion' }
  },
  {
    entity_id: 'binary_sensor.garage_door_sensor',
    state: 'on',
    attributes: { friendly_name: 'Garage Door Sensor', device_class: 'garage_door' }
  },

  // --- SENSORS (Sensor Domain) - Numeric State Target ---
  {
    entity_id: 'sensor.living_room_temperature',
    state: '23.5',
    attributes: { friendly_name: 'Living Room Temperature', unit_of_measurement: '°C' }
  },
  {
    entity_id: 'sensor.living_room_humidity',
    state: '45',
    attributes: { friendly_name: 'Living Room Humidity', unit_of_measurement: '%' }
  },
  {
    entity_id: 'sensor.weather_forecast_temperature',
    state: '28',
    attributes: { friendly_name: 'Weather Forecast Temperature', unit_of_measurement: '°C' }
  },
  {
    entity_id: 'sensor.power_consumption_today',
    state: '1.2',
    attributes: { friendly_name: 'Today Power Consumption', unit_of_measurement: 'kWh' }
  },
  {
    entity_id: 'sensor.server_cpu_temp',
    state: '55.8',
    attributes: { friendly_name: 'Server CPU Temperature', unit_of_measurement: '°C' }
  },
  {
    entity_id: 'sensor.dishwasher_power',
    state: '0.0',
    attributes: { friendly_name: 'Dishwasher Power', unit_of_measurement: 'W' }
  },

  // --- SWITCHES (Switch Domain) ---
  {
    entity_id: 'switch.tv_power',
    state: 'off',
    attributes: { friendly_name: 'TV Power' }
  },
  {
    entity_id: 'switch.coffee_maker',
    state: 'on',
    attributes: { friendly_name: 'Coffee Maker' }
  },

  // --- MEDIA PLAYERS (Media_player Domain) ---
  {
    entity_id: 'media_player.living_room_speaker',
    state: 'playing',
    attributes: { 
      friendly_name: 'Living Room Speaker', 
      media_title: 'Home Assistant Anthem',
      volume_level: 0.45
    }
  },
  {
    entity_id: 'media_player.bedroom_tv',
    state: 'standby',
    attributes: { friendly_name: 'Bedroom TV' }
  },

  // --- CLIMATE (Climate Domain) ---
  {
    entity_id: 'climate.main_thermostat',
    state: 'heat',
    attributes: { 
      friendly_name: 'Main Thermostat', 
      current_temperature: 21.0,
      temperature: 23.0
    }
  },

  // --- LOCKS (Lock Domain) ---
  {
    entity_id: 'lock.front_door_lock',
    state: 'locked',
    attributes: { friendly_name: 'Front Door Lock' }
  },

  // --- NUMERIC HELPERS & CONTROLS (Numeric State Targets) ---
  { 
    entity_id: 'input_number.target_heating_temp', 
    state: '21.0', 
    attributes: { friendly_name: 'Target Heating Temperature', unit_of_measurement: '°C' }
  },
  { 
    entity_id: 'counter.motion_count_today', 
    state: '45',
    attributes: { friendly_name: 'Daily Motion Count' } 
  },
  { 
    entity_id: 'number.office_fan_speed', 
    state: '3', 
    attributes: { friendly_name: 'Office Fan Speed', min: 0, max: 5 }
  },

  // --- ZONE (Numeric State Target for Count) ---
  { 
    entity_id: 'zone.home', 
    state: '2',
    attributes: { friendly_name: 'Home Zone (People Count)' } 
  },
];

export const notifyDevices = [
  'iphone_seunghak',
  'galaxy_s24',
  // 필요시 자유롭게 추가/수정
];