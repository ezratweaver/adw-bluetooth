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

    private _deviceElementsMap: Map<
        string,
        {
            row: Adw.ActionRow;
            spinner: Adw.Spinner;
            statusLabel: Gtk.Label;
        }
    > = new Map();

    private _incomingTransferManager!: IncomingTransferManager;
    private _vimNavigator!: VimNavigator;
    private _activePairingCount: number = 0;

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

        this._setupMenuActions();
        this._setupVimNavigation();
        this._setupAdapterBindings();
        this._setupButtonEvents();

        this._incomingTransferManager = new IncomingTransferManager(
            this._showToast.bind(this),
        );
    }

    private _setupAdapterBindings(): void {
        if (!bluetooth.activeAdapter) {
            this._showNoAdapterState();
            return;
        }

        if (
            bluetooth.activeAdapter.powered &&
            !bluetooth.activeAdapter.discovering
        ) {
            bluetooth.startDiscovery().catch((error) => {
                log(`Failed to start discovery: ${error}`);
                this._showToast("Failed to start device discovery");
            });
        }

        this._disabled_state.set_visible(!bluetooth.activeAdapter.powered);
        this._enabled_state.set_visible(bluetooth.activeAdapter.powered);

        this._setupPropertyBindings();
        this._setupEventHandlers();
        this._setupDeviceList();
    }

    private _clearDeviceList(): void {
        this._deviceElementsMap.forEach((elements) => {
            const parent = elements.row.get_parent();
            if (parent === this._devices_list) {
                this._devices_list.remove(elements.row);
            }
        });
        this._deviceElementsMap.clear();
    }

    private _resetWindow(): void {
        this._clearDeviceList();
        this._setupAdapterBindings();
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

    private _setupMenuActions(): void {
        const toggleDiscoveryAction = new Gio.SimpleAction({
            name: "toggle-discovery",
        });

        toggleDiscoveryAction.connect("activate", () => {
            if (!bluetooth.activeAdapter) return;

            const isDiscovering = bluetooth.activeAdapter.discovering;
            const action = isDiscovering
                ? bluetooth.stopDiscovery()
                : bluetooth.startDiscovery();

            action.catch(() => {
                if (isDiscovering) {
                    this._showToast("Failed to stop device discovery");
                } else {
                    this._showToast("Failed to start device discovery");
                }
            });
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

        this._setupAdapterSubMenu();
    }

    private _setupAdapterSubMenu() {
        // Collect adapters from ListStore and sort by name (hci0, hci1, etc.)
        const adapters: { path: string; alias: string; name: string }[] = [];
        for (let i = 0; i < bluetooth.adapters.get_n_items(); i++) {
            const adapter = bluetooth.adapters.get_item(
                i,
            ) as import("../bluetooth/adapter.js").Adapter;
            const name = adapter.path.split("/").slice(-1)[0];
            adapters.push({ path: adapter.path, alias: adapter.alias, name });
        }
        adapters.sort((a, b) => a.name.localeCompare(b.name));

        for (const {
            path: adapterPath,
            alias: adapterAlias,
            name: adapterName,
        } of adapters) {
            const displayName =
                adapterAlias !== adapterName
                    ? `${adapterAlias} (${adapterName})`
                    : adapterAlias;

            const isCurrentAdapter =
                adapterPath === bluetooth.activeAdapter?.path;

            const adapterAction = new Gio.SimpleAction({
                name: `adapter-${adapterName}`,
                state: new GLib.Variant("b", isCurrentAdapter),
            });

            adapterAction.connect("activate", (action) => {
                const settingAdapterOn = !action.get_state()?.get_boolean();

                if (settingAdapterOn) {
                    // Uncheck all other adapters
                    for (const other of adapters) {
                        const otherAction = this.lookup_action(
                            `adapter-${other.name}`,
                        ) as Gio.SimpleAction;

                        if (otherAction && other.path !== adapterPath) {
                            otherAction.set_state(new GLib.Variant("b", false));
                        }
                    }

                    action.set_state(new GLib.Variant("b", true));

                    bluetooth.setActiveAdapter(adapterPath);
                    this._resetWindow();
                }
            });

            this.add_action(adapterAction);

            const menuItem = new Gio.MenuItem();

            menuItem.set_label(displayName);
            menuItem.set_action_and_target_value(
                `win.adapter-${adapterName}`,
                null,
            );

            this._adapter_list.append_item(menuItem);
        }
    }

    private _setupPropertyBindings(): void {
        if (!bluetooth.activeAdapter) return;

        bluetooth.activeAdapter.bind_property(
            "powered",
            this._bluetooth_toggle,
            "active",
            GObject.BindingFlags.SYNC_CREATE,
        );

        bluetooth.activeAdapter.bind_property(
            "discovering",
            this._discovering_spinner,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );
    }

    private _setupButtonEvents(): void {
        if (!bluetooth.activeAdapter) return;

        let bluetoothToggleHandlerId: number;

        // On enabling / disabling bluetooth
        bluetoothToggleHandlerId = this._bluetooth_toggle.connect(
            "state-set",
            (_, isPoweringOn) => {
                const setSwitchState = (state: boolean) => {
                    GObject.signal_handler_block(
                        this._bluetooth_toggle,
                        bluetoothToggleHandlerId,
                    );
                    this._bluetooth_toggle.set_active(state);
                    this._bluetooth_toggle.set_state(state);
                    GObject.signal_handler_unblock(
                        this._bluetooth_toggle,
                        bluetoothToggleHandlerId,
                    );
                };

                if (!bluetooth.activeAdapter) {
                    setSwitchState(!isPoweringOn);
                    return true;
                }

                // Update UI state immediately
                this._disabled_state.set_visible(!isPoweringOn);
                this._enabled_state.set_visible(isPoweringOn);

                bluetooth
                    .setAdapterPower(isPoweringOn)
                    .then(() => {
                        // If we're powering on, then start discovery
                        if (
                            isPoweringOn &&
                            !bluetooth.activeAdapter?.discovering
                        ) {
                            bluetooth.startDiscovery().catch((error) => {
                                log(
                                    `Failed to start discovery on power on: ${error}`,
                                );
                                this._showToast(
                                    "Failed to start device discovery",
                                );
                            });
                        }

                        setSwitchState(isPoweringOn);
                    })
                    .catch((error) => {
                        log(`Error occurred setting adapter power: ${error}`);
                        this._showToast("Failed to control Bluetooth power");

                        setSwitchState(!isPoweringOn);

                        // Revert UI state on error
                        this._disabled_state.set_visible(isPoweringOn);
                        this._enabled_state.set_visible(!isPoweringOn);
                    });

                return true;
            },
        );
    }

    private _deviceAddBuffer: string[] = [];
    private _deviceAddIdleId = 0;

    private _setupEventHandlers(): void {
        if (!bluetooth.activeAdapter) return;

        // Device list change signals from BluetoothManager
        bluetooth.devices.connect(
            "items-changed",
            (_, position, removed, added) => {
                // Handle removed items
                for (let i = 0; i < removed; i++) {
                    // We need to track which devices were at this position
                    // For simplicity, we'll rely on the device path from the map
                }

                // Handle added items - add to buffer for batched UI updates
                for (let i = 0; i < added; i++) {
                    const device = bluetooth.devices.get_item(
                        position + i,
                    ) as Device;
                    if (device) {
                        this._deviceAddBuffer.push(device.path);
                    }
                }

                // Schedule batched UI update
                if (added > 0 && this._deviceAddIdleId === 0) {
                    this._deviceAddIdleId = GLib.idle_add(
                        GLib.PRIORITY_DEFAULT_IDLE,
                        () => {
                            this._deviceAddBuffer.forEach((devicePath) =>
                                this._addDevice(devicePath),
                            );

                            this._deviceAddBuffer = [];
                            this._deviceAddIdleId = 0;
                            return GLib.SOURCE_REMOVE;
                        },
                    );
                }
            },
        );

        // Agent event listeners - signals come from BluetoothManager now
        bluetooth.connect(
            "request-confirmation",
            (_, devicePath: string, passkey: number) =>
                this._showConfirmationDialog(devicePath, passkey),
        );

        bluetooth.connect("request-authorization", (_, devicePath: string) =>
            this._showAuthorizationDialog(devicePath),
        );

        bluetooth.connect(
            "display-pin-code",
            (_, devicePath: string, pincode: string) =>
                this._showPinDisplayDialog(devicePath, pincode),
        );

        bluetooth.connect(
            "display-passkey",
            (_, devicePath: string, passkey: number) =>
                this._showPasskeyDisplayDialog(devicePath, passkey),
        );
    }

    private _setupDeviceList(): void {
        if (!bluetooth.activeAdapter) return;

        const placeholderBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            spacing: 12,
            marginTop: 100,
            marginBottom: 100,
        });

        const placeholderIcon = new Gtk.Image({
            iconName: "bluetooth-symbolic",
            pixelSize: 64,
            cssClasses: ["dim-label"],
        });

        const placeholderTitle = new Gtk.Label({
            label: "No devices found",
            cssClasses: ["title-4", "dim-label"],
        });

        const placeholderDescription = new Gtk.Label({
            label: "Turn on a nearby bluetooth device to start pairing.",
            cssClasses: ["dim-label"],
        });

        placeholderBox.append(placeholderIcon);
        placeholderBox.append(placeholderTitle);
        placeholderBox.append(placeholderDescription);

        this._devices_list.set_placeholder(placeholderBox);

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

            return 0;
        });

        // Add existing devices from the ListStore
        for (let i = 0; i < bluetooth.devices.get_n_items(); i++) {
            const device = bluetooth.devices.get_item(i) as Device;
            this._addDevice(device.path);
        }
    }

    private _createDeviceRow(device: Device): {
        row: Adw.ActionRow;
        spinner: Adw.Spinner;
        statusLabel: Gtk.Label;
    } {
        const row = new Adw.ActionRow({
            name: device.path,
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
            application_icon: "com.ezratweaver.AdwBluetooth",
            version: "1.0.0",
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

    private _showConfirmationDialog(devicePath: string, passkey: number) {
        const device = findDeviceByPath(devicePath);

        const dialog = new PinConfirmationDialog(
            device?.alias ?? "Unknown Device",
            formatPin(passkey),
        );

        dialog.connect("confirmed", () => {
            bluetooth.confirmRequest(true);
        });

        dialog.connect("cancelled", () => {
            bluetooth.confirmRequest(false);
        });

        displayDialogAsTopLevel(dialog);
    }

    private _showAuthorizationDialog(devicePath: string) {
        const device = findDeviceByPath(devicePath);

        const dialog = new Adw.AlertDialog({
            heading: "Bluetooth Pairing Request",
            body: `"${
                device?.alias ?? "Unknown Device"
            }" would like to pair\nwith your computer.`,
            closeResponse: "cancel",
            defaultResponse: "allow",
        });

        dialog.add_response("cancel", "_Cancel");
        dialog.add_response("allow", "_Allow");

        dialog.connect("response", (_, response: string) => {
            if (response === "allow") {
                bluetooth.confirmAuthorization(true);
            } else {
                bluetooth.confirmAuthorization(false);
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
        // Check if device already exists in the map
        if (this._deviceElementsMap.has(devicePath)) {
            return;
        }

        const device = findDeviceByPath(devicePath);
        if (!device) {
            return;
        }

        const { row, spinner, statusLabel } = this._createDeviceRow(device);

        this._deviceElementsMap.set(device.path, {
            row,
            spinner,
            statusLabel,
        });

        row.connect("activated", () => {
            if (!device.connecting) {
                if (device.paired) {
                    this._showDeviceDetails(device);
                } else {
                    this._handleDeviceAction(device);
                }
            }
        });

        this._devices_list.append(row);

        // Listen for property changes to update the UI
        const updateUI = () => {
            row.set_title(device.alias);
            statusLabel.set_label(device.connectedStatus);
            // Trigger resort when connection status changes
            this._devices_list.invalidate_sort();
        };

        device.connect("notify::alias", updateUI);
        device.connect("notify::connected", updateUI);
        device.connect("notify::paired", updateUI);
    }

    private async _handleDeviceAction(device: Device) {
        try {
            // Keep track of how many devices are being paired at once
            this._activePairingCount++;
            device.connecting = true;

            if (!device.paired) {
                // If this is the first device we are pairing, stop discovery.
                if (this._activePairingCount === 1) {
                    log(`Stopping discovery for pairing with ${device.alias}`);
                    await bluetooth.stopDiscovery();
                }

                await bluetooth.pairDevice(device.path);
                await bluetooth.connectDevice(device.path);
            } else if (device.connected) {
                await bluetooth.disconnectDevice(device.path);
            } else {
                if (this._activePairingCount === 1) {
                    log(`Stopping discovery for connecting to ${device.alias}`);
                    await bluetooth.stopDiscovery();
                }

                await bluetooth.connectDevice(device.path);
            }

            device.connecting = false;
            this._activePairingCount--;

            if (this._activePairingCount === 0) {
                log(`Restarting discovery after successful pairing/connection`);
                bluetooth.startDiscovery().catch((error) => {
                    log(`Failed to restart discovery after success: ${error}`);
                });
            }
        } catch (error) {
            device.connecting = false;
            this._activePairingCount--;

            if (
                this._activePairingCount === 0 &&
                (!device.paired || device.connected)
            ) {
                log(
                    `Restarting discovery after pairing failure for ${device.alias}`,
                );
                bluetooth.startDiscovery().catch((restartError) => {
                    log(
                        `Failed to restart discovery after error: ${restartError}`,
                    );
                });
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
            onDevicePair: this._handleDeviceAction.bind(this),
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
