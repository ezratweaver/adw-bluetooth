import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";
import GObject from "gi://GObject?version=2.0";

const DAEMON_SERVICE = "com.ezratweaver.AdwBluetoothDaemon";
const DAEMON_OBJECT_PATH = "/com/ezratweaver/AdwBluetoothDaemon";
const DAEMON_INTERFACE = "com.ezratweaver.AdwBluetoothDaemon";

const sessionBus = Gio.bus_get_sync(Gio.BusType.SESSION, null);

export interface Adapter {
    path: string;
    alias: string;
    powered: boolean;
    discovering: boolean;
}

export interface Device {
    path: string;
    mac: string;
    name: string;
    alias: string;
    connected: boolean;
    paired: boolean;
    trusted: boolean;
    class: number;
    icon: string;
    uuids: string[];
    batteryPercentage: number; // -1 = unavailable
}

function parseAdapter(variant: GLib.Variant): Adapter {
    const [path, alias, powered, discovering] = variant.deep_unpack() as [
        string,
        string,
        boolean,
        boolean,
    ];
    return { path, alias, powered, discovering };
}

function parseDevice(variant: GLib.Variant): Device {
    const [
        path,
        mac,
        name,
        alias,
        connected,
        paired,
        trusted,
        deviceClass,
        icon,
        uuids,
        batteryPercentage,
    ] = variant.deep_unpack() as [
        string,
        string,
        string,
        string,
        boolean,
        boolean,
        boolean,
        number,
        string,
        string[],
        number,
    ];
    return {
        path,
        mac,
        name,
        alias,
        connected,
        paired,
        trusted,
        class: deviceClass,
        icon,
        uuids,
        batteryPercentage,
    };
}

export class BluetoothManager extends GObject.Object {
    private _proxy: Gio.DBusProxy;
    private _devices: Map<string, Device> = new Map();
    private _adapters: Map<string, Adapter> = new Map();
    private _activeAdapter: Adapter | null = null;

    static {
        GObject.registerClass(
            {
                Signals: {
                    // Device signals
                    "device-added": {
                        param_types: [GObject.TYPE_STRING], // device path
                    },
                    "device-removed": {
                        param_types: [GObject.TYPE_STRING], // device path
                    },
                    "device-updated": {
                        param_types: [GObject.TYPE_STRING], // device path
                    },
                    // Adapter signals
                    "adapter-added": {
                        param_types: [GObject.TYPE_STRING], // adapter path
                    },
                    "adapter-removed": {
                        param_types: [GObject.TYPE_STRING], // adapter path
                    },
                    "adapter-updated": {
                        param_types: [GObject.TYPE_STRING], // adapter path
                    },
                    // Pairing signals
                    "request-confirmation": {
                        // device path, passkey
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_UINT],
                    },
                    "request-authorization": {
                        // device path
                        param_types: [GObject.TYPE_STRING],
                    },
                    "display-pin-code": {
                        // device path, pincode
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING],
                    },
                    "display-passkey": {
                        // device path, passkey, entered
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
            null, // all signals
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
                const device = parseDevice(parameters.get_child_value(0));
                this._devices.set(device.path, device);
                this.emit("device-added", device.path);
                break;
            }
            case "DeviceRemoved": {
                const path = params[0] as string;
                this._devices.delete(path);
                this.emit("device-removed", path);
                break;
            }
            case "DeviceUpdated": {
                const device = parseDevice(parameters.get_child_value(0));
                this._devices.set(device.path, device);
                this.emit("device-updated", device.path);
                break;
            }
            case "AdapterAdded": {
                const adapter = parseAdapter(parameters.get_child_value(0));
                this._adapters.set(adapter.path, adapter);
                this.emit("adapter-added", adapter.path);
                break;
            }
            case "AdapterRemoved": {
                const path = params[0] as string;
                this._adapters.delete(path);
                this.emit("adapter-removed", path);
                break;
            }
            case "AdapterUpdated": {
                const adapter = parseAdapter(parameters.get_child_value(0));
                this._adapters.set(adapter.path, adapter);
                if (
                    this._activeAdapter &&
                    this._activeAdapter.path === adapter.path
                ) {
                    this._activeAdapter = adapter;
                }
                this.emit("adapter-updated", adapter.path);
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
                    const adapter = parseAdapter(
                        adaptersArray.get_child_value(i),
                    );
                    this._adapters.set(adapter.path, adapter);
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
                this._activeAdapter = parseAdapter(activeResult);
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
                    const device = parseDevice(devicesArray.get_child_value(i));
                    this._devices.set(device.path, device);
                }
            }
        } catch (error) {
            log(`Failed to load devices: ${error}`);
        }
    }

    // Getters for state
    get devices(): Device[] {
        return Array.from(this._devices.values());
    }

    get adapters(): Adapter[] {
        return Array.from(this._adapters.values());
    }

    get activeAdapter(): Adapter | null {
        return this._activeAdapter;
    }

    getDevice(path: string): Device | undefined {
        return this._devices.get(path);
    }

    getAdapter(path: string): Adapter | undefined {
        return this._adapters.get(path);
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
            this._activeAdapter = parseAdapter(result);
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
