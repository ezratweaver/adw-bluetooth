import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";
import GObject from "gi://GObject?version=2.0";
import { sessionBus } from "./bluetooth.js";

export const ORG_BLUEZ_OBEX = "org.bluez.obex";
export const OBEX_CLIENT_1 = "org.bluez.obex.Client1";
export const OBEX_TRANSFER_1 = "org.bluez.obex.Transfer1";
export const OBEX_OBJECT_PUSH_1 = "org.bluez.obex.ObjectPush1";
export const OBEX_AGENT_1 = "org.bluez.obex.Agent1";
export const OBEX_AGENT_MANAGER1 = "org.bluez.obex.AgentManager1";

export class ObexManager extends GObject.Object {
    private clientProxy: Gio.DBusProxy;
    private activeTransfers: Map<string, Gio.DBusProxy> = new Map(); // transferPath -> transferProxy
    private agentPath: string = "/com/ezratweaver/AdwBluetooth/obex_agent";
    private agentNodeInfo: Gio.DBusNodeInfo;
    private registrationId: number | null = null;

    static {
        GObject.registerClass(
            {
                Signals: {
                    "transfer-started": {
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING],
                    },
                    "transfer-progress": {
                        param_types: [
                            GObject.TYPE_STRING,
                            GObject.TYPE_UINT64,
                            GObject.TYPE_UINT64,
                        ],
                    },
                    "transfer-completed": {
                        param_types: [GObject.TYPE_STRING],
                    },
                    "transfer-failed": {
                        param_types: [GObject.TYPE_STRING],
                    },
                },
            },
            this,
        );
    }

    constructor() {
        super();

        this.clientProxy = Gio.DBusProxy.new_sync(
            sessionBus,
            Gio.DBusProxyFlags.NONE,
            null,
            ORG_BLUEZ_OBEX,
            "/org/bluez/obex",
            OBEX_CLIENT_1,
            null,
        );

        const agentXml = `
            <node>
                <interface name="org.bluez.obex.Agent1">
                    <method name="Release"/>
                    <method name="AuthorizePush">
                        <arg name="transfer" type="o" direction="in"/>
                        <arg name="filename" type="s" direction="out"/>
                    </method>
                    <method name="Cancel"/>
                </interface>
            </node>
        `;

        this.agentNodeInfo = Gio.DBusNodeInfo.new_for_xml(agentXml);

        this.registerAgent();
    }

    public async createSession(deviceAddress: string): Promise<string | null> {
        try {
            const result = await new Promise<GLib.Variant<any>>(
                (resolve, reject) => {
                    this.clientProxy.call(
                        "CreateSession",
                        new GLib.Variant("(sa{sv})", [
                            deviceAddress,
                            {
                                Target: new GLib.Variant("s", "opp"),
                            },
                        ]),
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null,
                        (proxy, result) => {
                            try {
                                const response = proxy?.call_finish(result);
                                if (response) {
                                    resolve(response);
                                } else {
                                    reject(
                                        new Error(
                                            "No sessionPath returned from session creation",
                                        ),
                                    );
                                }
                            } catch (error) {
                                reject(error);
                            }
                        },
                    );
                },
            );

            const [sessionPath] = result.deep_unpack() as [string];
            return sessionPath;
        } catch (error) {
            log(`Failed to create OBEX session: ${error}`);
            return null;
        }
    }

    public async removeSession(sessionPath: string): Promise<void> {
        try {
            await new Promise<void>((resolve, reject) => {
                this.clientProxy.call(
                    "RemoveSession",
                    new GLib.Variant("(o)", [sessionPath]),
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
        } catch (error) {
            log(`Failed to remove OBEX session: ${error}`);
            throw error;
        }
    }

    private _setupTransferMonitoring(
        transferPath: string,
        transferProxy: Gio.DBusProxy,
    ): void {
        // Monitor transfer progress
        transferProxy.connect("g-properties-changed", (_, changed) => {
            const statusValue = changed.lookup_value("Status", null);
            const transferredValue = changed.lookup_value("Transferred", null);
            const sizeValue = transferProxy.get_cached_property("Size");

            if (statusValue) {
                const status = statusValue.get_string()[0];

                if (status === "complete") {
                    this.emit("transfer-completed", transferPath);
                    this.activeTransfers.delete(transferPath);
                } else if (status === "error") {
                    this.emit("transfer-failed", transferPath);
                    this.activeTransfers.delete(transferPath);
                }
            }

            if (transferredValue && sizeValue) {
                const transferred = transferredValue.get_uint64();
                const size = sizeValue.get_uint64();
                this.emit("transfer-progress", transferPath, transferred, size);
            }
        });
    }

    public async sendFileWithSession(
        sessionPath: string,
        filePath: string,
    ): Promise<string | null> {
        try {
            const objectPushProxy = Gio.DBusProxy.new_sync(
                sessionBus,
                Gio.DBusProxyFlags.NONE,
                null,
                ORG_BLUEZ_OBEX,
                sessionPath,
                OBEX_OBJECT_PUSH_1,
                null,
            );

            const result = await new Promise<any>((resolve, reject) => {
                objectPushProxy.call(
                    "SendFile",
                    new GLib.Variant("(s)", [filePath]),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (proxy, result) => {
                        try {
                            const response = proxy?.call_finish(result);
                            resolve(response);
                        } catch (error) {
                            reject(error);
                        }
                    },
                );
            });

            const [transferPath] = result.deep_unpack() as [
                string,
                Record<string, GLib.Variant>,
            ];

            // Store transfer proxy for monitoring
            const transferProxy = Gio.DBusProxy.new_sync(
                sessionBus,
                Gio.DBusProxyFlags.NONE,
                null,
                ORG_BLUEZ_OBEX,
                transferPath,
                OBEX_TRANSFER_1,
                null,
            );

            this.activeTransfers.set(transferPath, transferProxy);
            this._setupTransferMonitoring(transferPath, transferProxy);

            // Extract filename from path for the signal
            const filename = filePath.split("/").pop() || filePath;
            this.emit("transfer-started", transferPath, filename);

            return transferPath;
        } catch (error) {
            log(`Failed to send file: ${error}`);
            return null;
        }
    }

    public cancelTransfer(transferPath: string): void {
        const transferProxy = this.activeTransfers.get(transferPath);
        if (transferProxy) {
            try {
                transferProxy.call_sync(
                    "Cancel",
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                );
                this.activeTransfers.delete(transferPath);
            } catch (error) {
                log(`Failed to cancel transfer: ${error}`);
            }
        }
    }

    public registerAgent(): void {
        if (this.registrationId) {
            return; // Already registered
        }

        const agentInterface =
            this.agentNodeInfo.lookup_interface(OBEX_AGENT_1);
        if (!agentInterface) {
            throw new Error("Failed to lookup OBEX Agent interface");
        }

        this.registrationId = sessionBus.register_object(
            this.agentPath,
            agentInterface,
            this._handleAgentMethodCall.bind(this),
            null,
            null,
        );

        try {
            sessionBus.call_sync(
                ORG_BLUEZ_OBEX,
                "/org/bluez/obex",
                OBEX_AGENT_MANAGER1,
                "RegisterAgent",
                new GLib.Variant("(o)", [this.agentPath]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
        } catch (error) {
            if (this.registrationId) {
                sessionBus.unregister_object(this.registrationId);
                this.registrationId = null;
            }
            throw new Error(`Failed to register OBEX agent: ${error}`);
        }
    }

    public unregisterAgent(): void {
        if (this.registrationId) {
            sessionBus.unregister_object(this.registrationId);
            this.registrationId = null;

            try {
                sessionBus.call_sync(
                    ORG_BLUEZ_OBEX,
                    "/org/bluez/obex",
                    OBEX_AGENT_MANAGER1,
                    "UnregisterAgent",
                    new GLib.Variant("(o)", [this.agentPath]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                );
            } catch (error) {
                log(`Failed to unregister OBEX agent: ${error}`);
            }
        }
    }

    private _handleAgentMethodCall(
        _: Gio.DBusConnection,
        _1: string,
        _2: string,
        _3: string,
        methodName: string,
        parameters: GLib.Variant,
        invocation: Gio.DBusMethodInvocation,
    ): void {
        try {
            switch (methodName) {
                case "Release":
                    // TODO: Implement agent release handling
                    this.registrationId = null;
                    invocation.return_value(null);
                    break;

                case "AuthorizePush": {
                    // TODO: Implement authorization dialog for incoming file transfers
                    invocation.return_dbus_error(
                        "org.bluez.obex.Error.Rejected",
                        "File transfer authorization not implemented",
                    );
                    break;
                }

                case "Cancel":
                    // TODO: Implement transfer cancellation handling
                    invocation.return_value(null);
                    break;

                default:
                    invocation.return_dbus_error(
                        "org.freedesktop.DBus.Error.UnknownMethod",
                        `Unknown method: ${methodName}`,
                    );
                    break;
            }
        } catch (error) {
            invocation.return_dbus_error(
                "org.bluez.obex.Error.Failed",
                `OBEX Agent error: ${error}`,
            );
        }
    }

    public destroy(): void {
        // Cancel all active transfers
        for (const [transferPath] of this.activeTransfers) {
            this.cancelTransfer(transferPath);
        }
        this.activeTransfers.clear();

        this.unregisterAgent();
    }
}
