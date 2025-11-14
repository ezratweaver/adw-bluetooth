import Gio from "gi://Gio";
import { Adapter, BLUEZ_ADAPTER_1 } from "./adapter.js";
import { ObexManager } from "./obex.js";
import {
    getLastUsedAdapter,
    setLastUsedAdapter,
} from "../services/gsettings.js";

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
    private _adapters: Map<string, Adapter> = new Map();
    private _adapter: Adapter | null = null;
    private _obex: ObexManager | null = null;

    constructor() {
        this._initialize();
    }

    private _initialize(): void {
        try {
            this._adaperPathList = this._getAdaptersAndDevices();

            for (const adapterPath of this._adaperPathList) {
                try {
                    const adapter = new Adapter(adapterPath);
                    this._adapters.set(adapterPath, adapter);
                } catch (e) {
                    log(
                        `Error occurred while initializing Adapter ${adapterPath}: ${e}`,
                    );
                }
            }

            // Set adapter to last used, or first available if none saved
            const lastUsedPath = getLastUsedAdapter();
            if (lastUsedPath && this._adapters.has(lastUsedPath)) {
                this._adapter = this._adapters.get(lastUsedPath)!;
            } else {
                const firstAdapterEntry = this._adapters.entries().next();
                if (!firstAdapterEntry.done) {
                    this._adapter = firstAdapterEntry.value[1];
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
        const newAdapter = this._adapters.get(adapterPath);

        if (!newAdapter) {
            log(`Adapter not found: ${adapterPath}`);
            return false;
        }

        this._adapter?.destroy();
        this._adapter = newAdapter;

        // Save the selected adapter for next time
        setLastUsedAdapter(adapterPath);

        return true;
    }

    get adapters(): Map<string, Adapter> {
        return this._adapters;
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
