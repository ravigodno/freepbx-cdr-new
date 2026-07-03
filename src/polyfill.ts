// Robust safe polyfill for localStorage and sessionStorage to prevent SecurityErrors in iframe/sandbox environments
(function() {
  function createMemoryStorage(): Storage {
    let memoryData: Record<string, string> = {};
    return {
      get length() {
        return Object.keys(memoryData).length;
      },
      clear() {
        memoryData = {};
      },
      getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(memoryData, key) ? memoryData[key] : null;
      },
      key(index: number) {
        return Object.keys(memoryData)[index] || null;
      },
      removeItem(key: string) {
        delete memoryData[key];
      },
      setItem(key: string, value: string) {
        memoryData[key] = String(value);
      }
    };
  }

  // Detect if localStorage is blocked/unavailable
  let storageSupported = false;
  try {
    const testObj = window.localStorage;
    if (testObj) {
      const testKey = '__storage_test_key__';
      testObj.setItem(testKey, testKey);
      testObj.removeItem(testKey);
      storageSupported = true;
    }
  } catch (e) {
    storageSupported = false;
  }

  if (!storageSupported) {
    console.warn("localStorage is blocked or unavailable in this sandbox. Injecting robust in-memory fallback.");
    const memStorage = createMemoryStorage();
    
    // First try prototype injection (the most robust way to intercept global `localStorage` in standard browsers)
    let polyfilled = false;
    try {
      if (typeof Window !== 'undefined' && Window.prototype) {
        Object.defineProperty(Window.prototype, 'localStorage', {
          get() {
            return memStorage;
          },
          configurable: true,
          enumerable: true
        });
        polyfilled = true;
      }
    } catch (err) {
      console.warn("Could not polyfill Window.prototype.localStorage:", err);
    }

    if (!polyfilled) {
      try {
        Object.defineProperty(window, 'localStorage', {
          value: memStorage,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } catch (err) {
        try {
          (window as any).localStorage = memStorage;
        } catch (err2) {
          console.error("Critical: failed to assign fallback localStorage:", err2);
        }
      }
    }
  }

  // Detect if sessionStorage is blocked/unavailable
  let sessionStorageSupported = false;
  try {
    const testObj = window.sessionStorage;
    if (testObj) {
      const testKey = '__session_test_key__';
      testObj.setItem(testKey, testKey);
      testObj.removeItem(testKey);
      sessionStorageSupported = true;
    }
  } catch (e) {
    sessionStorageSupported = false;
  }

  if (!sessionStorageSupported) {
    console.warn("sessionStorage is blocked or unavailable in this sandbox. Injecting robust in-memory fallback.");
    const memSessionStorage = createMemoryStorage();

    // First try prototype injection
    let polyfilled = false;
    try {
      if (typeof Window !== 'undefined' && Window.prototype) {
        Object.defineProperty(Window.prototype, 'sessionStorage', {
          get() {
            return memSessionStorage;
          },
          configurable: true,
          enumerable: true
        });
        polyfilled = true;
      }
    } catch (err) {
      console.warn("Could not polyfill Window.prototype.sessionStorage:", err);
    }

    if (!polyfilled) {
      try {
        Object.defineProperty(window, 'sessionStorage', {
          value: memSessionStorage,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } catch (err) {
        try {
          (window as any).sessionStorage = memSessionStorage;
        } catch (err2) {
          console.error("Critical: failed to assign fallback sessionStorage:", err2);
        }
      }
    }
  }
})();
