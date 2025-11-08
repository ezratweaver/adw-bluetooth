import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import { bluetooth, ErrorPopUp } from "../bluetooth/bluetooth.js";
import { Device } from "../bluetooth/device.js";
import { DeviceDetailsModal } from "./device-details.js";
import { PinConfirmationDialog } from "./pin-confirmation.js";
import { FileTransferProgressDialog } from "./file-transfer-progress.js";
import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";

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

        if (!bluetooth.adapter) {
            this._showNoAdapterState();
            return;
        }

        try {
            bluetooth.adapter.bluetoothAgent.register();
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
            if (!bluetooth.adapter) return;

            if (bluetooth.adapter.discovering) {
                bluetooth.adapter.stopDiscovery();
            } else {
                bluetooth.adapter.startDiscovery();
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
        if (!bluetooth.adapter) return;

        bluetooth.adapter.bind_property(
            "powered",
            this._bluetooth_toggle,
            "active",
            GObject.BindingFlags.SYNC_CREATE,
        );

        bluetooth.adapter.bind_property(
            "powered",
            this._disabled_state,
            "visible",
            GObject.BindingFlags.SYNC_CREATE |
                GObject.BindingFlags.INVERT_BOOLEAN,
        );

        bluetooth.adapter.bind_property(
            "powered",
            this._enabled_state,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );

        bluetooth.adapter.bind_property(
            "discovering",
            this._discovering_spinner,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );
    }

    private _setupEventHandlers(): void {
        if (!bluetooth.adapter) return;

        // On enabling / disabling bluetooth
        this._bluetooth_toggle.connect("state-set", (_, state) => {
            if (!bluetooth.adapter) {
                return true; // Prevent switch toggle if no adapter
            }

            try {
                bluetooth.adapter.setAdapterPower(state);
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
        bluetooth.adapter.connect("device-added", (_, devicePath: string) =>
            this._addDevice(devicePath),
        );
        bluetooth.adapter.connect("device-removed", (_, devicePath: string) =>
            this._removeDevice(devicePath),
        );

        // Agent event listeners
        bluetooth.adapter.bluetoothAgent.connect(
            "confirmation-request",
            (_, devicePath: string, requestId: string, passkey: number) =>
                this._showConfirmationDialog(devicePath, requestId, passkey),
        );

        bluetooth.adapter.bluetoothAgent.connect(
            "authorization-request",
            (_, devicePath: string, requestId: string) =>
                this._showAuthorizationDialog(devicePath, requestId),
        );

        bluetooth.adapter.bluetoothAgent.connect(
            "pin-display",
            (_, devicePath: string, pincode: string) =>
                this._showPinDisplayDialog(devicePath, pincode),
        );

        bluetooth.adapter.bluetoothAgent.connect(
            "passkey-display",
            (_, devicePath: string, passkey: number) =>
                this._showPasskeyDisplayDialog(devicePath, passkey),
        );

        if (bluetooth.obex) {
            bluetooth.obex.connect(
                "receive-file-request",
                (
                    _,
                    requestId: string,
                    filename: string,
                    size: string,
                    deviceAddress: string,
                ) => {
                    this._showIncomingTransferDialog(
                        requestId,
                        filename,
                        size,
                        deviceAddress,
                    );
                },
            );

            bluetooth.obex.connect(
                "incoming-transfer-started",
                (
                    _,
                    transferPath: string,
                    filename: string,
                    deviceAddress: string,
                ) =>
                    this._showIncomingTransferProgress(
                        transferPath,
                        filename,
                        deviceAddress,
                    ),
            );

            bluetooth.obex.connect(
                "transfer-progress",
                (_, transferPath: string, transferred: number, total: number) =>
                    this._updateIncomingTransferProgress(
                        transferPath,
                        transferred,
                        total,
                    ),
            );

            bluetooth.obex.connect(
                "transfer-completed",
                (_, transferPath: string, filename: string) =>
                    this._onIncomingTransferCompleted(transferPath, filename),
            );

            bluetooth.obex.connect(
                "transfer-failed",
                (_, transferPath: string) =>
                    this._onIncomingTransferFailed(transferPath),
            );
        }
    }

    private _setupDeviceList(): void {
        if (!bluetooth.adapter) return;

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

        bluetooth.adapter.devices.forEach(({ devicePath }) =>
            this._addDevice(devicePath),
        );
    }

    private _findDeviceByPath(devicePath: string): Device | undefined {
        return bluetooth.adapter?.devices.find(
            (d) => d.devicePath === devicePath,
        );
    }

    private _findDeviceByAddress(deviceAddress: string): Device | undefined {
        return bluetooth.adapter?.devices.find(
            (d) => d.address === deviceAddress,
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

    private _displayDialogAsTopLevel(dialog: Adw.Dialog) {
        // Find the focused window
        const focused = Gtk.Window.list_toplevels().find((w) => w.is_focus());

        // If no focused window, default to the first visible window we find.
        const target =
            focused || Gtk.Window.list_toplevels().find((w) => w.is_visible());

        if (target) {
            dialog.present(target);
        }
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

        this._displayDialogAsTopLevel(dialog);
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
            bluetooth.adapter?.bluetoothAgent.confirmPairing(requestId);
        });

        dialog.connect("cancelled", () => {
            bluetooth.adapter?.bluetoothAgent.cancelConfirmation(requestId);
        });

        this._displayDialogAsTopLevel(dialog);
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
                bluetooth.adapter?.bluetoothAgent.confirmAuthorization(
                    requestId,
                );
            } else {
                bluetooth.adapter?.bluetoothAgent.cancelAuthorization(
                    requestId,
                );
            }
        });

        this._displayDialogAsTopLevel(dialog);
    }

    // Display pin for other device to use to pair
    private _showPinDisplayDialog(devicePath: string, pincode: string) {
        const device = this._findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            pincode,
            true,
        );

        this._displayDialogAsTopLevel(dialog);
    }

    // Display passkey for other device to use to pair
    private _showPasskeyDisplayDialog(devicePath: string, passkey: number) {
        const device = this._findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            passkey.toString().padStart(6, "0"),
            true,
        );

        this._displayDialogAsTopLevel(dialog);
    }

    private _showIncomingTransferDialog(
        requestId: string,
        filename: string,
        size: string,
        deviceAddress: string,
    ) {
        const sizeInMB = (parseInt(size) / 1024 / 1024).toFixed(2);

        // Find device by address to get the device name
        const device = this._findDeviceByAddress(deviceAddress);
        const deviceName = device?.alias || deviceAddress;

        const dialog = new Adw.AlertDialog({
            heading: "Incoming File Transfer",
            body: `Device "${deviceName}" wants to send you the file "${filename}" (${sizeInMB} MB).\n\nDo you want to accept this file?`,
            closeResponse: "reject",
            defaultResponse: "accept",
        });

        dialog.add_response("reject", "_Reject");
        dialog.add_response("accept", "_Accept");

        dialog.connect("response", (_, response: string) => {
            if (response === "accept") {
                bluetooth.obex?.acceptAuthorization(requestId);
            } else {
                bluetooth.obex?.rejectAuthorization(requestId);
            }
        });

        this._displayDialogAsTopLevel(dialog);
    }

    private _showIncomingTransferProgress(
        transferPath: string,
        filename: string,
        deviceAddress: string,
    ) {
        // Find device by address to get the device name
        const device = this._findDeviceByAddress(deviceAddress);
        const deviceName = device?.alias || deviceAddress;

        const progressDialog = new FileTransferProgressDialog(
            deviceName,
            "~/Downloads/" + filename,
        );
        progressDialog.updateProgress(0, 1);

        progressDialog.connect("cancelled", () => {
            bluetooth.obex?.cancelTransfer(transferPath);
            this._incomingTransferDialogs.delete(transferPath);
        });

        this._incomingTransferDialogs.set(transferPath, progressDialog);

        this._displayDialogAsTopLevel(progressDialog);
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

    private _onIncomingTransferCompleted(
        transferPath: string,
        filename: string,
    ) {
        const dialog = this._incomingTransferDialogs.get(transferPath);
        if (dialog) {
            dialog.close();
            this._incomingTransferDialogs.delete(transferPath);

            // Move file from .cache to Downloads
            this._moveFileToDownloads(filename);

            const toast = new Adw.Toast({
                title: "File received successfully",
                timeout: 3,
            });
            this._toast_overlay.add_toast(toast);
        }
    }

    private _moveFileToDownloads(filename: string): void {
        try {
            const sourceePath =
                GLib.get_home_dir() + "/.cache/obexd/" + filename;
            const destPath = GLib.get_home_dir() + "/Downloads/" + filename;

            const sourceFile = Gio.File.new_for_path(sourceePath);
            const destFile = Gio.File.new_for_path(destPath);

            // Check if source file exists
            if (!sourceFile.query_exists(null)) {
                log(`Source file not found: ${sourceePath}`);
                return;
            }

            // Move the file
            sourceFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
            log(`File moved from ${sourceePath} to ${destPath}`);
        } catch (error) {
            log(`Failed to move file to Downloads: ${error}`);
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
                bluetooth.adapter?.stopDiscovery();
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
                bluetooth.adapter?.startDiscovery();
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
        bluetooth.destroy();
        return super.vfunc_close_request();
    }
}
