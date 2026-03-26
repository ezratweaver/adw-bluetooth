import GLib from "gi://GLib?version=2.0";
import GObject from "gi://GObject?version=2.0";

export interface AdapterData {
    path: string;
    alias: string;
    powered: boolean;
    discovering: boolean;
}

export function parseAdapterData(variant: GLib.Variant): AdapterData {
    const [path, alias, powered, discovering] = variant.deep_unpack() as any;
    return { path, alias, powered, discovering };
}

export class Adapter extends GObject.Object {
    private _path!: string;
    private _alias!: string;
    private _powered!: boolean;
    private _discovering!: boolean;

    static {
        GObject.registerClass(
            {
                GTypeName: "BluetoothAdapter",
                Properties: {
                    path: GObject.ParamSpec.string(
                        "path",
                        "Path",
                        "DBus object path",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    alias: GObject.ParamSpec.string(
                        "alias",
                        "Alias",
                        "Adapter alias",
                        GObject.ParamFlags.READWRITE,
                        "",
                    ),
                    powered: GObject.ParamSpec.boolean(
                        "powered",
                        "Powered",
                        "Is powered on",
                        GObject.ParamFlags.READWRITE,
                        false,
                    ),
                    discovering: GObject.ParamSpec.boolean(
                        "discovering",
                        "Discovering",
                        "Is discovering",
                        GObject.ParamFlags.READWRITE,
                        false,
                    ),
                },
            },
            this,
        );
    }

    constructor(data: AdapterData) {
        super();
        this._path = data.path;
        this._alias = data.alias;
        this._powered = data.powered;
        this._discovering = data.discovering;
    }

    updateFromDaemon(data: AdapterData): void {
        if (this._alias !== data.alias) {
            this._alias = data.alias;
            this.notify("alias");
        }
        if (this._powered !== data.powered) {
            this._powered = data.powered;
            this.notify("powered");
        }
        if (this._discovering !== data.discovering) {
            this._discovering = data.discovering;
            this.notify("discovering");
        }
    }

    get path(): string {
        return this._path;
    }

    get alias(): string {
        return this._alias;
    }

    get powered(): boolean {
        return this._powered;
    }

    get discovering(): boolean {
        return this._discovering;
    }
}
