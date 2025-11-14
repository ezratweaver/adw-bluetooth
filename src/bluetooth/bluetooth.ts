import Gio from "gi://Gio";
import { Adapter, BLUEZ_ADAPTER_1 } from "./adapter.js";
import { ObexManager } from "./obex.js";
import {
    getLastUsedAdapter,
    setLastUsedAdapter,
} from "../services/gsettings.js";
import GLib from "gi://GLib?version=2.0";

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
    private _adapterAliases: Map<string, string> = new Map();
    private _activeAdapter: Adapter | null = null;
    private _obex: ObexManager | null = null;

    constructor() {
        this._initialize();
    }

    private _initialize(): void {
        try {
            const adaperPathList = this._getAdaptersAndDevices();

            this._loadAdapterAliases(adaperPathList);

            // Set adapter to last used, or first available if none saved
            const lastUsedPath = getLastUsedAdapter();

            if (lastUsedPath && adaperPathList.includes(lastUsedPath)) {
                this._activeAdapter = new Adapter(lastUsedPath);
            } else if (adaperPathList.length > 0) {
                this._activeAdapter = new Adapter(adaperPathList[0]);
            }
        } catch (error) {
            log(`An error occured trying to initialize an adapter: ${error}`);
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

    private _loadAdapterAliases(adapterPathList: string[]): void {
        for (const adapterPath of adapterPathList) {
            try {
                const result = systemBus.call_sync(
                    ORG_BLUEZ,
                    adapterPath,
                    "org.freedesktop.DBus.Properties",
                    "Get",
                    new GLib.Variant("(ss)", [BLUEZ_ADAPTER_1, "Alias"]),
                    new GLib.VariantType("(v)"),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                );

                const [alias] = result
                    .get_child_value(0)
                    .get_variant()
                    .get_string();

                this._adapterAliases.set(
                    adapterPath,
                    alias || adapterPath.split("/").slice(-1)[0],
                );
            } catch (e) {
                // Fallback to adapter name if we can't get alias
                const adapterName = adapterPath.split("/").slice(-1)[0];
                this._adapterAliases.set(adapterPath, adapterName);
            }
        }
    }

    public changeAdapter(adapterPath: string) {
        if (!this.adapterAliases.has(adapterPath)) {
            log(`Adapter not found: ${adapterPath}`);
            return false;
        }

        try {
            this._activeAdapter?.destroy();
            this._activeAdapter = new Adapter(adapterPath);

            // Save the selected adapter for next time
            setLastUsedAdapter(adapterPath);

            return true;
        } catch (e) {
            log(`Error creating adapter ${adapterPath}: ${e}`);
            return false;
        }
    }

    get adapterAliases(): Map<string, string> {
        return this._adapterAliases;
    }

    get adapter(): Adapter | null {
        return this._activeAdapter;
    }

    get obex(): ObexManager | null {
        return this._obex;
    }

    public destroy(): void {
        this._activeAdapter = null;
        if (this._obex) {
            this._obex.destroy();
            this._obex = null;
        }
    }
}

export const bluetooth = new BluetoothManager();
