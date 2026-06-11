const SERVICE_UUID = '7b5c0001-8d4a-4c3a-9b4f-434252465001';
const HOST_TX_UUID = '7b5c0002-8d4a-4c3a-9b4f-434252465001';
const DEVICE_TX_UUID = '7b5c0003-8d4a-4c3a-9b4f-434252465001';
const REMOTE_NAME = 'ComBrief-Remote';
const BRIDGE_V1_SINGLE_FRAME_MAX_BYTES = 1400;
const MAX_HOST_MESSAGE_BYTES = BRIDGE_V1_SINGLE_FRAME_MAX_BYTES;

const bridge = window.combriefHardwareBridge;
const connectButton = document.getElementById('connect-button');
const bridgeStatus = document.getElementById('bridge-status');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let status = {
  started: false,
  connected: false,
  scanning: false,
  deviceName: null,
  lastError: null,
};
let device = null;
let server = null;
let service = null;
let hostTxCharacteristic = null;
let deviceTxCharacteristic = null;
let connectPromise = null;
let connectionEpoch = 0;
let notificationListener = null;
let disconnectListenerDevice = null;
let disconnectListener = null;

function updateStatusText(message) {
  if (bridgeStatus) {
    bridgeStatus.textContent = message;
  }
}

function sendStatus(patch = {}) {
  status = { ...status, ...patch };
  if (connectButton) {
    connectButton.disabled = Boolean(status.scanning);
  }
  bridge?.sendStatus({ ...status });
}

function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  sendStatus({ lastError: message, scanning: false });
  bridge?.sendError(message);
}

function createConnectionResources() {
  return {
    localDevice: null,
    localServer: null,
    localService: null,
    localHostTx: null,
    localDeviceTx: null,
    localNotificationListener: null,
    localDisconnectListener: null,
    localDisconnectListenerDevice: null,
  };
}

function isCurrentConnection(activeEpoch) {
  return activeEpoch === connectionEpoch;
}

function removeConnectionResourceListeners(resources) {
  if (resources.localDeviceTx && resources.localNotificationListener) {
    resources.localDeviceTx.removeEventListener('characteristicvaluechanged', resources.localNotificationListener);
    resources.localNotificationListener = null;
  }

  if (resources.localDisconnectListenerDevice && resources.localDisconnectListener) {
    resources.localDisconnectListenerDevice.removeEventListener?.('gattserverdisconnected', resources.localDisconnectListener);
    resources.localDisconnectListener = null;
    resources.localDisconnectListenerDevice = null;
  }
}

function cleanupConnectionResources(resources) {
  removeConnectionResourceListeners(resources);
  if (resources.localDevice?.gatt?.connected) {
    resources.localDevice.gatt.disconnect();
  }
}

function abortStaleConnection(activeEpoch, resources) {
  if (!isCurrentConnection(activeEpoch)) {
    cleanupConnectionResources(resources);
    return true;
  }

  return false;
}

function handleDeviceNotification(event) {
  try {
    const value = event.target?.value;
    const text = decoder.decode(value);
    bridge?.sendDeviceMessage(JSON.parse(text));
  } catch (error) {
    reportError(error);
  }
}

function removeDeviceNotificationListener() {
  if (deviceTxCharacteristic && notificationListener) {
    deviceTxCharacteristic.removeEventListener('characteristicvaluechanged', notificationListener);
    notificationListener = null;
  }
}

function removeDeviceDisconnectListener() {
  if (disconnectListenerDevice && disconnectListener) {
    disconnectListenerDevice.removeEventListener?.('gattserverdisconnected', disconnectListener);
    disconnectListener = null;
    disconnectListenerDevice = null;
  }
}

function resetConnectionState() {
  removeDeviceNotificationListener();
  removeDeviceDisconnectListener();
  server = null;
  service = null;
  hostTxCharacteristic = null;
  deviceTxCharacteristic = null;
}

function handleDisconnectedFor(activeEpoch, sourceDevice, resources) {
  if (!isCurrentConnection(activeEpoch) || device !== sourceDevice) {
    cleanupConnectionResources(resources);
    return;
  }

  handleDisconnected();
}

function publishConnectionResources(resources) {
  device = resources.localDevice;
  server = resources.localServer;
  service = resources.localService;
  hostTxCharacteristic = resources.localHostTx;
  deviceTxCharacteristic = resources.localDeviceTx;
  notificationListener = resources.localNotificationListener;
  disconnectListenerDevice = resources.localDisconnectListenerDevice;
  disconnectListener = resources.localDisconnectListener;
}

function handleDisconnected() {
  resetConnectionState();
  sendStatus({ connected: false, scanning: false, deviceName: null });
}

async function connectOnce(activeEpoch) {
  const resources = createConnectionResources();

  if (!navigator.bluetooth?.requestDevice) {
    reportError('Web Bluetooth is not available');
    return;
  }

  try {
    resetConnectionState();
    if (!isCurrentConnection(activeEpoch)) {
      abortStaleConnection(activeEpoch, resources);
      return;
    }

    sendStatus({ scanning: true, lastError: null });
    updateStatusText('Opening Bluetooth picker...');
    resources.localDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: REMOTE_NAME, services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    });
    if (abortStaleConnection(activeEpoch, resources)) return;

    resources.localDisconnectListenerDevice = resources.localDevice;
    resources.localDisconnectListener = () => {
      handleDisconnectedFor(activeEpoch, resources.localDevice, resources);
    };
    resources.localDevice.addEventListener?.('gattserverdisconnected', resources.localDisconnectListener);
    resources.localServer = await resources.localDevice.gatt.connect();
    if (abortStaleConnection(activeEpoch, resources)) return;

    resources.localService = await resources.localServer.getPrimaryService(SERVICE_UUID);
    if (abortStaleConnection(activeEpoch, resources)) return;

    resources.localHostTx = await resources.localService.getCharacteristic(HOST_TX_UUID);
    if (abortStaleConnection(activeEpoch, resources)) return;

    resources.localDeviceTx = await resources.localService.getCharacteristic(DEVICE_TX_UUID);
    if (abortStaleConnection(activeEpoch, resources)) return;

    await resources.localDeviceTx.startNotifications();
    if (abortStaleConnection(activeEpoch, resources)) return;

    resources.localNotificationListener = handleDeviceNotification;
    resources.localDeviceTx.addEventListener('characteristicvaluechanged', resources.localNotificationListener);
    if (abortStaleConnection(activeEpoch, resources)) return;

    publishConnectionResources(resources);
    updateStatusText(`Connected to ${resources.localDevice.name || REMOTE_NAME}. You can leave this window open.`);
    sendStatus({
      connected: true,
      scanning: false,
      deviceName: resources.localDevice.name || REMOTE_NAME,
      lastError: null,
    });
  } catch (error) {
    cleanupConnectionResources(resources);
    if (isCurrentConnection(activeEpoch)) {
      resetConnectionState();
      reportError(error);
    }
  }
}

async function connect() {
  if (status.connected && hostTxCharacteristic) {
    sendStatus({ scanning: false, lastError: null });
    return;
  }

  if (connectPromise) {
    updateStatusText('Pairing is already in progress...');
    return connectPromise;
  }

  const activeEpoch = connectionEpoch + 1;
  connectionEpoch = activeEpoch;
  connectPromise = connectOnce(activeEpoch);
  const activePromise = connectPromise;

  try {
    return await activePromise;
  } finally {
    if (connectPromise === activePromise) {
      connectPromise = null;
    }
  }
}

function disconnect() {
  connectionEpoch += 1;
  connectPromise = null;
  try {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
    handleDisconnected();
  } catch (error) {
    reportError(error);
  }
}

async function sendHostMessage(message) {
  try {
    if (!hostTxCharacteristic || !status.connected) {
      throw new Error('ComBrief Remote is not connected');
    }

    const bytes = encoder.encode(JSON.stringify(message));
    if (bytes.byteLength > MAX_HOST_MESSAGE_BYTES) {
      throw new Error(`Host message exceeds v1 single-frame limit: ${bytes.byteLength} bytes`);
    }

    if (typeof hostTxCharacteristic.writeValueWithoutResponse === 'function') {
      await hostTxCharacteristic.writeValueWithoutResponse(bytes);
    } else {
      await hostTxCharacteristic.writeValue(bytes);
    }
  } catch (error) {
    reportError(error);
  }
}

window.combriefHardwareBridge?.onStartScan(() => {
  updateStatusText('Click Connect ComBrief Remote to start Bluetooth pairing.');
});
window.combriefHardwareBridge?.onConnect(() => {
  updateStatusText('Click Connect ComBrief Remote to start Bluetooth pairing.');
});
connectButton?.addEventListener('click', () => {
  void connect();
});
window.combriefHardwareBridge?.onDisconnect(() => {
  disconnect();
});
window.combriefHardwareBridge?.onSendHostMessage((message) => {
  void sendHostMessage(message);
});

window.combriefHardwareBridge?.sendReady?.();
sendStatus({ started: true });
