import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";
import GObject from "gi://GObject?version=2.0";

import { Device, parseDeviceData } from "./device.js";
import { Adapter, parseAdapterData } from "./adapter.js";

export { Device } from "./device.js";
export { Adapter } from "./adapter.js";

const DAEMON_SERVICE = "com.ezratweaver.AdwBluetoothDaemon";
const DAEMON_OBJECT_PATH = "/com/ezratweaver/AdwBluetoothDaemon";
const DAEMON_INTERFACE = "com.ezratweaver.AdwBluetoothDaemon";

const sessionBus = Gio.bus_get_sync(Gio.BusType.SESSION, null);

export class BluetoothManager extends GObject.Object {
    private _proxy: Gio.DBusProxy;
    private _devices: Gio.ListStore;
    private _adapters: Gio.ListStore;
    private _activeAdapter: Adapter | null = null;

    static {
        GObject.registerClass(
            {
                GTypeName: "BluetoothManager",
                Properties: {
                    "active-adapter": GObject.ParamSpec.object(
                        "active-adapter",
                        "Active Adapter",
                        "Currently active adapter",
                        Adapter.$gtype as any,
                        GObject.ParamFlags.READABLE as any,
                    ),
                },
                Signals: {
                    "request-confirmation": {
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_UINT],
                    },
                    "request-authorization": {
                        param_types: [GObject.TYPE_STRING],
                    },
                    "display-pin-code": {
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING],
                    },
                    "display-passkey": {
                        param_types: [
                            GObject.TYPE_STRING,
                            GObject.TYPE_UINT,
                            GObject.TYPE_UINT,
                        ],
                    },
                },
            },
            this,
        );
    }

    constructor() {
        super();

        this._devices = new Gio.ListStore({ item_type: Device.$gtype });
        this._adapters = new Gio.ListStore({ item_type: Adapter.$gtype });

        this._proxy = Gio.DBusProxy.new_sync(
            sessionBus,
            Gio.DBusProxyFlags.NONE,
            null,
            DAEMON_SERVICE,
            DAEMON_OBJECT_PATH,
            DAEMON_INTERFACE,
            null,
        );

        this._subscribeToSignals();
        this._loadInitialState();
    }

    private _subscribeToSignals(): void {
        sessionBus.signal_subscribe(
            DAEMON_SERVICE,
            DAEMON_INTERFACE,
            null,
            DAEMON_OBJECT_PATH,
            null,
            Gio.DBusSignalFlags.NONE,
            this._handleSignal.bind(this),
        );
    }

    private _handleSignal(
        _connection: Gio.DBusConnection,
        _sender: string | null,
        _objectPath: string,
        _interfaceName: string,
        signalName: string,
        parameters: GLib.Variant,
    ): void {
        const params = parameters.deep_unpack() as unknown[];

        switch (signalName) {
            case "DeviceAdded": {
                const data = parseDeviceData(parameters.get_child_value(0));
                const device = new Device(data);
                this._devices.append(device);
                break;
            }
            case "DeviceRemoved": {
                const path = params[0] as string;
                const [, index] = this.findDeviceByPath(path);
                if (index !== -1) {
                    this._devices.remove(index);
                }
                break;
            }
            case "DeviceUpdated": {
                const data = parseDeviceData(parameters.get_child_value(0));
                const [device] = this.findDeviceByPath(data.path);
                if (device) {
                    device.updateFromDaemon(data);
                }
                break;
            }
            case "AdapterAdded": {
                const data = parseAdapterData(parameters.get_child_value(0));
                const adapter = new Adapter(data);
                this._adapters.append(adapter);
                break;
            }
            case "AdapterRemoved": {
                const path = params[0] as string;
                const [, index] = this.findAdapterByPath(path);
                if (index !== -1) {
                    this._adapters.remove(index);
                }
                break;
            }
            case "AdapterUpdated": {
                const data = parseAdapterData(parameters.get_child_value(0));
                const [adapter] = this.findAdapterByPath(data.path);
                if (adapter) {
                    adapter.updateFromDaemon(data);
                }
                break;
            }
            case "RequestConfirmation": {
                const devicePath = params[0] as string;
                const passkey = params[1] as number;
                this.emit("request-confirmation", devicePath, passkey);
                break;
            }
            case "RequestAuthorization": {
                const devicePath = params[0] as string;
                this.emit("request-authorization", devicePath);
                break;
            }
            case "DisplayPinCode": {
                const devicePath = params[0] as string;
                const pincode = params[1] as string;
                this.emit("display-pin-code", devicePath, pincode);
                break;
            }
            case "DisplayPasskey": {
                const devicePath = params[0] as string;
                const passkey = params[1] as number;
                const entered = params[2] as number;
                this.emit("display-passkey", devicePath, passkey, entered);
                break;
            }
        }
    }

    private _loadInitialState(): void {
        // Load adapters
        try {
            const adaptersResult = this._proxy.call_sync(
                "GetAdapters",
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
            if (adaptersResult) {
                const adaptersArray = adaptersResult.get_child_value(0);
                for (let i = 0; i < adaptersArray.n_children(); i++) {
                    const data = parseAdapterData(
                        adaptersArray.get_child_value(i),
                    );
                    this._adapters.append(new Adapter(data));
                }
            }
        } catch (error) {
            log(`Failed to load adapters: ${error}`);
        }

        // Load active adapter
        try {
            const activeResult = this._proxy.call_sync(
                "GetActiveAdapter",
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
            if (activeResult) {
                const data = parseAdapterData(activeResult);
                const [adapter] = this.findAdapterByPath(data.path);
                this._activeAdapter = adapter ?? new Adapter(data);
            }
        } catch (error) {
            log(`Failed to load active adapter: ${error}`);
        }

        // Load devices
        try {
            const devicesResult = this._proxy.call_sync(
                "GetDevices",
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
            if (devicesResult) {
                const devicesArray = devicesResult.get_child_value(0);
                for (let i = 0; i < devicesArray.n_children(); i++) {
                    const data = parseDeviceData(
                        devicesArray.get_child_value(i),
                    );
                    this._devices.append(new Device(data));
                }
            }
        } catch (error) {
            log(`Failed to load devices: ${error}`);
        }
    }

    // ListStore accessors
    get devices(): Gio.ListStore {
        return this._devices;
    }

    get adapters(): Gio.ListStore {
        return this._adapters;
    }

    get activeAdapter(): Adapter | null {
        return this._activeAdapter;
    }

    // Lookup helpers
    findDeviceByPath(path: string): [Device | null, number] {
        for (let i = 0; i < this._devices.get_n_items(); i++) {
            const device = this._devices.get_item(i) as Device;
            if (device.path === path) {
                return [device, i];
            }
        }
        return [null, -1];
    }

    findAdapterByPath(path: string): [Adapter | null, number] {
        for (let i = 0; i < this._adapters.get_n_items(); i++) {
            const adapter = this._adapters.get_item(i) as Adapter;
            if (adapter.path === path) {
                return [adapter, i];
            }
        }
        return [null, -1];
    }

    // Methods that call daemon
    async connectDevice(path: string): Promise<void> {
        await this._callMethod(
            "ConnectDevice",
            new GLib.Variant("(o)", [path]),
        );
    }

    async disconnectDevice(path: string): Promise<void> {
        await this._callMethod(
            "DisconnectDevice",
            new GLib.Variant("(o)", [path]),
        );
    }

    async pairDevice(path: string): Promise<void> {
        await this._callMethod("PairDevice", new GLib.Variant("(o)", [path]));
    }

    async removeDevice(path: string): Promise<void> {
        await this._callMethod("RemoveDevice", new GLib.Variant("(o)", [path]));
    }

    async setTrusted(path: string, trusted: boolean): Promise<void> {
        await this._callMethod(
            "SetTrusted",
            new GLib.Variant("(ob)", [path, trusted]),
        );
    }

    async startDiscovery(): Promise<void> {
        await this._callMethod("StartDiscovery", null);
    }

    async stopDiscovery(): Promise<void> {
        await this._callMethod("StopDiscovery", null);
    }

    async setAdapterPower(powered: boolean): Promise<void> {
        await this._callMethod(
            "SetAdapterPower",
            new GLib.Variant("(b)", [powered]),
        );
    }

    async setActiveAdapter(path: string): Promise<void> {
        const result = await this._callMethod(
            "SetActiveAdapter",
            new GLib.Variant("(o)", [path]),
        );
        if (result) {
            const data = parseAdapterData(result);
            const [adapter] = this.findAdapterByPath(data.path);
            this._activeAdapter = adapter ?? new Adapter(data);
            this.notify("active-adapter");
        }
    }

    confirmRequest(accepted: boolean): void {
        this._callMethod("ConfirmRequest", new GLib.Variant("(b)", [accepted]));
    }

    confirmAuthorization(accepted: boolean): void {
        this._callMethod(
            "ConfirmAuthorization",
            new GLib.Variant("(b)", [accepted]),
        );
    }

    private _callMethod(
        method: string,
        args: GLib.Variant | null,
    ): Promise<GLib.Variant | null> {
        return new Promise((resolve, reject) => {
            this._proxy.call(
                method,
                args,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (proxy, result) => {
                    try {
                        const response = proxy?.call_finish(result);
                        resolve(response ?? null);
                    } catch (error) {
                        reject(error);
                    }
                },
            );
        });
    }
}

export const bluetooth = new BluetoothManager();
