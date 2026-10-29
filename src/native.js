// Bridge to the app's own small native plugin (android/.../SalahNativePlugin.java).
// On iOS and in the browser the calls resolve to null instead of failing.
import { Capacitor, registerPlugin } from '@capacitor/core';

const SalahNative = registerPlugin('SalahNative');
const android = () => Capacitor.getPlatform() === 'android';

async function call(method, args) {
  if (!android()) return null;
  try { return await SalahNative[method](args); } catch { return null; }
}

export const batteryStatus = () => call('batteryStatus');
export const openBatterySettings = () => call('openBatterySettings');
export const openNotificationSettings = () => call('openNotificationSettings');
export const updateWidget = (data) => call('updateWidget', data);
export const setAlarms = (alarms) => call('setAlarms', { alarms });
export const cancelAlarms = () => call('cancelAlarms');
export const alarmStatus = () => call('alarmStatus');
export const openAlarmSettings = (which) => call('openAlarmSettings', { which });
