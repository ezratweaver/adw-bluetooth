import Gio from "gi://Gio";
import { Adapter, ADAPTER_INTERFACE } from "./adapter.js";

export const BLUEZ_SERVICE = "org.bluez";

export const DBUS_OBJECT_MANAGER = "org.freedesktop.DBus.ObjectManager";
export const DBUS_PROPERTIES_SET = "org.freedesktop.DBus.Properties.Set";

export const systemBus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
export const sessionBus = Gio.bus_get_sync(Gio.BusType.SESSION, null);

export interface ErrorPopUp {
    title: string;
    description: string;
}

export class BluetoothManager {
    private _adapter: Adapter | null = null;

    constructor() {
        this._initialize();
    }

    private _initialize(): void {
        try {
            const adapterPaths = this._getAdaptersAndDevices();

            // TODO: Allow user to pick between adapters
            const firstAdapter = adapterPaths[0];

            if (firstAdapter) {
                try {
                    this._adapter = new Adapter(firstAdapter);
                } catch (e) {
                    log(`Error occured while initializing Adapter: ${e}`);
                }
            }
        } catch (error) {
            // Silently fail - adapter will be null
        }
    }

    private _getAdaptersAndDevices(): string[] {
        const objectManager = Gio.DBusObjectManagerClient.new_for_bus_sync(
            Gio.BusType.SYSTEM,
            Gio.DBusObjectManagerClientFlags.NONE,
            BLUEZ_SERVICE,
            "/",
            null,
            null,
        );

        const adapterPaths: string[] = [];
        for (const obj of objectManager.get_objects()) {
            const path = obj.get_object_path();
            if (obj.get_interface(ADAPTER_INTERFACE)) {
                adapterPaths.push(path);
            }
        }

        return adapterPaths;
    }

    get adapter(): Adapter | null {
        return this._adapter;
    }

    public destroy(): void {
        this._adapter = null;
    }
}

export const bluetoothManager = new BluetoothManager();
