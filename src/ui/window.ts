import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import { bluetooth } from "../bluetooth/bluetooth.js";
import { Device } from "../bluetooth/device.js";
import { DeviceDetailsModal } from "./device-details.js";
import { PinConfirmationDialog } from "./pin-confirmation.js";
import Gio from "gi://Gio?version=2.0";
import { formatPin } from "../services/formatting.js";
import { displayDialogAsTopLevel } from "../services/dialog.js";
import { findDeviceByPath } from "../services/find-by-device.js";
import { IncomingTransferManager } from "../services/ui/incoming-transfer-manager.js";
import { VimNavigator } from "../services/ui/vim-navigator.js";
import { ShortcutsWindow } from "./shortcuts-window.js";
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
    private _adapter_list!: Gio.Menu;

    private _deviceElements: Map<
        string,
        {
            row: Adw.ActionRow;
            spinner: Adw.Spinner;
            statusLabel: Gtk.Label;
        }
    > = new Map();

    private _incomingTransferManager!: IncomingTransferManager;
    private _vimNavigator!: VimNavigator;

    static {
        GObject.registerClass(
            {
                Template:
                    "resource:///com/ezratweaver/AdwBluetooth/blueprints/application-window.ui",
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
                    "adapter-list",
                ],
            },
            this,
        );

        // Window shortcuts
        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "window.close" }),
                trigger: Gtk.ShortcutTrigger.parse_string("<Control>w"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "window.close" }),
                trigger: Gtk.ShortcutTrigger.parse_string("Escape"),
            }),
        );

        // Vim-style and arrow key navigation shortcuts
        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-down" }),
                trigger: Gtk.ShortcutTrigger.parse_string("j"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-down" }),
                trigger: Gtk.ShortcutTrigger.parse_string("Down"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-up" }),
                trigger: Gtk.ShortcutTrigger.parse_string("k"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-up" }),
                trigger: Gtk.ShortcutTrigger.parse_string("Up"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-select" }),
                trigger: Gtk.ShortcutTrigger.parse_string("Return"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-select" }),
                trigger: Gtk.ShortcutTrigger.parse_string("space"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-first" }),
                trigger: Gtk.ShortcutTrigger.parse_string("g"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({ action_name: "win.vim-last" }),
                trigger: Gtk.ShortcutTrigger.parse_string("<Shift>g"),
            }),
        );

        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({
                    action_name: "win.toggle-discovery",
                }),
                trigger: Gtk.ShortcutTrigger.parse_string("d"),
            }),
        );

        // Show shortcuts window
        Gtk.Widget.add_shortcut(
            new Gtk.Shortcut({
                action: new Gtk.NamedAction({
                    action_name: "win.show-help-overlay",
                }),
                trigger: Gtk.ShortcutTrigger.parse_string("<Primary>question"),
            }),
        );
    }

    constructor(params?: Partial<Adw.ApplicationWindow.ConstructorProps>) {
        super(params);

        if (!bluetooth.adapter) {
            this._showNoAdapterState();
            return;
        }

        if (bluetooth.adapter.powered) {
            try {
                bluetooth.adapter.startDiscovery();
            } catch (error) {
                log(`Failed to start discovery: ${error}`);
                this._showToast("Failed to start device discovery");
            }
        }

        try {
            bluetooth.adapter.bluetoothAgent.register();
        } catch (e) {
            this._showToast("Failed to initialize pairing agent");
        }

        this._setupPropertyBindings();
        this._setupEventHandlers();
        this._setupDeviceList();
        this._setupActions();
        this._setupVimNavigation();
        this._setupAdapterSubMenu();

        this._incomingTransferManager = new IncomingTransferManager(
            this._showToast.bind(this),
        );
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

            try {
                if (bluetooth.adapter.discovering) {
                    bluetooth.adapter.stopDiscovery();
                } else {
                    bluetooth.adapter.startDiscovery();
                }
            } catch (error) {
                if (bluetooth.adapter.discovering) {
                    this._showToast("Failed to stop device discovery");
                } else {
                    this._showToast("Failed to start device discovery");
                }
            }
        });

        const aboutAction = new Gio.SimpleAction({
            name: "about",
        });

        aboutAction.connect("activate", () => {
            this._showAbout();
        });

        const showHelpAction = new Gio.SimpleAction({
            name: "show-help-overlay",
        });

        showHelpAction.connect("activate", () => {
            new ShortcutsWindow(this);
        });

        this.add_action(toggleDiscoveryAction);
        this.add_action(aboutAction);
        this.add_action(showHelpAction);
    }

    private _setupAdapterSubMenu() {
        for (const adapterPath of bluetooth.adapterPaths) {
            const adapterName = adapterPath.split("/").slice(-1)[0];

            const isCurrentAdapter =
                adapterPath === bluetooth.adapter?.adapterPath;

            const adapterAction = new Gio.SimpleAction({
                name: `adapter-${adapterName}`,
                state: new GLib.Variant("b", isCurrentAdapter),
            });

            adapterAction.connect("activate", (action) => {
                const currentState = action.get_state()?.get_boolean() || false;

                if (!currentState) {
                    // Uncheck all other adapters
                    for (const otherPath of bluetooth.adapterPaths) {
                        const otherName = otherPath.split("/").slice(-1)[0];

                        const otherAction = this.lookup_action(
                            `adapter-${otherName}`,
                        ) as Gio.SimpleAction;

                        if (otherAction && otherPath !== adapterPath) {
                            otherAction.set_state(new GLib.Variant("b", false));
                        }
                    }

                    // Check this adapter
                    action.set_state(new GLib.Variant("b", true));
                    log(`Switched to adapter: ${adapterPath}`);
                }
            });

            this.add_action(adapterAction);

            const menuItem = new Gio.MenuItem();
            menuItem.set_label(adapterName);
            menuItem.set_action_and_target_value(
                `win.adapter-${adapterName}`,
                null,
            );

            this._adapter_list.append_item(menuItem);
        }
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
                this._bluetooth_toggle.set_active(!state); // Revert switch if no adapter
                return;
            }

            try {
                bluetooth.adapter.setAdapterPower(state);

                // If we're powering on, then start discovery
                if (state) {
                    try {
                        bluetooth.adapter.startDiscovery();
                    } catch (error) {
                        log(`Failed to start discovery on power on: ${error}`);
                        this._showToast("Failed to start device discovery");
                    }
                }
            } catch (error) {
                this._showToast("Failed to control Bluetooth power");
                this._bluetooth_toggle.set_active(!state); // Revert switch on error
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
            const device1 = findDeviceByPath(row1.name);
            const device2 = findDeviceByPath(row2.name);

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

        row.set_can_focus(false);

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
            version: "0.2.0",
            developer_name: "Ezra Weaver",
            website: "https://github.com/ezratweaver/adw-bluetooth",
            issue_url: "https://github.com/ezratweaver/adw-bluetooth/issues",
        });

        aboutDialog.present(this);
    }

    private _showToast(message: string) {
        const toast = new Adw.Toast({
            title: message,
            timeout: 4,
        });
        this._toast_overlay.add_toast(toast);
    }

    private _showConfirmationDialog(
        devicePath: string,
        requestId: string,
        passkey: number,
    ) {
        const device = findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            formatPin(passkey),
        );

        dialog.connect("confirmed", () => {
            bluetooth.adapter?.bluetoothAgent.confirmPairing(requestId);
        });

        dialog.connect("cancelled", () => {
            bluetooth.adapter?.bluetoothAgent.cancelConfirmation(requestId);
        });

        displayDialogAsTopLevel(dialog);
    }

    private _showAuthorizationDialog(devicePath: string, requestId: string) {
        const device = findDeviceByPath(devicePath);

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

        displayDialogAsTopLevel(dialog);
    }

    // Display pin for other device to use to pair
    private _showPinDisplayDialog(devicePath: string, pincode: string) {
        const device = findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            pincode,
            true,
        );

        displayDialogAsTopLevel(dialog);
    }

    // Display passkey for other device to use to pair
    private _showPasskeyDisplayDialog(devicePath: string, passkey: number) {
        const device = findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            formatPin(passkey),
            true,
        );

        displayDialogAsTopLevel(dialog);
    }

    private _showDeviceDetails(device: Device) {
        const detailsWindow = new DeviceDetailsModal(device, this);
        detailsWindow.present();
    }

    // Device management methods
    private _addDevice(devicePath: string) {
        const device = findDeviceByPath(devicePath);
        if (!device) {
            return;
        }

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

        this._devices_list.append(row);

        device.connect("device-changed", (device: Device) => {
            row.set_title(device.alias);

            statusLabel.set_label(device.connectedStatus);

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
                try {
                    bluetooth.adapter?.stopDiscovery();
                } catch (error) {
                    log(`Failed to stop discovery: ${error}`);
                }
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
                try {
                    bluetooth.adapter?.startDiscovery();
                } catch (error) {
                    log(`Failed to restart discovery: ${error}`);
                }
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

    private _setupVimNavigation(): void {
        // Initialize vim navigator
        this._vimNavigator = new VimNavigator(this._devices_list, {
            onDevicePair: this._handleDevicePair.bind(this),
        });

        // Vim-style navigation actions
        const vimDownAction = new Gio.SimpleAction({ name: "vim-down" });
        vimDownAction.connect("activate", () =>
            this._vimNavigator.navigateDown(),
        );
        this.add_action(vimDownAction);

        const vimUpAction = new Gio.SimpleAction({ name: "vim-up" });
        vimUpAction.connect("activate", () => this._vimNavigator.navigateUp());
        this.add_action(vimUpAction);

        const vimSelectAction = new Gio.SimpleAction({ name: "vim-select" });
        vimSelectAction.connect("activate", () =>
            this._vimNavigator.selectCurrent(),
        );
        this.add_action(vimSelectAction);

        const vimFirstAction = new Gio.SimpleAction({ name: "vim-first" });
        vimFirstAction.connect("activate", () =>
            this._vimNavigator.navigateFirst(),
        );
        this.add_action(vimFirstAction);

        const vimLastAction = new Gio.SimpleAction({ name: "vim-last" });
        vimLastAction.connect("activate", () =>
            this._vimNavigator.navigateLast(),
        );
        this.add_action(vimLastAction);
    }

    vfunc_close_request(): boolean {
        bluetooth.destroy();
        this._incomingTransferManager.destroy();
        return super.vfunc_close_request();
    }
}
