import { bluetooth } from "../bluetooth/bluetooth.js";
import { Device } from "../bluetooth/device.js";

/**
 * Find a device by its D-Bus object path
 */
export function findDeviceByPath(devicePath: string): Device | undefined {
    const [device] = bluetooth.findDeviceByPath(devicePath);
    return device ?? undefined;
}

/**
 * Find a device by its Bluetooth MAC address
 */
export function findDeviceByAddress(deviceAddress: string): Device | undefined {
    for (let i = 0; i < bluetooth.devices.get_n_items(); i++) {
        const device = bluetooth.devices.get_item(i) as Device;
        if (device.mac === deviceAddress) {
            return device;
        }
    }
    return undefined;
}

