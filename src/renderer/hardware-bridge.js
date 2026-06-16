const SERVICE_UUID = '7b5c0001-8d4a-4c3a-9b4f-434252465001';
const HOST_TX_UUID = '7b5c0002-8d4a-4c3a-9b4f-434252465001';
const DEVICE_TX_UUID = '7b5c0003-8d4a-4c3a-9b4f-434252465001';
const CONTROL_UUID = '7b5c0005-8d4a-4c3a-9b4f-434252465001';
const REMOTE_NAME = 'ComBrief';
const BRIDGE_V1_SINGLE_FRAME_MAX_BYTES = 500;
const BLE_WRITE_CHUNK_BYTES = 20;
const BLE_CHUNK_PAYLOAD_BYTES = BLE_WRITE_CHUNK_BYTES - 1;
const BLE_CHUNK_DELAY_MS = 12;
const MAX_HOST_MESSAGE_BYTES = BRIDGE_V1_SINGLE_FRAME_MAX_BYTES;

const bridge = window.combriefHardwareBridge;
const bridgeTitle = document.getElementById('bridge-title');
const bridgeDescription = document.getElementById('bridge-description');
const connectButton = document.getElementById('connect-button');
const bridgeStatus = document.getElementById('bridge-status');
const copyParams = new URLSearchParams(window.location?.search || '');
const copy = {
  title: copyParams.get('title') || 'Pair ComBrief Remote',
  description: copyParams.get('description') || 'Click the button below, then choose your ComBrief Remote in the Bluetooth picker.',
  button: copyParams.get('button') || 'Connect ComBrief Remote',
  initialStatus: copyParams.get('initialStatus') || 'Waiting for your click to start Bluetooth pairing.',
  scanningStatus: copyParams.get('scanningStatus') || 'Scanning for ComBrief Remote…',
  connectingStatus: copyParams.get('connectingStatus') || 'Device selected. Connecting to ComBrief Remote…',
  connectedStatus: copyParams.get('connectedStatus') || 'Connected. You can leave this window open.',
  errorPrefix: copyParams.get('errorPrefix') || 'Connection failed: ',
};
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
let controlCharacteristic = null;
let deviceTxCharacteristic = null;
let connectPromise = null;
let connectionEpoch = 0;
let notificationListener = null;
let disconnectListenerDevice = null;
let disconnectListener = null;
let hostSendChain = Promise.resolve();

function applyBridgeCopy(key, element) {
  if (element) {
    element.textContent = copy[key];
  }
}

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

function errorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

function reportError(error) {
  const message = errorMessage(error);
  updateStatusText(`${copy.errorPrefix}${message}`);
  sendStatus({ lastError: message, scanning: false });
  bridge?.sendError(message);
}

function createConnectionResources() {
  return {
    localDevice: null,
    localServer: null,
    localService: null,
    localHostTx: null,
    localControl: null,
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
  controlCharacteristic = null;
  deviceTxCharacteristic = null;
  hostSendChain = Promise.resolve();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  controlCharacteristic = resources.localControl;
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
    updateStatusText(copy.scanningStatus);
    resources.localDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: REMOTE_NAME }],
      optionalServices: [SERVICE_UUID],
    });
    updateStatusText(copy.connectingStatus);
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

    resources.localControl = await resources.localService.getCharacteristic(CONTROL_UUID);
    if (abortStaleConnection(activeEpoch, resources)) return;

    resources.localDeviceTx = await resources.localService.getCharacteristic(DEVICE_TX_UUID);
    if (abortStaleConnection(activeEpoch, resources)) return;

    await resources.localDeviceTx.startNotifications();
    if (abortStaleConnection(activeEpoch, resources)) return;

    resources.localNotificationListener = handleDeviceNotification;
    resources.localDeviceTx.addEventListener('characteristicvaluechanged', resources.localNotificationListener);
    if (abortStaleConnection(activeEpoch, resources)) return;

    publishConnectionResources(resources);
    updateStatusText(`${resources.localDevice.name || REMOTE_NAME}: ${copy.connectedStatus}`);
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

async function writeUnconfirmedBytes(characteristic, bytes) {
  if (typeof characteristic?.writeValueWithoutResponse === 'function') {
    await characteristic.writeValueWithoutResponse(bytes);
    return;
  }

  throw new Error('ComBrief Remote characteristic does not support unconfirmed writes');
}

async function writeHostBytes(bytes) {
  for (let offset = 0; offset < bytes.byteLength; offset += BLE_CHUNK_PAYLOAD_BYTES) {
    const end = Math.min(offset + BLE_CHUNK_PAYLOAD_BYTES, bytes.byteLength);
    const prefix = end >= bytes.byteLength ? '!'.charCodeAt(0) : '>'.charCodeAt(0);
    const chunk = new Uint8Array(1 + end - offset);
    chunk[0] = prefix;
    chunk.set(bytes.slice(offset, end), 1);
    await writeUnconfirmedBytes(hostTxCharacteristic, chunk);
    if (end < bytes.byteLength) {
      await delay(BLE_CHUNK_DELAY_MS);
    }
  }
}

async function sendHostMessageInner(command) {
  const message = command && typeof command === 'object' && 'message' in command
    ? command.message
    : command;
  const commandId = command && typeof command === 'object' && typeof command.id === 'string'
    ? command.id
    : null;

  try {
    if (!hostTxCharacteristic || !status.connected) {
      if (status.scanning) {
        if (commandId) {
          bridge?.sendHostMessageResult?.({ id: commandId, ok: true, error: null });
        }
        return;
      }
      throw new Error('ComBrief Remote is not connected');
    }

    const bytes = encoder.encode(JSON.stringify(message));
    if (bytes.byteLength > MAX_HOST_MESSAGE_BYTES) {
      throw new Error(`Host message exceeds v1 single-frame limit: ${bytes.byteLength} bytes`);
    }

    await writeHostBytes(bytes);
    if (commandId) {
      bridge?.sendHostMessageResult?.({ id: commandId, ok: true, error: null });
    }
  } catch (error) {
    if (commandId) {
      const message = errorMessage(error);
      bridge?.sendHostMessageResult?.({ id: commandId, ok: false, error: message });
    }
    reportError(error);
  }
}

async function sendFastState(signal) {
  try {
    if (!controlCharacteristic || !status.connected) {
      if (status.scanning) return;
      throw new Error('ComBrief Remote is not connected');
    }

    const seq = Number.isFinite(signal?.seq) ? Math.max(0, Math.trunc(signal.seq)) : 0;
    const label = typeof signal?.label === 'string' && signal.label.length > 0 ? signal.label.slice(0, 12) : 'CB';
    const state = typeof signal?.status === 'string' ? signal.status : 'idle';
    await writeUnconfirmedBytes(controlCharacteristic, encoder.encode(`S:${seq}:${state}:${label}`));
  } catch (error) {
    reportError(error);
  }
}

function enqueueHostMessage(command) {
  const task = hostSendChain.then(() => sendHostMessageInner(command));
  hostSendChain = task.catch(() => undefined);
  return task;
}

applyBridgeCopy('title', bridgeTitle);
applyBridgeCopy('description', bridgeDescription);
applyBridgeCopy('button', connectButton);
applyBridgeCopy('initialStatus', bridgeStatus);

window.combriefHardwareBridge?.onStartScan(() => {
  updateStatusText(copy.initialStatus);
});
window.combriefHardwareBridge?.onConnect(() => {
  updateStatusText(copy.initialStatus);
  void connect();
});
connectButton?.addEventListener('click', () => {
  void connect();
});
window.combriefHardwareBridge?.onDisconnect(() => {
  disconnect();
});
window.combriefHardwareBridge?.onSendFastState?.((signal) => {
  void sendFastState(signal);
});
window.combriefHardwareBridge?.onSendHostMessage((message) => {
  void enqueueHostMessage(message);
});

window.combriefHardwareBridge?.sendReady?.();
sendStatus({ started: true });
