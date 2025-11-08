import GLib from "gi://GLib?version=2.0";
import Gio from "gi://Gio?version=2.0";

interface DeviceHistory {
    // { devicePath: numberOfConnectionsMade }
    [key: string]: number;
}

const settings = new Gio.Settings({
    schema_id: "com.ezratweaver.AdwBluetooth",
});

export function incrementDeviceConnectionCount(devicePath: string): number {
    const deviceHistoryVariant = settings.get_value("device-history");

    const deviceHistory = deviceHistoryVariant.deepUnpack() as DeviceHistory;

    const deviceConnectionCount = (deviceHistory[devicePath] ?? 0) + 1;

    deviceHistory[devicePath] = deviceConnectionCount;

    const newDeviceHistoryVariant = new GLib.Variant("a{ou}", deviceHistory);

    settings.set_value("device-history", newDeviceHistoryVariant);

    return deviceConnectionCount;
}

export function getDeviceConnectionCount(devicePath: string): number {
    const deviceHistoryVariant = settings.get_value("device-history");

    const deviceHistory = deviceHistoryVariant.deepUnpack() as DeviceHistory;

    return deviceHistory[devicePath] ?? 0;
}
