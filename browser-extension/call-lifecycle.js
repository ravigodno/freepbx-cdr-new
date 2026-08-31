(function attachPBXPulsCallLifecycle(root) {
  function resolveCallEndPolicy(direction, wasConnected, isOutgoingForOperator = direction === 'outgoing') {
    if (isOutgoingForOperator || direction === 'outgoing') return { action: 'close', delayMs: 0 };
    if (direction === 'incoming' || direction === 'internal') {
      return wasConnected
        ? { action: 'close', delayMs: 60000 }
        : { action: 'keep', delayMs: null };
    }
    return { action: 'close', delayMs: 0 };
  }

  root.PBXPulsCallLifecycle = { resolveCallEndPolicy };
})(typeof globalThis !== 'undefined' ? globalThis : self);
