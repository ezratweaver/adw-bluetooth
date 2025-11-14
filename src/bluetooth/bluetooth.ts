import Gio from "gi://Gio";
import { Adapter, BLUEZ_ADAPTER_1 } from "./adapter.js";
import { ObexManager } from "./obex.js";

export const ORG_BLUEZ = "org.bluez";
export const DBUS_OBJECT_MANAGER = "org.freedesktop.DBus.ObjectManager";
export const DBUS_PROPERTIES_SET = "org.freedesktop.DBus.Properties.Set";

export const systemBus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
export const sessionBus = Gio.bus_get_sync(Gio.BusType.SESSION, null);

export interface ErrorPopUp {
    title: string;
    description: string;
}

export class BluetoothManager {
    private _adaperPathList: string[] = [];
    private _adapter: Adapter | null = null;
    private _obex: ObexManager | null = null;

    constructor() {
        this._initialize();
    }

    private _initialize(): void {
        try {
            this._adaperPathList = this._getAdaptersAndDevices();

            const firstAdapter = this._adaperPathList[0];

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

        try {
            this._obex = new ObexManager();
        } catch (e) {
            log(`Failed to initialize OBEX manager: ${e}`);
        }
    }

    private _getAdaptersAndDevices(): string[] {
        const objectManager = Gio.DBusObjectManagerClient.new_for_bus_sync(
            Gio.BusType.SYSTEM,
            Gio.DBusObjectManagerClientFlags.NONE,
            ORG_BLUEZ,
            "/",
            null,
            null,
        );

        const adapterPaths: string[] = [];
        for (const obj of objectManager.get_objects()) {
            const path = obj.get_object_path();
            if (obj.get_interface(BLUEZ_ADAPTER_1)) {
                adapterPaths.push(path);
            }
        }

        return adapterPaths;
    }

    public changeAdapter(adapterPath: string) {
        let newAdapter: Adapter;

        try {
            newAdapter = new Adapter(adapterPath);
        } catch (e) {
            log(`Failed to change adapter: ${e}`);
            return false;
        }

        this._adapter = newAdapter;

        return true;
    }

    get adapterPaths(): string[] {
        return this._adaperPathList;
    }

    get adapter(): Adapter | null {
        return this._adapter;
    }

    get obex(): ObexManager | null {
        return this._obex;
    }

    public destroy(): void {
        this._adapter = null;
        if (this._obex) {
            this._obex.destroy();
            this._obex = null;
        }
    }
}

export const bluetooth = new BluetoothManager();
