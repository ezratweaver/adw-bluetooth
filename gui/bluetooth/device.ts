import GLib from "gi://GLib?version=2.0";
import GObject from "gi://GObject?version=2.0";

import { getDeviceTypeFromClass } from "../services/device-metadata.js";

export interface DeviceData {
    path: string;
    mac: string;
    name: string;
    alias: string;
    connected: boolean;
    paired: boolean;
    trusted: boolean;
    deviceClass: number;
    icon: string;
    uuids: string[];
    batteryPercentage: number | null;
}

export function parseDeviceData(variant: GLib.Variant): DeviceData {
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
        rawBattery,
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
        deviceClass,
        icon,
        uuids,
        batteryPercentage: rawBattery < 0 ? null : rawBattery,
    };
}

export class Device extends GObject.Object {
    private _path!: string;
    private _mac!: string;
    private _name!: string;
    private _alias!: string;
    private _connected!: boolean;
    private _paired!: boolean;
    private _trusted!: boolean;
    private _deviceClass!: number;
    private _icon!: string;
    private _uuids!: Set<string>;
    private _batteryPercentage!: number | null;
    private _connecting: boolean = false;

    static {
        GObject.registerClass(
            {
                GTypeName: "BluetoothDevice",
                Properties: {
                    path: GObject.ParamSpec.string(
                        "path",
                        "Path",
                        "DBus object path",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    mac: GObject.ParamSpec.string(
                        "mac",
                        "MAC",
                        "MAC address",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    name: GObject.ParamSpec.string(
                        "name",
                        "Name",
                        "Device name",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    alias: GObject.ParamSpec.string(
                        "alias",
                        "Alias",
                        "Device alias",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    connected: GObject.ParamSpec.boolean(
                        "connected",
                        "Connected",
                        "Is connected",
                        GObject.ParamFlags.READWRITE,
                        false,
                    ),
                    paired: GObject.ParamSpec.boolean(
                        "paired",
                        "Paired",
                        "Is paired",
                        GObject.ParamFlags.READWRITE,
                        false,
                    ),
                    trusted: GObject.ParamSpec.boolean(
                        "trusted",
                        "Trusted",
                        "Is trusted",
                        GObject.ParamFlags.READWRITE,
                        false,
                    ),
                    "device-class": GObject.ParamSpec.uint(
                        "device-class",
                        "Device Class",
                        "Bluetooth device class",
                        GObject.ParamFlags.READWRITE,
                        0,
                        0xffffffff,
                        0,
                    ),
                    icon: GObject.ParamSpec.string(
                        "icon",
                        "Icon",
                        "Icon name",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    "battery-percentage": GObject.ParamSpec.int(
                        "battery-percentage",
                        "Battery Percentage",
                        "Battery percentage (null if unavailable)",
                        GObject.ParamFlags.READWRITE,
                        0,
                        100,
                        0,
                    ),
                    connecting: GObject.ParamSpec.boolean(
                        "connecting",
                        "Connecting",
                        "Is currently connecting",
                        GObject.ParamFlags.READWRITE,
                        false,
                    ),
                },
            },
            this,
        );
    }

    constructor(data: DeviceData) {
        super();
        this._path = data.path;
        this._mac = data.mac;
        this._name = data.name;
        this._alias = data.alias;
        this._connected = data.connected;
        this._paired = data.paired;
        this._trusted = data.trusted;
        this._deviceClass = data.deviceClass;
        this._icon = data.icon;
        this._uuids = new Set(data.uuids);
        this._batteryPercentage = data.batteryPercentage;
    }

    updateFromDaemon(data: DeviceData): void {
        if (this._name !== data.name) {
            this._name = data.name;
            this.notify("name");
        }
        if (this._alias !== data.alias) {
            this._alias = data.alias;
            this.notify("alias");
        }
        if (this._connected !== data.connected) {
            this._connected = data.connected;
            this.notify("connected");
        }
        if (this._paired !== data.paired) {
            this._paired = data.paired;
            this.notify("paired");
        }
        if (this._trusted !== data.trusted) {
            this._trusted = data.trusted;
            this.notify("trusted");
        }
        if (this._deviceClass !== data.deviceClass) {
            this._deviceClass = data.deviceClass;
            this.notify("device-class");
        }
        if (this._icon !== data.icon) {
            this._icon = data.icon;
            this.notify("icon");
        }
        if (this._batteryPercentage !== data.batteryPercentage) {
            this._batteryPercentage = data.batteryPercentage;
            this.notify("battery-percentage");
        }
        this._uuids = new Set(data.uuids);
    }

    get connectedStatus(): string {
        if (this._connected) {
            return "Connected";
        }
        if (this._paired) {
            return "Disconnected";
        }
        return "Not Set Up";
    }

    get deviceType(): string {
        return getDeviceTypeFromClass(this._deviceClass);
    }

    get connecting(): boolean {
        return this._connecting;
    }

    set connecting(value: boolean) {
        if (this._connecting !== value) {
            this._connecting = value;
            this.notify("connecting");
        }
    }

    get path(): string {
        return this._path;
    }
    get mac(): string {
        return this._mac;
    }
    get name(): string {
        return this._name;
    }
    get alias(): string {
        return this._alias;
    }
    get connected(): boolean {
        return this._connected;
    }
    get paired(): boolean {
        return this._paired;
    }
    get trusted(): boolean {
        return this._trusted;
    }
    get deviceClass(): number {
        return this._deviceClass;
    }
    get icon(): string {
        return this._icon;
    }
    get uuids(): Set<string> {
        return this._uuids;
    }
    get batteryPercentage(): number | null {
        return this._batteryPercentage;
    }
}
