import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import { bluetoothManager, ErrorPopUp } from "./bluetooth/bluetooth.js";
import { Device } from "./bluetooth/device.js";
import { DeviceDetailsModal } from "./device-details-modal.js";
import { PinConfirmationDialog } from "./pin-confirmation-dialog.js";
import { FileTransferProgressDialog } from "./file-transfer-progress-dialog.js";
import Gio from "gi://Gio?version=2.0";

export class Window extends Adw.ApplicationWindow {
    private _bluetooth_toggle!: Gtk.Switch;
    private _disabled_state!: Gtk.Box;
    private _disabled_header_label!: Gtk.Label;
    private _disabled_description_label!: Gtk.Label;
    private _enabled_state!: Gtk.Box;
    private _devices_list!: Gtk.ListBox;
    private _discovering_spinner!: Adw.Spinner;
    private _toast_overlay!: Adw.ToastOverlay;

    private _deviceElements: Map<
        string,
        {
            row: Adw.ActionRow;
            spinner: Adw.Spinner;
            statusLabel: Gtk.Label;
        }
    > = new Map();

    private _incomingTransferDialogs: Map<string, FileTransferProgressDialog> =
        new Map();

    static {
        GObject.registerClass(
            {
                Template:
                    "resource:///com/ezratweaver/AdwBluetooth/ui/application-window.ui",
                InternalChildren: [
                    "toast-overlay",
                    "menu-button",
                    "bluetooth-toggle",
                    "disabled-state",
                    "disabled-header-label",
                    "disabled-description-label",
                    "enabled-state",
                    "devices-list",
                    "discovering-spinner",
                ],
            },
            this,
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "window.close" }),
                trigger: Gtk.ShortcutTrigger.parse_string("<Control>w"),
            }),
        );
    }

    constructor(params?: Partial<Adw.ApplicationWindow.ConstructorProps>) {
        super(params);

        if (!bluetoothManager.adapter) {
            this._showNoAdapterState();
            return;
        }

        try {
            bluetoothManager.adapter.bluetoothAgent.register();
        } catch (e) {
            this._showError({
                title: "Failed to register bluetooth agent",
                description: "Another bluetooth application may be running.",
            });
        }

        this._setupPropertyBindings();
        this._setupEventHandlers();
        this._setupDeviceList();
        this._setupActions();
    }

    private _showNoAdapterState(): void {
        this._disabled_header_label.set_label("No Bluetooth Adapter");
        this._disabled_description_label.set_label(
            "Ensure BlueZ is configured correctly and try again.",
        );
        this._disabled_state.set_visible(true);
        this._enabled_state.set_visible(false);
        this._bluetooth_toggle.set_visible(false);
    }

    private _setupActions(): void {
        const toggleDiscoveryAction = new Gio.SimpleAction({
            name: "toggle-discovery",
        });

        toggleDiscoveryAction.connect("activate", () => {
            if (!bluetoothManager.adapter) return;

            if (bluetoothManager.adapter.discovering) {
                bluetoothManager.adapter.stopDiscovery();
            } else {
                bluetoothManager.adapter.startDiscovery();
            }
        });

        const aboutAction = new Gio.SimpleAction({
            name: "about",
        });

        aboutAction.connect("activate", () => {
            this._showAbout();
        });

        this.add_action(toggleDiscoveryAction);
        this.add_action(aboutAction);
    }

    private _setupPropertyBindings(): void {
        if (!bluetoothManager.adapter) return;

        bluetoothManager.adapter.bind_property(
            "powered",
            this._bluetooth_toggle,
            "active",
            GObject.BindingFlags.SYNC_CREATE,
        );

        bluetoothManager.adapter.bind_property(
            "powered",
            this._disabled_state,
            "visible",
            GObject.BindingFlags.SYNC_CREATE |
                GObject.BindingFlags.INVERT_BOOLEAN,
        );

        bluetoothManager.adapter.bind_property(
            "powered",
            this._enabled_state,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );

        bluetoothManager.adapter.bind_property(
            "discovering",
            this._discovering_spinner,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );
    }

    private _setupEventHandlers(): void {
        if (!bluetoothManager.adapter) return;

        // On enabling / disabling bluetooth
        this._bluetooth_toggle.connect("state-set", (_, state) => {
            if (!bluetoothManager.adapter) {
                return true; // Prevent switch toggle if no adapter
            }

            try {
                bluetoothManager.adapter.setAdapterPower(state);
                return false; // Allow switch to toggle
            } catch (error) {
                this._showError({
                    title: "Power Control Error",
                    description: `Failed to set adapter power: ${error}`,
                });
                return true; // Prevent switch toggle on error
            }
        });

        // Adapter listeners
        bluetoothManager.adapter.connect(
            "device-added",
            (_, devicePath: string) => this._addDevice(devicePath),
        );
        bluetoothManager.adapter.connect(
            "device-removed",
            (_, devicePath: string) => this._removeDevice(devicePath),
        );

        // Agent event listeners
        bluetoothManager.adapter.bluetoothAgent.connect(
            "confirmation-request",
            (_, devicePath: string, requestId: string, passkey: number) =>
                this._showConfirmationDialog(devicePath, requestId, passkey),
        );

        bluetoothManager.adapter.bluetoothAgent.connect(
            "authorization-request",
            (_, devicePath: string, requestId: string) =>
                this._showAuthorizationDialog(devicePath, requestId),
        );

        bluetoothManager.adapter.bluetoothAgent.connect(
            "pin-display",
            (_, devicePath: string, pincode: string) =>
                this._showPinDisplayDialog(devicePath, pincode),
        );

        bluetoothManager.adapter.bluetoothAgent.connect(
            "passkey-display",
            (_, devicePath: string, passkey: number) =>
                this._showPasskeyDisplayDialog(devicePath, passkey),
        );

        if (bluetoothManager.adapter.obexManager) {
            bluetoothManager.adapter.obexManager.connect(
                "receive-file-request",
                (_, requestId: string, filename: string, size: string) => {
                    this._showObexAuthorizationDialog(
                        requestId,
                        filename,
                        size,
                    );
                },
            );

            bluetoothManager.adapter.obexManager.connect(
                "transfer-started",
                (_, transferPath: string, filename: string) =>
                    this._showIncomingTransferProgress(transferPath, filename),
            );

            bluetoothManager.adapter.obexManager.connect(
                "transfer-progress",
                (_, transferPath: string, transferred: number, total: number) =>
                    this._updateIncomingTransferProgress(
                        transferPath,
                        transferred,
                        total,
                    ),
            );

            bluetoothManager.adapter.obexManager.connect(
                "transfer-completed",
                (_, transferPath: string) =>
                    this._onIncomingTransferCompleted(transferPath),
            );

            bluetoothManager.adapter.obexManager.connect(
                "transfer-failed",
                (_, transferPath: string) =>
                    this._onIncomingTransferFailed(transferPath),
            );
        }
    }

    private _setupDeviceList(): void {
        if (!bluetoothManager.adapter) return;

        /*
         * Sorts devices by priority as:
         *
         * 1. Connected devices first
         * 2. Known but not connected devices second
         * 3. Unknown/non paired devices last
         */
        this._devices_list.set_sort_func((row1, row2) => {
            const device1 = this._findDeviceByPath(row1.name);
            const device2 = this._findDeviceByPath(row2.name);

            if (!device1 || !device2) return 0;

            if (device1.connected && !device2.connected) return -1;
            if (!device1.connected && device2.connected) return 1;

            if (device1.paired && !device2.paired) return -1;
            if (!device1.paired && device2.paired) return 1;

            if (device1.connectionCount > device2.connectionCount) return -1;
            if (device2.connectionCount > device1.connectionCount) return 1;

            return 0;
        });

        bluetoothManager.adapter.devices.forEach(({ devicePath }) =>
            this._addDevice(devicePath),
        );
    }

    private _findDeviceByPath(devicePath: string): Device | undefined {
        return bluetoothManager.adapter?.devices.find(
            (d) => d.devicePath === devicePath,
        );
    }

    private _createDeviceRow(device: Device): {
        row: Adw.ActionRow;
        spinner: Adw.Spinner;
        statusLabel: Gtk.Label;
    } {
        const row = new Adw.ActionRow({
            name: device.devicePath,
            title: device.alias,
            activatable: true,
        });

        const statusLabel = new Gtk.Label({
            label: device.connectedStatus,
        });

        const spinner = new Adw.Spinner({
            visible: false,
        });

        row.add_suffix(statusLabel);
        row.add_suffix(spinner);

        device.bind_property(
            "connecting",
            spinner,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );

        device.bind_property(
            "connecting",
            statusLabel,
            "visible",
            GObject.BindingFlags.SYNC_CREATE |
                GObject.BindingFlags.INVERT_BOOLEAN,
        );

        return { row, spinner, statusLabel };
    }

    // Dialog methods
    private _showAbout() {
        const aboutDialog = new Adw.AboutDialog({
            application_name: "Adwaita Bluetooth",
            application_icon: "bluetooth-active-symbolic",
            version: "0.1.0",
            developer_name: "Ezra Weaver",
            website: "https://github.com/ezratweaver/adw-bluetooth",
            issue_url: "https://github.com/ezratweaver/adw-bluetooth/issues",
        });

        aboutDialog.present(this);
    }

    private _showError = (error: ErrorPopUp) => {
        const dialog = new Adw.AlertDialog({
            heading: error.title,
            body: error.description,
            closeResponse: "ok",
            defaultResponse: "ok",
        });

        dialog.add_response("ok", "OK");

        dialog.present(this);
    };

    private _showConfirmationDialog(
        devicePath: string,
        requestId: string,
        passkey: number,
    ) {
        const device = this._findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            passkey.toString().padStart(6, "0"),
        );

        dialog.connect("confirmed", () => {
            bluetoothManager.adapter?.bluetoothAgent.confirmPairing(requestId);
        });

        dialog.connect("cancelled", () => {
            bluetoothManager.adapter?.bluetoothAgent.cancelConfirmation(
                requestId,
            );
        });

        dialog.present(this);
    }

    private _showAuthorizationDialog(devicePath: string, requestId: string) {
        const device = this._findDeviceByPath(devicePath);

        const dialog = new Adw.AlertDialog({
            heading: "Bluetooth Pairing Request",
            body: `"${device?.alias ?? "Unknown Device"}" would like to pair\nwith your computer.`,
            closeResponse: "cancel",
            defaultResponse: "allow",
        });

        dialog.add_response("cancel", "_Cancel");
        dialog.add_response("allow", "_Allow");

        dialog.connect("response", (_, response: string) => {
            if (response === "allow") {
                bluetoothManager.adapter?.bluetoothAgent.confirmAuthorization(
                    requestId,
                );
            } else {
                bluetoothManager.adapter?.bluetoothAgent.cancelAuthorization(
                    requestId,
                );
            }
        });

        dialog.present(this);
    }

    private _showPinDisplayDialog(devicePath: string, pincode: string) {
        const device = this._findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            pincode,
            true,
        );

        dialog.present(this);
    }

    private _showPasskeyDisplayDialog(devicePath: string, passkey: number) {
        const device = this._findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            passkey.toString().padStart(6, "0"),
            true,
        );

        dialog.present(this);
    }

    private _showObexAuthorizationDialog(
        requestId: string,
        filename: string,
        size: string,
    ) {
        const sizeInMB = (parseInt(size) / 1024 / 1024).toFixed(2);

        const dialog = new Adw.AlertDialog({
            heading: "Incoming File Transfer",
            body: `A device wants to send you the file "${filename}" (${sizeInMB} MB).\n\nDo you want to accept this file?`,
            closeResponse: "reject",
            defaultResponse: "accept",
        });

        dialog.add_response("reject", "_Reject");
        dialog.add_response("accept", "_Accept");

        dialog.connect("response", (_, response: string) => {
            if (response === "accept") {
                bluetoothManager.adapter?.obexManager?.acceptAuthorization(
                    requestId,
                );
            } else {
                bluetoothManager.adapter?.obexManager?.rejectAuthorization(
                    requestId,
                );
            }
        });

        dialog.present(this);
    }

    private _showIncomingTransferProgress(
        transferPath: string,
        filename: string,
    ) {
        const progressDialog = new FileTransferProgressDialog("Unknown Device");
        progressDialog.updateCurrentFile(filename);
        progressDialog.updateProgress(0, 1);

        progressDialog.connect("cancelled", () => {
            bluetoothManager.adapter?.obexManager?.cancelTransfer(transferPath);
            this._incomingTransferDialogs.delete(transferPath);
        });

        this._incomingTransferDialogs.set(transferPath, progressDialog);
        progressDialog.present(this);
    }

    private _updateIncomingTransferProgress(
        transferPath: string,
        transferred: number,
        total: number,
    ) {
        const dialog = this._incomingTransferDialogs.get(transferPath);
        if (dialog) {
            dialog.updateProgress(transferred, total);
        }
    }

    private _onIncomingTransferCompleted(transferPath: string) {
        const dialog = this._incomingTransferDialogs.get(transferPath);
        if (dialog) {
            dialog.close();
            this._incomingTransferDialogs.delete(transferPath);

            const toast = new Adw.Toast({
                title: "File received successfully",
                timeout: 3,
            });
            this._toast_overlay.add_toast(toast);
        }
    }

    private _onIncomingTransferFailed(transferPath: string) {
        const dialog = this._incomingTransferDialogs.get(transferPath);
        if (dialog) {
            dialog.showError("File transfer failed");
            this._incomingTransferDialogs.delete(transferPath);
        }
    }

    private _showDeviceDetails(device: Device) {
        const detailsWindow = new DeviceDetailsModal(device, this);
        detailsWindow.present();
    }

    // Device management methods
    private _addDevice(devicePath: string) {
        const device = this._findDeviceByPath(devicePath);
        if (!device) {
            return;
        }

        const deviceHasName = !!device.name;
        const { row, spinner, statusLabel } = this._createDeviceRow(device);

        this._deviceElements.set(device.devicePath, {
            row,
            spinner,
            statusLabel,
        });

        row.connect("activated", () => {
            if (!device.connecting) {
                if (device.paired) {
                    this._showDeviceDetails(device);
                } else {
                    this._handleDevicePair(device);
                }
            }
        });

        if (deviceHasName) {
            this._devices_list.append(row);
        }

        device.connect("device-changed", (device: Device) => {
            row.set_title(device.alias);

            statusLabel.set_label(device.connectedStatus);

            if (!deviceHasName && !!device.name) {
                this._devices_list.append(row);
            }

            // Trigger resort when connection status changes
            this._devices_list.invalidate_sort();
        });
    }

    private _removeDevice(devicePath: string) {
        const elements = this._deviceElements.get(devicePath);

        if (elements) {
            // Check if the row is actually a child before removing
            const parent = elements.row.get_parent();
            if (parent === this._devices_list) {
                try {
                    this._devices_list.remove(elements.row);
                } catch (error) {
                    log(`Error removing device row: ${error}`);
                }
            }

            this._deviceElements.delete(devicePath);
        }
    }

    private async _handleDevicePair(device: Device) {
        try {
            if (!device.paired) {
                // Stop discovery while pairing/connecting
                bluetoothManager.adapter?.stopDiscovery();
                // Pair first if not paired
                await device.pairDevice();
                // After successful pairing, connect automatically
                await device.connectDevice();
            } else if (device.connected) {
                // If connected, disconnect
                await device.disconnectDevice();
            } else {
                // If paired but not connected, connect
                await device.connectDevice();
            }
        } catch (error) {
            if (!device.paired || device.connected) {
                bluetoothManager.adapter?.startDiscovery();
            }

            const action = !device.paired
                ? "pair with"
                : device.connected
                  ? "disconnect from"
                  : "connect to";

            log(`An error occurred while trying to ${action} device: ${error}`);

            let toastMessage = `An error occurred attempting to ${action} with ${device.alias}`;

            if (
                error instanceof Gio.IOErrorEnum &&
                error.code === Gio.IOErrorEnum.DBUS_ERROR
            ) {
                switch (error.code) {
                    case Gio.DBusError.INVALID_SIGNATURE:
                    case Gio.DBusError.AUTH_FAILED:
                        toastMessage = `Authentication failed with ${device.alias}`;
                        break;
                }
            }

            const toast = new Adw.Toast({
                title: toastMessage,
                timeout: 5,
            });
            this._toast_overlay.add_toast(toast);
        }
    }

    vfunc_close_request(): boolean {
        bluetoothManager.destroy();
        return super.vfunc_close_request();
    }
}
