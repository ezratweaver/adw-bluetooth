import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";
import GObject from "gi://GObject?version=2.0";
import { ORG_BLUEZ, systemBus } from "./bluetooth.js";

export const BLUEZ_AGENT_1 = "org.bluez.Agent1";
export const BLUEZ_AGENT_MANAGER_1 = "org.bluez.AgentManager1";

export class BluetoothAgent extends GObject.Object {
    private agentPath: string = "/com/ezratweaver/AdwBluetooth/agent";
    private agentNodeInfo: Gio.DBusNodeInfo;
    private registrationId: number | null = null;
    private pendingRequests: Map<string, Gio.DBusMethodInvocation> = new Map();

    static {
        GObject.registerClass(
            {
                Signals: {
                    "confirmation-request": {
                        param_types: [
                            GObject.TYPE_STRING,
                            GObject.TYPE_STRING,
                            GObject.TYPE_UINT,
                        ],
                    },
                    "authorization-request": {
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING],
                    },
                    "pin-display": {
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING],
                    },
                    "passkey-display": {
                        param_types: [GObject.TYPE_STRING, GObject.TYPE_UINT],
                    },
                },
            },
            this
        );
    }

    constructor() {
        super();

        const agentXml = `
            <node>
                <interface name="org.bluez.Agent1">
                    <method name="RequestPinCode">
                        <arg name="device" type="o" direction="in"/>
                        <arg name="pincode" type="s" direction="out"/>
                    </method>
                    <method name="DisplayPinCode">
                        <arg name="device" type="o" direction="in"/>
                        <arg name="pincode" type="s" direction="in"/>
                    </method>
                    <method name="RequestPasskey">
                        <arg name="device" type="o" direction="in"/>
                        <arg name="passkey" type="u" direction="out"/>
                    </method>
                    <method name="DisplayPasskey">
                        <arg name="device" type="o" direction="in"/>
                        <arg name="passkey" type="u" direction="in"/>
                        <arg name="entered" type="q" direction="in"/>
                    </method>
                    <method name="RequestConfirmation">
                        <arg name="device" type="o" direction="in"/>
                        <arg name="passkey" type="u" direction="in"/>
                    </method>
                    <method name="RequestAuthorization">
                        <arg name="device" type="o" direction="in"/>
                    </method>
                    <method name="AuthorizeService">
                        <arg name="device" type="o" direction="in"/>
                        <arg name="uuid" type="s" direction="in"/>
                    </method>
                    <method name="Cancel"/>
                </interface>
            </node>
        `;

        this.agentNodeInfo = Gio.DBusNodeInfo.new_for_xml(agentXml);
    }

    public register(): void {
        if (this.registrationId) {
            throw new Error("Another device is already using agent to pair");
        }

        const agentInterface =
            this.agentNodeInfo.lookup_interface(BLUEZ_AGENT_1);
        if (!agentInterface) {
            throw new Error("Failed to lookup Agent interface");
        }

        this.registrationId = systemBus.register_object(
            this.agentPath,
            agentInterface,
            this._handleMethodCall.bind(this),
            null,
            null
        );

        // Register agent with BlueZ
        systemBus.call_sync(
            ORG_BLUEZ,
            "/org/bluez",
            BLUEZ_AGENT_MANAGER_1,
            "RegisterAgent",
            new GLib.Variant("(os)", [this.agentPath, "DisplayYesNo"]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        // Request default agent
        systemBus.call_sync(
            ORG_BLUEZ,
            "/org/bluez",
            BLUEZ_AGENT_MANAGER_1,
            "RequestDefaultAgent",
            new GLib.Variant("(o)", [this.agentPath]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
    }

    public unregister(): void {
        if (this.registrationId) {
            systemBus.unregister_object(this.registrationId);
            this.registrationId = null;

            try {
                systemBus.call_sync(
                    ORG_BLUEZ,
                    "/org/bluez",
                    BLUEZ_AGENT_MANAGER_1,
                    "UnregisterAgent",
                    new GLib.Variant("(o)", [this.agentPath]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null
                );
            } catch (error) {
                log(`Failed to unregister agent: ${error}`);
            }
        }
    }

    private _handleMethodCall(
        _: Gio.DBusConnection,
        _1: string,
        _2: string,
        _3: string,
        methodName: string,
        parameters: GLib.Variant,
        invocation: Gio.DBusMethodInvocation
    ): void {
        const handleAsync = async () => {
            try {
                switch (methodName) {
                    case "DisplayPinCode": {
                        const [devicePath, pincode] =
                            parameters.deep_unpack() as [string, string];

                        this.emit("pin-display", devicePath, pincode);
                        invocation.return_value(null);
                        break;
                    }
                    case "DisplayPasskey": {
                        const [devicePath, passkey] =
                            parameters.deep_unpack() as [string, number];

                        this.emit("passkey-display", devicePath, passkey);
                        invocation.return_value(null);
                        break;
                    }
                    case "RequestAuthorization": {
                        const [devicePath] = parameters.deep_unpack() as [
                            string
                        ];
                        const requestId = `authorize-${Date.now()}`;

                        this.pendingRequests.set(requestId, invocation);

                        this.emit(
                            "authorization-request",
                            devicePath,
                            requestId
                        );
                        break;
                    }
                    case "RequestConfirmation": {
                        const [devicePath, passkey] =
                            parameters.deep_unpack() as [string, number];
                        const requestId = `confirm-${Date.now()}`;

                        this.pendingRequests.set(requestId, invocation);

                        this.emit(
                            "confirmation-request",
                            devicePath,
                            requestId,
                            passkey
                        );
                        break;
                    }
                    case "AuthorizeService": {
                        // When a bluetooth peripheral requests for access to a specifc service, this gets called
                        // Most modern bluetooth managers accept by default, so thats what we'll do.
                        invocation.return_value(null);
                        break;
                    }
                    case "Cancel": {
                        invocation.return_value(null);
                        break;
                    }
                    default:
                        invocation.return_dbus_error(
                            "org.freedesktop.DBus.Error.UnknownMethod",
                            `Unknown method: ${methodName}`
                        );
                        break;
                }
            } catch (error) {
                invocation.return_dbus_error(
                    "org.bluez.Error.Failed",
                    `Agent error: ${error}`
                );
            }
        };

        handleAsync();
    }

    public confirmPairing(requestId: string): void {
        const invocation = this.pendingRequests.get(requestId);
        if (invocation) {
            invocation.return_value(null);
            this.pendingRequests.delete(requestId);
        }
    }

    public cancelPairing(requestId: string): void {
        const invocation = this.pendingRequests.get(requestId);
        if (invocation) {
            invocation.return_dbus_error(
                "org.bluez.Error.Rejected",
                "Pairing confirmation was rejected by user"
            );
            this.pendingRequests.delete(requestId);
        }
    }

    public confirmAuthorization(requestId: string): void {
        const invocation = this.pendingRequests.get(requestId);
        if (invocation) {
            invocation.return_value(null);
            this.pendingRequests.delete(requestId);
        }
    }

    public cancelAuthorization(requestId: string): void {
        const invocation = this.pendingRequests.get(requestId);
        if (invocation) {
            invocation.return_dbus_error(
                "org.bluez.Error.Rejected",
                "Authorization request rejected by user"
            );
            this.pendingRequests.delete(requestId);
        }
    }

}
