// Injected into the page before the app loads: pretends to be the native Android/iOS
// side of Capacitor so native code paths (notifications, settings checks) run in a
// browser. Configure via window.__mockConfig before this script; inspect window.__mock.
(() => {
  const cfg = Object.assign({
    platform: 'android', display: 'granted', exact: 'granted',
    battery: { unrestricted: true, manufacturer: 'Google' }, alarm: { canScheduleExact: true, canFullScreen: true }, storage: {},
  }, window.__mockConfig || {});
  const mock = window.__mock = { calls: [], pending: [], channels: {}, storage: { ...cfg.storage }, cfg };
  if (cfg.platform === 'desktop') {
    // Windows app: no Capacitor native side, just the Electron bridge (recorded); storage is localStorage.
    for (const [k, v] of Object.entries(cfg.storage)) localStorage.setItem(`CapacitorStorage.${k}`, v);
    Object.assign(mock, { schedules: [], tests: 0, autoStart: false, cancelled: 0 });
    window.salahDesktop = {
      isDesktop: true, version: 'test',
      schedule: async (items) => { mock.calls.push('salahDesktop.schedule'); mock.items = items; mock.schedules.push(items); return { scheduled: items.length }; },
      cancelAll: async () => { mock.cancelled++; },
      testNotification: async () => { mock.tests++; },
      getAutoStart: async () => mock.autoStart,
      setAutoStart: async (on) => { mock.autoStart = on; },
    };
    return;
  }
  const handlers = {
    Preferences: {
      get: ({ key }) => ({ value: key in mock.storage ? mock.storage[key] : null }),
      set: ({ key, value }) => { mock.storage[key] = value; return {}; },
      remove: ({ key }) => { delete mock.storage[key]; return {}; },
    },
    LocalNotifications: {
      checkPermissions: () => ({ display: cfg.display }),
      requestPermissions: () => ({ display: cfg.display }),
      checkExactNotificationSetting: () => ({ exact_alarm: cfg.exact }),
      changeExactNotificationSetting: () => { cfg.exact = 'granted'; return { exact_alarm: 'granted' }; },
      createChannel: (c) => { mock.channels[c.id] = c; return {}; },
      deleteChannel: ({ id }) => { delete mock.channels[id]; return {}; },
      getPending: () => ({ notifications: mock.pending.map((n) => ({ id: n.id, schedule: n.schedule })) }),
      cancel: ({ notifications }) => { const ids = new Set(notifications.map((n) => n.id)); mock.pending = mock.pending.filter((n) => !ids.has(n.id)); return {}; },
      schedule: ({ notifications }) => {
        if (cfg.platform === 'ios' && mock.pending.length + notifications.length > 64) throw new Error('iOS limit exceeded');
        mock.pending.push(...notifications);
        return { notifications: notifications.map((n) => ({ id: n.id })) };
      },
    },
    SalahNative: {
      batteryStatus: () => cfg.battery,
      openBatterySettings: () => { cfg.battery = { ...cfg.battery, unrestricted: true }; return {}; },
      openNotificationSettings: () => { cfg.display = 'granted'; return {}; },
      updateWidget: (data) => { mock.widget = data; return {}; },
      setAlarms: ({ alarms }) => { (mock.alarmCalls ||= []).push(alarms); mock.alarms = alarms; return {}; },
      cancelAlarms: () => { mock.alarms = []; return {}; },
      alarmStatus: () => cfg.alarm,
      openAlarmSettings: ({ which }) => { cfg.alarm = { ...cfg.alarm, [which === 'exact' ? 'canScheduleExact' : 'canFullScreen']: true }; return {}; },
    },
    App: {},
    Share: { share: (o) => ({}) },
    Filesystem: { writeFile: ({ path, data }) => { (mock.files ||= {})[path] = data; return { uri: `file:///cache/${path}` }; } },
  };
  window.CapacitorCustomPlatform = { name: cfg.platform, plugins: {} };
  window.Capacitor = {
    PluginHeaders: Object.entries(handlers).map(([name, methods]) => ({
      name,
      methods: [...Object.keys(methods).map((m) => ({ name: m, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }],
    })),
    nativePromise: async (plugin, method, options) => {
      mock.calls.push(`${plugin}.${method}`);
      const fn = handlers[plugin]?.[method];
      if (!fn) throw new Error(`mock: ${plugin}.${method} not implemented`);
      return JSON.parse(JSON.stringify(fn(options ?? {}) ?? {}));
    },
    nativeCallback: (plugin, method) => { mock.calls.push(`${plugin}.${method}`); return String(Math.random()); },
  };
})();
