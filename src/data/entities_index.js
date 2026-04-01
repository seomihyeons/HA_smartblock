// Demo mode: use only Home Assistant entity data so the toolbox/options
// match the live xHome environment shown in the presentation video.

import { dummyEntities as haEntities, notifyDevices as haNotify } from './entities_homeassistant.js';

export const dummyEntities = haEntities || [];
export const notifyDevices = haNotify || [];
