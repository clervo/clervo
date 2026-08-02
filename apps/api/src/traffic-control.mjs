const MODES = new Set(['open', 'stopped']);

export function createTrafficControl(initialMode = 'open') {
  if (!MODES.has(initialMode)) throw new TypeError('invalid traffic mode');
  let mode = initialMode;
  let reason = initialMode === 'stopped' ? 'operator_stop' : null;

  return Object.freeze({
    snapshot() {
      return Object.freeze({ mode, reason });
    },
    stop(stopReason = 'operator_stop') {
      if (!/^[a-z][a-z0-9_]{2,63}$/u.test(stopReason)) throw new TypeError('invalid traffic stop reason');
      mode = 'stopped';
      reason = stopReason;
    },
    restore({ probeSucceeded } = {}) {
      if (probeSucceeded !== true) throw new Error('traffic_restore_probe_required');
      mode = 'open';
      reason = null;
    },
  });
}
