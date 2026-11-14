/* Synthwave Generator - heart-rate input.
 * Reads the standard BLE Heart Rate Service (0x180D / 0x2A37) via Web
 * Bluetooth. No cloud, no account, no vendor SDK. Everything stays local. */
(function (global) {
  "use strict";

  function isSupported() {
    return !!(navigator.bluetooth && global.isSecureContext);
  }

  /* Bluetooth SIG Heart Rate Measurement characteristic.
   * flags bit 0 -> uint16 BPM (little endian), otherwise uint8.
   * flags bit 4 -> one or more uint16 RR intervals in 1/1024 s. */
  function parseMeasurement(value) {
    if (!value || value.byteLength < 2) return null;
    const flags = value.getUint8(0);
    let offset = 1;
    let bpm;
    if (flags & 0x01) {
      if (value.byteLength < 3) return null;
      bpm = value.getUint16(offset, true);
      offset += 2;
    } else {
      bpm = value.getUint8(offset);
      offset += 1;
    }
    if (!Number.isFinite(bpm) || bpm < 25 || bpm > 240) return null;
    const rr = [];
    if (flags & 0x10) {
      while (offset + 2 <= value.byteLength) {
        rr.push(value.getUint16(offset, true) / 1024 * 1000);
        offset += 2;
      }
    }
    return { bpm, rr, contact: !(flags & 0x04) };
  }

  async function connect(onSample, onStatus) {
    if (!isSupported()) {
      throw new Error("Web Bluetooth needs Chrome or Edge over HTTPS (not iOS Safari).");
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ["heart_rate"] }],
    });
    onStatus("Connecting to " + (device.name || "heart-rate sensor") + "…");
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService("heart_rate");
    const char = await service.getCharacteristic("heart_rate_measurement");

    const handler = (event) => {
      const sample = parseMeasurement(event.target.value);
      if (sample) onSample(sample);
    };
    char.addEventListener("characteristicvaluechanged", handler);
    await char.startNotifications();

    const onDisconnect = () => {
      try { char.removeEventListener("characteristicvaluechanged", handler); } catch (_) {}
      onStatus("Sensor disconnected. Reconnect with the button.");
    };
    device.addEventListener("gattserverdisconnected", onDisconnect);
    onStatus("Live HR connected · " + (device.name || "sensor"));

    return {
      name: device.name || "sensor",
      disconnect() {
        device.removeEventListener("gattserverdisconnected", onDisconnect);
        try { char.removeEventListener("characteristicvaluechanged", handler); } catch (_) {}
        try { device.gatt.disconnect(); } catch (_) {}
      },
    };
  }

  global.SynthHR = { isSupported, parseMeasurement, connect };
})(window);
