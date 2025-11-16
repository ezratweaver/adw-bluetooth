import Gio from "gi://Gio?version=2.0";
import GObject from "gi://GObject?version=2.0";
import GLib from "gi://GLib?version=2.0";
import { Device, BLUEZ_DEVICE_1 } from "./device.js";
import {
    ORG_BLUEZ,
    DBUS_OBJECT_MANAGER,
    DBUS_PROPERTIES_SET,
    systemBus,
} from "./bluetooth.js";
import { BluetoothAgent } from "./agent.js";

export const BLUEZ_ADAPTER_1 = "org.bluez.Adapter1";

export class Adapter extends GObject.Object {
    private _adapterPath: string;
    private devicePaths: string[] = [];
    private adapterProxy: Gio.DBusProxy;
    private agent: BluetoothAgent;

    private _powered: boolean = false;
    private _discovering: boolean = false;
    private _alias: string = "";
    private _devices: Device[] = [];
    private _limboDevices: Device[] = [];

    static {
        GObject.registerClass(
            {
                Properties: {
                    powered: GObject.ParamSpec.boolean(
                        "powered",
                        "Powered",
                        "Adapter powered state",
                        GObject.ParamFlags.READABLE,
                        false
                    ),
                    discovering: GObject.ParamSpec.boolean(
                        "discovering",
                        "Discovering",
                        "Adapter currently discovering devices",
                        GObject.ParamFlags.READABLE,
                        false
                    ),
                    alias: GObject.ParamSpec.string(
                        "alias",
                        "Alias",
                        "Adapter alias/name",
                        GObject.ParamFlags.READABLE,
                        ""
                    ),
                },
                Signals: {
                    "device-added": {
                        param_types: [GObject.TYPE_STRING],
                    },
                    "device-removed": {
                        param_types: [GObject.TYPE_STRING],
                    },
                },
            },
            this
        );
    }

    constructor(adapterPath: string) {
        super();
        this._adapterPath = adapterPath;

        this.adapterProxy = Gio.DBusProxy.new_sync(
            systemBus,
            Gio.DBusProxyFlags.NONE,
            null,
            ORG_BLUEZ,
            this._adapterPath,
            BLUEZ_ADAPTER_1,
            null
        );

        this.agent = new BluetoothAgent();

        this._loadProperties();
        this._setupPropertyChangeListener();
        this._syncSavedDevices();
    }

    private _loadProperties(): void {
        const powered = this.adapterProxy.get_cached_property("Powered");
        this._setPoweredState(powered?.deep_unpack() as boolean);

        const discovering =
            this.adapterProxy.get_cached_property("Discovering");

        this._setDiscoveringState(discovering?.deep_unpack() as boolean);

        const alias = this.adapterProxy.get_cached_property("Alias");
        this._setAlias((alias?.deep_unpack() as string) || "");
    }

    private _setupPropertyChangeListener(): void {
        this.adapterProxy.connect("g-properties-changed", (_, changed) => {
            const poweredValueChanged = changed.lookup_value("Powered", null);
            if (poweredValueChanged) {
                this._setPoweredState(poweredValueChanged.get_boolean());
            }

            const discoveringValueChanged = changed.lookup_value(
                "Discovering",
                null
            );
            if (discoveringValueChanged) {
                this._setDiscoveringState(
                    discoveringValueChanged.get_boolean()
                );
            }

            const aliasValueChanged = changed.lookup_value("Alias", null);
            if (aliasValueChanged) {
                const [alias] = aliasValueChanged.get_string();
                this._setAlias(alias);
            }
        });
    }

    private _syncSavedDevices(): void {
        systemBus.signal_subscribe(
            ORG_BLUEZ,
            DBUS_OBJECT_MANAGER,
            "InterfacesAdded",
            "/",
            null,
            Gio.DBusSignalFlags.NONE,
            (_, _1, _2, _3, _4, parameters) => {
                const [path, interfaces] = parameters.deep_unpack() as [
                    string,
                    Record<string, Record<string, GLib.Variant>>
                ];

                if (
                    path.includes(this._adapterPath) &&
                    interfaces[BLUEZ_DEVICE_1]
                ) {
                    log(`New device discovered ${path}`);

                    let newDevice: Device;
                    try {
                        newDevice = new Device({
                            blockAgent: this.agent.blockAgent.bind(this.agent),
                            freeAgent: this.agent.freeAgent.bind(this.agent),
                            devicePath: path,
                        });
                    } catch (e) {
                        log(`Failed to create device ${path}: ${e}`);
                        return;
                    }

                    if (!this.devicePaths.includes(path)) {
                        this.devicePaths.push(path);
                    }

                    /**
                     * Sometimes bluez will pick up on a devices, but can't get any metadata.
                     * So we'll use name as the gut check for if metadata was found, and only emit
                     * devices which have metadata to the UI
                     */
                    if (newDevice.name) {
                        this._devices.push(newDevice);
                        this.emit("device-added", newDevice.devicePath);
                    } else {
                        // Add device to a seperate array to keep the object from getting garbage collected
                        this._limboDevices.push(newDevice);

                        // Once the device gets a name, it can join the rest of its friends
                        newDevice.connect("device-changed", () => {
                            if (newDevice.name) {
                                this._devices.push(newDevice);
                                this.emit("device-added", newDevice.devicePath);
                            }
                        });
                    }
                }
            }
        );

        systemBus.signal_subscribe(
            ORG_BLUEZ,
            DBUS_OBJECT_MANAGER,
            "InterfacesRemoved",
            "/",
            null,
            Gio.DBusSignalFlags.NONE,
            (_, _1, _2, _3, _4, parameters) => {
                const [path, interfaces] = parameters.deep_unpack() as [
                    string,
                    string[]
                ];

                if (
                    path.includes(this._adapterPath) &&
                    interfaces.includes(BLUEZ_DEVICE_1)
                ) {
                    log(`Device getting removed ${path}`);

                    const deviceIndex = this.devices.findIndex(
                        (device) => device.devicePath === path
                    );

                    const limboDeviceIndex = this.devices.findIndex(
                        (device) => device.devicePath === path
                    );

                    if (deviceIndex !== -1) {
                        this.devices.splice(deviceIndex, 1);

                        this.devicePaths = this.devicePaths.filter(
                            (p) => p !== path
                        );

                        this.emit("device-removed", path);
                    }

                    if (limboDeviceIndex !== -1) {
                        this._limboDevices.splice(limboDeviceIndex, 1);

                        this.devicePaths = this.devicePaths.filter(
                            (p) => p !== path
                        );
                    }
                }
            }
        );

        const result = systemBus.call_sync(
            ORG_BLUEZ,
            "/",
            DBUS_OBJECT_MANAGER,
            "GetManagedObjects",
            null,
            new GLib.VariantType("(a{oa{sa{sv}}})"),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        const [objects] = result.deep_unpack() as [
            Record<string, Record<string, Record<string, GLib.Variant>>>
        ];

        for (const [path, interfaces] of Object.entries(objects)) {
            if (
                path.includes(this._adapterPath) &&
                interfaces[BLUEZ_DEVICE_1]
            ) {
                this.devicePaths.push(path);

                let device: Device;
                try {
                    device = new Device({
                        devicePath: path,
                        blockAgent: this.agent.blockAgent.bind(this.agent),
                        freeAgent: this.agent.freeAgent.bind(this.agent),
                    });
                } catch (e) {
                    log(
                        `Encountered an error while creating device ${path}: ${e}`
                    );
                    continue;
                }

                log(`Discovered ${device.devicePath} on initial device sync`);

                if (device.paired) {
                    this.devices.push(device);
                }
            }
        }
    }

    private _setDiscoveringState(discovering: boolean) {
        if (this._discovering === discovering) return;
        this._discovering = discovering;
        this.notify("discovering");
    }

    private _setPoweredState(powered: boolean): void {
        if (this._powered === powered) return;
        this._powered = powered;
        this.notify("powered");
    }

    private _setAlias(alias: string): void {
        if (this._alias === alias) return;
        this._alias = alias;
        this.notify("alias");
    }

    public startDiscovery() {
        this.adapterProxy.call_sync(
            "StartDiscovery",
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        this.setDiscoverable(true);
    }

    public stopDiscovery() {
        this.adapterProxy.call_sync(
            "StopDiscovery",
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        this.setDiscoverable(false);
    }

    public setAdapterPower(powered: boolean): void {
        this.adapterProxy.call_sync(
            DBUS_PROPERTIES_SET,
            new GLib.Variant("(ssv)", [
                BLUEZ_ADAPTER_1,
                "Powered",
                new GLib.Variant("b", powered),
            ]),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
    }

    public setDiscoverable(discoverable: boolean): void {
        this.adapterProxy.call_sync(
            DBUS_PROPERTIES_SET,
            new GLib.Variant("(ssv)", [
                BLUEZ_ADAPTER_1,
                "Discoverable",
                new GLib.Variant("b", discoverable),
            ]),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
    }

    public async removeDevice(devicePath: string): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.adapterProxy.call(
                "RemoveDevice",
                new GLib.Variant("(o)", [devicePath]),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (proxy, result) => {
                    try {
                        proxy?.call_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    }

    get adapterPath(): string {
        return this._adapterPath;
    }

    get powered(): boolean {
        return this._powered;
    }

    get discovering(): boolean {
        return this._discovering;
    }

    get alias(): string {
        return this._alias;
    }

    get devices(): Device[] {
        return this._devices;
    }

    get bluetoothAgent(): BluetoothAgent {
        return this.agent;
    }

    public destroy() {
        if (this.discovering) {
            this.stopDiscovery();
        }

        this.bluetoothAgent.unregister();

        for (const device of this.devices) {
            if (device.connecting) {
                // If we are mid connecting a device, close that connection
                device.disconnectDevice();
            }
        }
    }
}
