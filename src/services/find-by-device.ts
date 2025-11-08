import { bluetooth } from "../bluetooth/bluetooth.js";
import { Device } from "../bluetooth/device.js";

/**
 * Find a device by its D-Bus object path
 */
export function findDeviceByPath(devicePath: string): Device | undefined {
    return bluetooth.adapter?.devices.find((d) => d.devicePath === devicePath);
}

/**
 * Find a device by its Bluetooth MAC address
 */
export function findDeviceByAddress(deviceAddress: string): Device | undefined {
    return bluetooth.adapter?.devices.find((d) => d.address === deviceAddress);
}

