// src/data/entities.js

export const dummyEntities = [
  // --- LIGHTS (Light Domain) --- (기존 예시)
  {
    entity_id: 'light.living_room_light',
    state: 'on',
    attributes: { friendly_name: 'Living Room Light', brightness: 180 }
  },
  {
    entity_id: 'light.kitchen_light',
    state: { is_on: 'off', colormode: 'red' },
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
  {
    entity_id: 'light.Aroom_light',
    state: 'off',
    attributes: { friendly_name: 'Hallway Light' }
  },

  // --- BINARY SENSORS (Binary_sensor Domain) --- (기존 예시)
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

  // --- SENSORS (Sensor Domain) - Numeric State Target --- (기존 예시)
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

  // --- SWITCHES (Switch Domain) --- (기존 예시)
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

  // --- MEDIA PLAYERS (Media_player Domain) --- (기존 예시)
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

  // --- CLIMATE (Climate Domain) --- (기존 예시)
  {
    entity_id: 'climate.main_thermostat',
    state: 'heat',
    attributes: {
      friendly_name: 'Main Thermostat',
      current_temperature: 21.0,
      temperature: 23.0
    }
  },

  // --- LOCKS (Lock Domain) --- (기존 예시)
  {
    entity_id: 'lock.front_door_lock',
    state: 'locked',
    attributes: { friendly_name: 'Front Door Lock' }
  },

  // --- NUMERIC HELPERS & CONTROLS (Numeric State Targets) --- (기존 예시)
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

  // --- ZONE (Numeric State Target for Count) --- (기존 예시)
  {
    entity_id: 'zone.home',
    state: '2',
    attributes: { friendly_name: 'Home Zone (People Count)' }
  },

  // ============================================================
  // ========== README 기반 추가 엔터티들 (대표 샘플) ==========
  // ============================================================

  // === Lighting (README) ===
  {
    entity_id: 'light.philips_hue_color_1',
    state: 'on',
    attributes: {
      friendly_name: 'Philips Hue Color Bulb',
      manufacturer: 'Philips',
      supported_color_modes: ['hs', 'brightness']
    }
  },
  {
    entity_id: 'light.philips_hue_lightstrip_plus',
    state: 'off',
    attributes: {
      friendly_name: 'Hue LightStrip Plus',
      manufacturer: 'Philips',
      supported_color_modes: ['hs']
    }
  },
  {
    entity_id: 'light.philips_hue_white_1',
    state: 'on',
    attributes: {
      friendly_name: 'Philips Hue White Bulb',
      manufacturer: 'Philips'
    }
  },
  {
    entity_id: 'light.cree_connected_1',
    state: 'off',
    attributes: {
      friendly_name: 'Cree Connected Bulb',
      manufacturer: 'Cree'
    }
  },
  {
    entity_id: 'light.lutron_caseta_dimmer_1',
    state: 'on',
    attributes: {
      friendly_name: 'Lutron Caseta Dimmer',
      integration: 'lutron_caseta'
    }
  },
  {
    entity_id: 'light.lutron_caseta_switch_1',
    state: 'off',
    attributes: {
      friendly_name: 'Lutron Caseta Switch',
      integration: 'lutron_caseta'
    }
  },
  {
    entity_id: 'light.lutron_pico_remote_1',
    state: 'on',
    attributes: {
      friendly_name: 'Lutron Pico Remote Light',
      note: 'Actually remote, but exposed as light helper in some setups'
    }
  },
  {
    entity_id: 'light.lutron_aurora_1',
    state: 'off',
    attributes: {
      friendly_name: 'Lutron Aurora Dimmer',
      integration: 'zigbee2mqtt'
    }
  },
  {
    entity_id: 'light.lifx_mini_white_1',
    state: 'on',
    attributes: {
      friendly_name: 'LIFX Mini White',
      manufacturer: 'LIFX'
    }
  },
  {
    entity_id: 'light.philips_color_a19_1',
    state: 'off',
    attributes: {
      friendly_name: 'Philips Color A19',
      integration: 'wiz'
    }
  },

  // === Climate (README) ===
  {
    entity_id: 'climate.ecobee_main',
    state: 'cool',
    attributes: {
      friendly_name: 'Ecobee 3 Thermostat',
      current_temperature: 22.0,
      temperature: 24.0,
      hvac_mode: 'cool'
    }
  },
  {
    entity_id: 'sensor.ecobee_room_sensor_living_room',
    state: '22.5',
    attributes: {
      friendly_name: 'Ecobee Living Room Sensor',
      unit_of_measurement: '°C'
    }
  },
  {
    entity_id: 'fan.dyson_pure_hotcool',
    state: 'on',
    attributes: {
      friendly_name: 'Dyson Pure Hot+Cool Link',
      oscillating: true,
      percentage: 60
    }
  },
  {
    entity_id: 'sensor.garage_ds18b20_temperature',
    state: '18.3',
    attributes: {
      friendly_name: 'Garage Temperature Probe',
      unit_of_measurement: '°C'
    }
  },

  // === Outlets & Switches (README) ===
  {
    entity_id: 'switch.wemo_mini_1',
    state: 'off',
    attributes: {
      friendly_name: 'Wemo Mini Smart Plug',
      integration: 'wemo'
    }
  },
  {
    entity_id: 'switch.ge_zwave_outdoor_module_1',
    state: 'on',
    attributes: {
      friendly_name: 'GE Z-Wave Outdoor Module',
      integration: 'zwave_js'
    }
  },
  {
    entity_id: 'switch.remotec_dry_contact_fireplace',
    state: 'off',
    attributes: {
      friendly_name: 'Gas Fireplace Switch',
      integration: 'zwave_js'
    }
  },
  {
    entity_id: 'switch.dome_water_shutoff',
    state: 'off',
    attributes: {
      friendly_name: 'Water Shut-Off Valve',
      integration: 'zwave_js'
    }
  },
  {
    entity_id: 'switch.kasa_outdoor_plug',
    state: 'off',
    attributes: {
      friendly_name: 'Kasa Outdoor Smart Plug',
      integration: 'tplink'
    }
  },
  {
    entity_id: 'switch.kasa_bike_charger_1',
    state: 'on',
    attributes: {
      friendly_name: 'Kasa Bike Charger 1',
      integration: 'tplink',
      device_class: 'outlet'
    }
  },
  {
    entity_id: 'switch.kasa_smart_plug_1',
    state: 'off',
    attributes: {
      friendly_name: 'Kasa Smart Plug Mini',
      integration: 'tplink'
    }
  },
  {
    entity_id: 'switch.kasa_power_strip_1',
    state: 'on',
    attributes: {
      friendly_name: 'Kasa Power Strip',
      integration: 'tplink'
    }
  },

  // === Locks (README) ===
  {
    entity_id: 'lock.front_door',
    state: 'locked',
    attributes: {
      friendly_name: 'Schlage Front Door Lock',
      integration: 'zwave_js'
    }
  },

  // === Security (README) ===
  {
    entity_id: 'binary_sensor.front_door_opened',
    state: 'off',
    attributes: {
      friendly_name: 'Front Door Opened',
      device_class: 'door'
    }
  },
  {
    entity_id: 'binary_sensor.back_door_opened',
    state: 'off',
    attributes: {
      friendly_name: 'Back Door Opened',
      device_class: 'door'
    }
  },
  {
    entity_id: 'switch.alarm_siren',
    state: 'off',
    attributes: {
      friendly_name: 'GoControl Siren and Strobe',
      device_class: 'switch'
    }
  },

  // === Voice Assistant (README) ===
  {
    entity_id: 'media_player.echo_living_room',
    state: 'idle',
    attributes: {
      friendly_name: 'Amazon Echo Living Room',
      integration: 'cloud'
    }
  },
  {
    entity_id: 'media_player.echo_dot_kitchen',
    state: 'idle',
    attributes: {
      friendly_name: 'Amazon Echo Dot Kitchen',
      integration: 'cloud'
    }
  },
  {
    entity_id: 'media_player.echo_spot_bedroom',
    state: 'idle',
    attributes: {
      friendly_name: 'Amazon Echo Spot',
      integration: 'cloud'
    }
  },
  {
    entity_id: 'media_player.echo_show_living_room',
    state: 'idle',
    attributes: {
      friendly_name: 'Amazon Echo Show',
      integration: 'cloud'
    }
  },
  {
    entity_id: 'media_player.echo_show5_office',
    state: 'idle',
    attributes: {
      friendly_name: 'Amazon Echo Show 5',
      integration: 'cloud'
    }
  },

  // === Media (README) ===
  {
    entity_id: 'media_player.apple_tv_living_room',
    state: 'playing',
    attributes: {
      friendly_name: 'Apple TV 4K Living Room',
      source: 'Netflix'
    }
  },
  {
    entity_id: 'media_player.sonos_arc',
    state: 'paused',
    attributes: {
      friendly_name: 'Sonos Arc',
      volume_level: 0.35
    }
  },
  {
    entity_id: 'media_player.sonos_sub',
    state: 'playing',
    attributes: {
      friendly_name: 'Sonos Sub'
    }
  },
  {
    entity_id: 'media_player.sonos_play_1_1',
    state: 'playing',
    attributes: {
      friendly_name: 'Sonos Play:1 Kitchen'
    }
  },
  {
    entity_id: 'media_player.sonos_one_sl_1',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos One SL'
    }
  },
  {
    entity_id: 'media_player.sonos_move_1',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Move'
    }
  },
  {
    entity_id: 'media_player.sonos_roam_1',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Roam'
    }
  },
  {
    entity_id: 'media_player.sonos_beam_1',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Beam'
    }
  },
  {
    entity_id: 'media_player.sonos_port',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Port'
    }
  },
  {
    entity_id: 'media_player.sonos_connect_amp',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Connect:AMP'
    }
  },
  {
    entity_id: 'remote.living_room_tv',
    state: 'on',
    attributes: {
      friendly_name: 'Logitech Harmony Living Room',
      current_activity: 'Watch TV'
    }
  },
  {
    entity_id: 'media_player.samsung_qn75q80ta',
    state: 'off',
    attributes: {
      friendly_name: 'Samsung QN75Q80TA'
    }
  },
  {
    entity_id: 'media_player.lg_oled55bxpua',
    state: 'off',
    attributes: {
      friendly_name: 'LG OLED55BXPUA'
    }
  },
  {
    entity_id: 'media_player.plex_server',
    state: 'idle',
    attributes: {
      friendly_name: 'Plex Media Server'
    }
  },

  // === Sensors (README) ===
  {
    entity_id: 'sensor.nest_protect_living_room_smoke',
    state: 'ok',
    attributes: {
      friendly_name: 'Nest Protect Living Room Smoke',
      device_class: 'smoke'
    }
  },
  {
    entity_id: 'sensor.nest_protect_living_room_co',
    state: 'ok',
    attributes: {
      friendly_name: 'Nest Protect Living Room CO',
      device_class: 'carbon_monoxide'
    }
  },
  {
    entity_id: 'binary_sensor.dome_motion_living_room',
    state: 'off',
    attributes: {
      friendly_name: 'Dome Motion Living Room',
      device_class: 'motion'
    }
  },
  {
    entity_id: 'binary_sensor.dome_leak_sensor_1',
    state: 'off',
    attributes: {
      friendly_name: 'Dome Leak Sensor 1',
      device_class: 'moisture'
    }
  },
  {
    entity_id: 'binary_sensor.aeon_water_sensor_1',
    state: 'off',
    attributes: {
      friendly_name: 'Aeon Water Sensor 1',
      device_class: 'moisture'
    }
  },
  {
    entity_id: 'binary_sensor.ecolink_window_sensor_1',
    state: 'off',
    attributes: {
      friendly_name: 'Ecolink Window Sensor 1',
      device_class: 'window'
    }
  },
  {
    entity_id: 'sensor.flume_water_usage_main',
    state: '3.4',
    attributes: {
      friendly_name: 'Flume Main Water Usage',
      unit_of_measurement: 'gal'
    }
  },

  // === Cameras (README) ===
  {
    entity_id: 'camera.front_door',
    state: 'streaming',
    attributes: {
      friendly_name: 'Unifi G4 Doorbell Pro'
    }
  },
  {
    entity_id: 'camera.driveway',
    state: 'streaming',
    attributes: {
      friendly_name: 'Unifi G4 Pro'
    }
  },
  {
    entity_id: 'camera.backyard',
    state: 'streaming',
    attributes: {
      friendly_name: 'Unifi G4 Bullet'
    }
  },
  {
    entity_id: 'camera.g4_flex_1',
    state: 'streaming',
    attributes: {
      friendly_name: 'Unifi G4 Flex 1'
    }
  },
  {
    entity_id: 'camera.g3_flex_1',
    state: 'idle',
    attributes: {
      friendly_name: 'Unifi G3 Flex'
    }
  },
  {
    entity_id: 'camera.g3_instant_1',
    state: 'streaming',
    attributes: {
      friendly_name: 'Unifi G3 Instant'
    }
  },
  {
    entity_id: 'camera.g4_instant_1',
    state: 'streaming',
    attributes: {
      friendly_name: 'Unifi G4 Instant'
    }
  },
  {
    entity_id: 'camera.garage',
    state: 'streaming',
    attributes: {
      friendly_name: 'Garage Camera'
    }
  },

  // === Garage (README) ===
  {
    entity_id: 'cover.garage_door',
    state: 'closed',
    attributes: {
      friendly_name: 'Garage Door',
      device_class: 'garage'
    }
  },
  {
    entity_id: 'binary_sensor.garage_door_contact_esp',
    state: 'off',
    attributes: {
      friendly_name: 'Garage Door Contact (ESPHome)',
      device_class: 'door'
    }
  },

  // === Vacuum (README) ===
  {
    entity_id: 'vacuum.main_floor_roomba',
    state: 'docked',
    attributes: {
      friendly_name: 'iRobot j9+ Combo'
    }
  },
  {
    entity_id: 'vacuum.upstairs_roomba',
    state: 'docked',
    attributes: {
      friendly_name: 'iRobot j7+'
    }
  },
  {
    entity_id: 'vacuum.basement_roomba',
    state: 'docked',
    attributes: {
      friendly_name: 'iRobot i7+'
    }
  },
  {
    entity_id: 'vacuum.braava_jet_240',
    state: 'off',
    attributes: {
      friendly_name: 'Braava Jet 240',
      note: 'Not integrated in original setup'
    }
  },

  // === Blinds (README) ===
  {
    entity_id: 'cover.ikea_fyrtur_1',
    state: 'open',
    attributes: {
      friendly_name: 'Ikea FYRTUR Blind',
      device_class: 'blind'
    }
  },
  {
    entity_id: 'cover.ikea_praktlysing_1',
    state: 'closed',
    attributes: {
      friendly_name: 'Ikea PRAKTLYSING Blind',
      device_class: 'blind'
    }
  },

  // === Energy (README) ===
  {
    entity_id: 'sensor.iotawatt_mains_power',
    state: '3450',
    attributes: {
      friendly_name: 'IoTaWatt Mains Power',
      unit_of_measurement: 'W'
    }
  },
  {
    entity_id: 'sensor.iotawatt_hot_tub_power',
    state: '1200',
    attributes: {
      friendly_name: 'IoTaWatt Hot Tub Power',
      unit_of_measurement: 'W'
    }
  },
  {
    entity_id: 'sensor.iotawatt_ac_power',
    state: '800',
    attributes: {
      friendly_name: 'IoTaWatt AC Power',
      unit_of_measurement: 'W'
    }
  },
  {
    entity_id: 'sensor.iotawatt_furnace_power',
    state: '300',
    attributes: {
      friendly_name: 'IoTaWatt Furnace Power',
      unit_of_measurement: 'W'
    }
  },

  // === Appliances (README) ===
  {
    entity_id: 'sensor.lg_washer_state',
    state: 'running',
    attributes: {
      friendly_name: 'LG Washer State'
    }
  },
  {
    entity_id: 'sensor.lg_dryer_state',
    state: 'idle',
    attributes: {
      friendly_name: 'LG Dryer State'
    }
  },

  // === Network (README) ===
  {
    entity_id: 'device_tracker.unifi_gateway',
    state: 'home',
    attributes: {
      friendly_name: 'Unifi Gateway',
      source_type: 'router'
    }
  },
  {
    entity_id: 'device_tracker.unifi_switch_24',
    state: 'home',
    attributes: {
      friendly_name: 'Unifi Switch 24 PoE',
      source_type: 'router'
    }
  },
  {
    entity_id: 'device_tracker.unifi_switch_enterprise_8',
    state: 'home',
    attributes: {
      friendly_name: 'Unifi Enterprise 8 PoE',
      source_type: 'router'
    }
  },
  {
    entity_id: 'device_tracker.unifi_ap_u6_enterprise_1',
    state: 'home',
    attributes: {
      friendly_name: 'Unifi AP U6 Enterprise 1',
      source_type: 'ap'
    }
  },
  {
    entity_id: 'device_tracker.unifi_ap_u6_lr_1',
    state: 'home',
    attributes: {
      friendly_name: 'Unifi AP U6 LR 1',
      source_type: 'ap'
    }
  },

  // === Other Hardware (README) ===
  {
    entity_id: 'sensor.nuc_server_status',
    state: 'online',
    attributes: {
      friendly_name: 'Intel NUC Server Status'
    }
  },
  {
    entity_id: 'sensor.qnap_ts453d_storage',
    state: '12.3',
    attributes: {
      friendly_name: 'QNAP TS-453D Used Storage',
      unit_of_measurement: 'TB'
    }
  },
  {
    entity_id: 'sensor.qnap_ts453pro_storage',
    state: '8.1',
    attributes: {
      friendly_name: 'QNAP TS-453 Pro Used Storage',
      unit_of_measurement: 'TB'
    }
  },
  {
    entity_id: 'sensor.prusa_mk4_print_status',
    state: 'idle',
    attributes: {
      friendly_name: 'Prusa MK4 Print Status'
    }
  },
  {
    entity_id: 'sensor.prusa_mk3s_print_status',
    state: 'idle',
    attributes: {
      friendly_name: 'Prusa MK3S+ Print Status'
    }
  },
  {
    entity_id: 'sensor.hp_officejet_ink_level',
    state: '75',
    attributes: {
      friendly_name: 'HP OfficeJet Ink Level',
      unit_of_measurement: '%'
    }
  },
  {
    entity_id: 'sensor.ups_1_battery',
    state: '100',
    attributes: {
      friendly_name: 'UPS 1 Battery',
      unit_of_measurement: '%'
    }
  },
  {
    entity_id: 'sensor.ups_2_battery',
    state: '98',
    attributes: {
      friendly_name: 'UPS 2 Battery',
      unit_of_measurement: '%'
    }
  },
  {
    entity_id: 'sensor.awtrix_clock_status_1',
    state: 'online',
    attributes: {
      friendly_name: 'Awtrix Smart Pixel Clock 1'
    }
  },

  // === Software (README) ===
  {
    entity_id: 'device_tracker.iphone_user1',
    state: 'home',
    attributes: {
      friendly_name: 'iOS App iPhone User1',
      source_type: 'gps'
    }
  },
  {
    entity_id: 'device_tracker.iphone_user2',
    state: 'not_home',
    attributes: {
      friendly_name: 'iOS App iPhone User2',
      source_type: 'gps'
    }
  },
  {
    entity_id: 'sensor.pihole_ads_blocked_today',
    state: '12345',
    attributes: {
      friendly_name: 'Pi-hole Ads Blocked Today',
      unit_of_measurement: 'ads'
    }
  },
  {
    entity_id: 'sensor.pihole_status',
    state: 'enabled',
    attributes: {
      friendly_name: 'Pi-hole Status'
    }
  },
  {
  entity_id: 'input_boolean.disable_notifications',
  state: 'off',
  attributes: {
    friendly_name: 'Disable Notifications'
  }
 },

  // ============================================================
  // ========== Alarm Automations에 필요한 엔티티 추가 ==========
  // ============================================================

  // --- Alarm Panel ---
  {
    entity_id: 'alarm_control_panel.alarm',
    state: 'disarmed',
    attributes: {
      friendly_name: 'Main Alarm Panel'
    }
  },

  // --- Groups ---
  {
    entity_id: 'group.household',
    state: 'home',
    attributes: {
      friendly_name: 'Household Group'
    }
  },

  // --- Input Booleans ---
  {
    entity_id: 'input_boolean.guest_mode',
    state: 'off',
    attributes: {
      friendly_name: 'Guest Mode'
    }
  },
  {
    entity_id: 'input_boolean.home_showing_mode',
    state: 'off',
    attributes: {
      friendly_name: 'Home Showing Mode'
    }
  },
  {
    entity_id: 'input_boolean.bedtime',
    state: 'off',
    attributes: {
      friendly_name: 'Bedtime'
    }
  },
  {
    entity_id: 'input_boolean.disable_notifications',
    state: 'off',
    attributes: {
      friendly_name: 'Disable Notifications'
    }
  },

  // --- Persons ---
  {
    entity_id: 'person.USER1',
    state: 'home',
    attributes: {
      friendly_name: 'USER1'
    }
  },
  {
    entity_id: 'person.USER2',
    state: 'not_home',
    attributes: {
      friendly_name: 'USER2'
    }
  },

  // --- Alarm-related Lights ---
  {
    entity_id: 'light.smart_bulbs',
    state: 'off',
    attributes: {
      friendly_name: 'All Smart Bulbs',
      supported_color_modes: ['brightness', 'color_temp']
    }
  },
  {
    entity_id: 'light.smart_bulbs_exterior',
    state: 'off',
    attributes: {
      friendly_name: 'Exterior Smart Bulbs',
      supported_color_modes: ['brightness']
    }
  },
  {
    entity_id: 'light.lutron_lights',
    state: 'off',
    attributes: {
      friendly_name: 'Lutron Lights',
      integration: 'lutron_caseta'
    }
  },
  {
    entity_id: 'light.lutron_lights_exterior',
    state: 'off',
    attributes: {
      friendly_name: 'Lutron Exterior Lights',
      integration: 'lutron_caseta'
    }
  },

  // --- Alarm-related Switches ---
  {
    entity_id: 'switch.siren',
    state: 'off',
    attributes: {
      friendly_name: 'Alarm Siren'
    }
  },
  {
    entity_id: 'switch.panic_mode',
    state: 'off',
    attributes: {
      friendly_name: 'Panic Mode'
    }
  },
  {
    entity_id: 'switch.3d_printer_prusa',
    state: 'off',
    attributes: {
      friendly_name: '3D Printer Prusa',
      device_class: 'switch'
    }
  },
  {
    entity_id: 'switch.3d_printer_prusa_mini',
    state: 'off',
    attributes: {
      friendly_name: '3D Printer Prusa Mini',
      device_class: 'switch'
    }
  },

  // --- Alarm-related Binary Sensors ---
  {
    entity_id: 'binary_sensor.doors',
    state: 'off',
    attributes: {
      friendly_name: 'All Doors',
      device_class: 'door'
    }
  },
  {
    entity_id: 'binary_sensor.motion',
    state: 'off',
    attributes: {
      friendly_name: 'All Motion',
      device_class: 'motion'
    }
  },
  {
    entity_id: 'binary_sensor.bathroom_motion',
    state: 'off',
    attributes: {
      friendly_name: 'Bathroom Motion',
      device_class: 'motion'
    }
  },
  {
    entity_id: 'binary_sensor.stairs_motion',
    state: 'off',
    attributes: {
      friendly_name: 'Stairs Motion',
      device_class: 'motion'
    }
  },
  {
    entity_id: 'binary_sensor.bedroom_closet_motion',
    state: 'off',
    attributes: {
      friendly_name: 'Bedroom Closet Motion',
      device_class: 'motion'
    }
  },

  // --- Alarm-related Cameras ---
  {
    entity_id: 'camera.front_porch',
    state: 'streaming',
    attributes: {
      friendly_name: 'Front Porch Camera'
    }
  },

  // --- Alarm-related Media Players (Sonos zones) ---
  {
    entity_id: 'media_player.sonos_living_room',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Living Room'
    }
  },
  {
    entity_id: 'media_player.sonos_dining_room',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Dining Room'
    }
  },
  {
    entity_id: 'media_player.sonos_kitchen',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Kitchen'
    }
  },
  {
    entity_id: 'media_player.sonos_bathroom',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Bathroom'
    }
  },
  {
    entity_id: 'media_player.sonos_bedroom',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Bedroom'
    }
  },
  {
    entity_id: 'media_player.sonos_bedroom_closet',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Bedroom Closet'
    }
  },
  {
    entity_id: 'media_player.sonos_USER1s_office',
    state: 'idle',
    attributes: {
      friendly_name: "Sonos USER1's Office"
    }
  },
  {
    entity_id: 'media_player.sonos_USER2s_office',
    state: 'idle',
    attributes: {
      friendly_name: "Sonos USER2's Office"
    }
  },
  {
    entity_id: 'media_player.sonos_move',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Move (Alarm)'
    }
  },
  {
    entity_id: 'media_player.sonos_fitness_room',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Fitness Room'
    }
  },
  {
    entity_id: 'media_player.sonos_craft_room',
    state: 'idle',
    attributes: {
      friendly_name: 'Sonos Craft Room'
    }
  },

  // --- Lock Code Sensors ---
  {
    entity_id: 'sensor.front_door_lock_code',
    state: 'unknown',
    attributes: {
      friendly_name: 'Front Door Lock Code'
    }
  },
  {
    entity_id: 'sensor.back_door_lock_code',
    state: 'unknown',
    attributes: {
      friendly_name: 'Back Door Lock Code'
    }
  },
  {
    entity_id: 'sensor.basement_door_lock_code',
    state: 'unknown',
    attributes: {
      friendly_name: 'Basement Door Lock Code'
    }
  },

  // --- Siren Battery Sensor ---
  {
    entity_id: 'sensor.siren_batt',
    state: '95',
    attributes: {
      friendly_name: 'Siren Battery',
      unit_of_measurement: '%'
    }
  }

  // Retired devices는 길이가 너무 길어서 우선 생략.
  // 필요하면 같은 패턴으로 cover/switch/sensor/media_player 등 추가 가능.
];

export const notifyDevices = [
  'iphone_seunghak',
  'galaxy_s24',
  'USER1_devices',
  'USER2_devices',
  // 필요시 자유롭게 추가/수정
];

