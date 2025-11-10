import Gio from "gi://Gio?version=2.0";
import GObject from "gi://GObject?version=2.0";
import GLib from "gi://GLib?version=2.0";
import { ORG_BLUEZ, DBUS_PROPERTIES_SET, systemBus } from "./bluetooth.js";
import {
    incrementDeviceConnectionCount,
    getDeviceConnectionCount,
} from "../services/gsettings.js";
import { getDeviceTypeFromClass } from "../services/device-metadata.js";

export const BLUEZ_DEVICE_1 = "org.bluez.Device1";
export const BLUEZ_BATTERY_1 = "org.bluez.Battery1";

interface DeviceProps {
    devicePath: string;
    blockAgent: () => void;
    freeAgent: () => void;
}

export class Device extends GObject.Object {
    private deviceProxy: Gio.DBusProxy;
    private batteryProxy: Gio.DBusProxy | null = null;
    private blockAgent: () => void;
    private freeAgent: () => void;

    private _devicePath: string;
    private _address: string | undefined;
    private _alias: string | undefined;
    private _blocked: boolean | undefined;
    private _bonded: boolean | undefined;
    private _connected: boolean | undefined;
    private _name: string | undefined;
    private _paired: boolean | undefined;
    private _trusted: boolean | undefined;
    private _class: number | undefined;
    private _icon: string | undefined;
    private _uuids: string[] | undefined;
    private _connecting: boolean = false;
    private _connectionCount: number;
    private _batteryPercentage: number | undefined = undefined;

    static {
        GObject.registerClass(
            {
                Properties: {
                    address: GObject.ParamSpec.string(
                        "address",
                        "Address",
                        "Device address",
                        GObject.ParamFlags.READABLE,
                        "",
                    ),
                    alias: GObject.ParamSpec.string(
                        "alias",
                        "Alias",
                        "Device alias",
                        GObject.ParamFlags.READABLE,
                        "",
                    ),
                    blocked: GObject.ParamSpec.boolean(
                        "blocked",
                        "Blocked",
                        "Device blocked",
                        GObject.ParamFlags.READABLE,
                        false,
                    ),
                    bonded: GObject.ParamSpec.boolean(
                        "bonded",
                        "Bonded",
                        "Device bonded",
                        GObject.ParamFlags.READABLE,
                        false,
                    ),
                    connected: GObject.ParamSpec.boolean(
                        "connected",
                        "Connected",
                        "Device connected",
                        GObject.ParamFlags.READABLE,
                        false,
                    ),
                    name: GObject.ParamSpec.string(
                        "name",
                        "Name",
                        "Device name",
                        GObject.ParamFlags.READABLE,
                        "",
                    ),
                    paired: GObject.ParamSpec.boolean(
                        "paired",
                        "Paired",
                        "Device paired",
                        GObject.ParamFlags.READABLE,
                        false,
                    ),
                    trusted: GObject.ParamSpec.boolean(
                        "trusted",
                        "Trusted",
                        "Device trusted",
                        GObject.ParamFlags.READABLE,
                        false,
                    ),
                    connecting: GObject.ParamSpec.boolean(
                        "connecting",
                        "Connecting",
                        "Device connecting",
                        GObject.ParamFlags.READABLE,
                        false,
                    ),
                    deviceClass: GObject.ParamSpec.uint(
                        "device-class",
                        "Device Class",
                        "Device class",
                        GObject.ParamFlags.READABLE,
                        0,
                        0xffffff,
                        0,
                    ),
                    icon: GObject.ParamSpec.string(
                        "icon",
                        "Icon",
                        "Device icon",
                        GObject.ParamFlags.READABLE,
                        "",
                    ),
                    uuids: GObject.ParamSpec.jsobject(
                        "uuids",
                        "UUIDs",
                        "Device UUIDs",
                        GObject.ParamFlags.READABLE,
                    ),
                    batteryPercentage: GObject.ParamSpec.int(
                        "battery-percentage",
                        "Battery Percentage",
                        "Device battery percentage",
                        GObject.ParamFlags.READABLE,
                        -1,
                        100,
                        -1,
                    ),
                },
                Signals: {
                    "device-changed": {},
                },
            },
            this,
        );
    }

    constructor(props: DeviceProps) {
        super();
        this._devicePath = props.devicePath;

        this.deviceProxy = Gio.DBusProxy.new_sync(
            systemBus,
            Gio.DBusProxyFlags.NONE,
            null,
            ORG_BLUEZ,
            this._devicePath,
            BLUEZ_DEVICE_1,
            null,
        );

        this.blockAgent = props.blockAgent;
        this.freeAgent = props.freeAgent;

        this._connectionCount = getDeviceConnectionCount(props.devicePath);

        this._loadProperties();
        this._setupPropertyChangeListener();
        this._setupBatteryInterface();
    }

    private _loadProperties(): void {
        const unpackProperty = <T>(prop: string): T | undefined => {
            const value = this.deviceProxy
                .get_cached_property(prop)
                ?.deep_unpack() as T | undefined;
            return value;
        };

        this._address = unpackProperty<string>("Address");
        this._alias = unpackProperty<string>("Alias");
        this._blocked = unpackProperty<boolean>("Blocked");
        this._bonded = unpackProperty<boolean>("Bonded");
        this._connected = unpackProperty<boolean>("Connected");
        this._name = unpackProperty<string>("Name");
        this._paired = unpackProperty<boolean>("Paired");
        this._trusted = unpackProperty<boolean>("Trusted");
        this._class = unpackProperty<number>("Class");
        this._icon = unpackProperty<string>("Icon");
        this._uuids = unpackProperty<string[]>("UUIDs");
    }

    private _setupPropertyChangeListener(): void {
        this.deviceProxy.connect("g-properties-changed", (_, changed) => {
            let changed_any = false;

            const propertyMap: Record<string, string> = {
                Address: "_address",
                Alias: "_alias",
                Blocked: "_blocked",
                Bonded: "_bonded",
                Connected: "_connected",
                Name: "_name",
                Paired: "_paired",
                Trusted: "_trusted",
                Class: "_class",
                Icon: "_icon",
                UUIDs: "_uuids",
            };

            for (const [dbusProp, privateProp] of Object.entries(propertyMap)) {
                const changedValue = changed.lookup_value(dbusProp, null);
                if (changedValue) {
                    const isBoolean =
                        dbusProp === "Blocked" ||
                        dbusProp === "Bonded" ||
                        dbusProp === "Connected" ||
                        dbusProp === "Paired" ||
                        dbusProp === "Trusted";

                    const isNumber = dbusProp === "Class";
                    const isStringArray = dbusProp === "UUIDs";

                    const newValue = isBoolean
                        ? changedValue.get_boolean()
                        : isNumber
                          ? changedValue.get_uint32()
                          : isStringArray
                            ? changedValue.get_strv()
                            : changedValue.get_string()[0];

                    if ((this as any)[privateProp] !== newValue) {
                        (this as any)[privateProp] = newValue;
                        const notifyProp =
                            dbusProp === "Class"
                                ? "device-class"
                                : dbusProp.toLowerCase();
                        this.notify(notifyProp);
                        changed_any = true;
                    }
                }
            }

            if (changed_any) {
                this.emit("device-changed");
            }
        });
    }

    private _setupBatteryInterface(): void {
        systemBus.signal_subscribe(
            ORG_BLUEZ,
            "org.freedesktop.DBus.ObjectManager",
            "InterfacesAdded",
            null,
            null,
            Gio.DBusSignalFlags.NONE,
            (_, __, ___, ____, _____, params) => {
                const [objectPath, interfaces] = params.deep_unpack() as [
                    string,
                    Record<string, any>,
                ];
                if (
                    objectPath === this._devicePath &&
                    BLUEZ_BATTERY_1 in interfaces
                ) {
                    this._createBatteryProxy();
                }
            },
        );

        systemBus.signal_subscribe(
            ORG_BLUEZ,
            "org.freedesktop.DBus.ObjectManager",
            "InterfacesRemoved",
            null,
            null,
            Gio.DBusSignalFlags.NONE,
            (_, __, ___, ____, _____, params) => {
                const [objectPath, interfaces] = params.deep_unpack() as [
                    string,
                    string[],
                ];
                if (
                    objectPath === this._devicePath &&
                    interfaces.includes(BLUEZ_BATTERY_1)
                ) {
                    this._removeBatteryProxy();
                }
            },
        );

        this._createBatteryProxy();
    }

    private _createBatteryProxy(): void {
        try {
            this.batteryProxy = Gio.DBusProxy.new_sync(
                systemBus,
                Gio.DBusProxyFlags.NONE,
                null,
                ORG_BLUEZ,
                this._devicePath,
                BLUEZ_BATTERY_1,
                null,
            );

            this.batteryProxy.connect("g-properties-changed", (_, changed) => {
                const percentageChanged = changed.lookup_value(
                    "Percentage",
                    null,
                );
                if (percentageChanged) {
                    const newPercentage = percentageChanged.get_byte();
                    if (this._batteryPercentage !== newPercentage) {
                        this._batteryPercentage = newPercentage;

                        this.notify("battery-percentage");
                    }
                }
            });

            const percentage = this.batteryProxy
                .get_cached_property("Percentage")
                ?.deep_unpack() as number | undefined;

            this._batteryPercentage = percentage;

            this.notify("battery-percentage");
        } catch (e) {
            this.batteryProxy = null;
        }
    }

    private _removeBatteryProxy(): void {
        if (this.batteryProxy) {
            this.batteryProxy = null;
            this._batteryPercentage = undefined;

            this.notify("battery-percentage");
        }
    }

    private _setConnecting(connecting: boolean): void {
        if (this._connecting === connecting) return;
        this._connecting = connecting;
        this.notify("connecting");
    }

    private _setTrusted(): void {
        this.deviceProxy.call_sync(
            DBUS_PROPERTIES_SET,
            new GLib.Variant("(ssv)", [
                BLUEZ_DEVICE_1,
                "Trusted",
                new GLib.Variant("b", true),
            ]),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
    }

    get connectedStatus(): string {
        let deviceStatus: string;
        if (this.connected) {
            deviceStatus = "Connected";
        } else if (!this.connected && this.paired) {
            deviceStatus = "Disconnected";
        } else {
            deviceStatus = "Not Set Up";
        }

        return deviceStatus;
    }

    public async connectDevice(): Promise<void> {
        if (this._connecting) return; // Don't do anything if we are mid disconnect / connect

        this._setConnecting(true);
        try {
            await new Promise<void>((resolve, reject) => {
                this.deviceProxy.call(
                    "Connect",
                    null,
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
                    },
                );
            });

            const connectionCount = incrementDeviceConnectionCount(
                this._devicePath,
            );

            /*
             * We'll trust the device after are third time.
             * Refer to: https://www.youtube.com/watch?v=iZJPjFmx3ws
             */
            if (connectionCount === 3) {
                try {
                    this._setTrusted();
                } catch (e) {
                    // Not the end of the world if this fails, but nothing we can do
                    log(`Failed to trust device: ${e}`);
                }
            }
        } finally {
            this._setConnecting(false);
        }
    }

    public async disconnectDevice(): Promise<void> {
        if (this._connecting) return; // Don't do anything if we are mid disconnect / connect

        this._setConnecting(true);
        try {
            await new Promise<void>((resolve, reject) => {
                this.deviceProxy.call(
                    "Disconnect",
                    null,
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
                    },
                );
            });
        } finally {
            this._setConnecting(false);
        }
    }

    public async pairDevice(): Promise<void> {
        if (this._connecting) return;

        try {
            // Block agent from use with other devices until we're done pairing
            this.blockAgent();
            this._setConnecting(true);

            await new Promise<void>((resolve, reject) => {
                this.deviceProxy.call(
                    "Pair",
                    null,
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
                    },
                );
            });
        } finally {
            this.freeAgent();
            this._setConnecting(false);
        }
    }

    // Getters for all properties
    get devicePath(): string {
        return this._devicePath;
    }

    get address(): string {
        return this._address ?? "";
    }

    get alias(): string {
        return this._alias
            ? GLib.utf8_make_valid(this._alias, -1)
            : // The only time alias will be undefined, is if
              // somehow we received a partial object from obex (very unlikely)
              "Unknown Device";
    }

    get blocked(): boolean {
        return this._blocked ?? false;
    }

    get bonded(): boolean {
        return this._bonded ?? false;
    }

    get connected(): boolean {
        return this._connected ?? false;
    }

    get name(): string {
        return this._name ?? "";
    }

    get paired(): boolean {
        return this._paired ?? false;
    }

    get trusted(): boolean {
        return this._trusted ?? false;
    }

    get connecting(): boolean {
        return this._connecting;
    }

    get deviceClass(): number {
        return this._class ?? 0;
    }

    get icon(): string {
        return this._icon ?? "";
    }

    get deviceType(): string {
        return getDeviceTypeFromClass(this.deviceClass);
    }

    get connectionCount(): number {
        return this._connectionCount;
    }

    get uuids(): Set<string> {
        return new Set(this._uuids ?? []);
    }

    get batteryPercentage(): number | undefined {
        return this._batteryPercentage;
    }
}
