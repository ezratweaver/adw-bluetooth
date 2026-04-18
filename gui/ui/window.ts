import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import { Adapter, bluetooth } from "../bluetooth/bluetooth.js";
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

    private _deviceSorter?: Gtk.CustomSorter;

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

        this._setupActions();
        this._setupDeviceList();
        this._initializeAdapter();
        this._setupSignalHandlers();

        this._incomingTransferManager = new IncomingTransferManager(
            this._showToast.bind(this),
        );
    }

    private _setupSignalHandlers(): void {
        // Agent handlers
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

        // Bluetooth toggle handler
        let toggleHandlerId: number;
        toggleHandlerId = this._bluetooth_toggle.connect(
            "state-set",
            (_, isPoweringOn) => {
                const setSwitchState = (state: boolean) => {
                    GObject.signal_handler_block(
                        this._bluetooth_toggle,
                        toggleHandlerId,
                    );
                    this._bluetooth_toggle.set_active(state);
                    this._bluetooth_toggle.set_state(state);
                    GObject.signal_handler_unblock(
                        this._bluetooth_toggle,
                        toggleHandlerId,
                    );
                };

                if (!bluetooth.activeAdapter) {
                    setSwitchState(!isPoweringOn);
                    return true;
                }

                this._disabled_state.set_visible(!isPoweringOn);
                this._enabled_state.set_visible(isPoweringOn);

                bluetooth
                    .setAdapterPower(isPoweringOn)
                    .then(() => {
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
                        this._disabled_state.set_visible(isPoweringOn);
                        this._enabled_state.set_visible(!isPoweringOn);
                    });

                return true;
            },
        );
    }

    private _setupActions(): void {
        // Toggle discovery
        const toggleDiscoveryAction = new Gio.SimpleAction({
            name: "toggle-discovery",
        });

        toggleDiscoveryAction.connect("activate", () => {
            if (!bluetooth.activeAdapter) return;
            const isDiscovering = bluetooth.activeAdapter.discovering;
            (isDiscovering
                ? bluetooth.stopDiscovery()
                : bluetooth.startDiscovery()
            ).catch(() => {
                this._showToast(
                    `Failed to ${isDiscovering ? "stop" : "start"} device discovery`,
                );
            });
        });
        this.add_action(toggleDiscoveryAction);

        // About
        const aboutAction = new Gio.SimpleAction({ name: "about" });
        aboutAction.connect("activate", () => this._showAbout());
        this.add_action(aboutAction);

        // Help overlay
        const showHelpAction = new Gio.SimpleAction({
            name: "show-help-overlay",
        });
        showHelpAction.connect("activate", () => new ShortcutsWindow(this));
        this.add_action(showHelpAction);

        // Vim navigation
        this._vimNavigator = new VimNavigator(this._devices_list, {
            onDevicePair: this._handleDeviceAction.bind(this),
        });

        const vimActions: [string, () => void][] = [
            ["vim-down", () => this._vimNavigator.navigateDown()],
            ["vim-up", () => this._vimNavigator.navigateUp()],
            ["vim-select", () => this._vimNavigator.selectCurrent()],
            ["vim-first", () => this._vimNavigator.navigateFirst()],
            ["vim-last", () => this._vimNavigator.navigateLast()],
        ];

        for (const [name, handler] of vimActions) {
            const action = new Gio.SimpleAction({ name });
            action.connect("activate", handler);
            this.add_action(action);
        }

        // Adapter submenu
        const adapters = ([...bluetooth.adapters] as Adapter[]).sort((a, b) =>
            a.name.localeCompare(b.name),
        );

        for (const adapter of adapters) {
            const displayName =
                adapter.alias !== adapter.name
                    ? `${adapter.alias} (${adapter.name})`
                    : adapter.alias;

            const adapterAction = new Gio.SimpleAction({
                name: `adapter-${adapter.name}`,
                state: new GLib.Variant(
                    "b",
                    adapter.path === bluetooth.activeAdapter?.path,
                ),
            });

            adapterAction.connect("activate", (action) => {
                if (action.get_state()?.get_boolean()) return;

                for (const other of adapters) {
                    const otherAction = this.lookup_action(
                        `adapter-${other.name}`,
                    ) as Gio.SimpleAction;
                    otherAction?.set_state(
                        new GLib.Variant("b", other.path === adapter.path),
                    );
                }

                bluetooth.setActiveAdapter(adapter.path);
                this._initializeAdapter();
            });

            this.add_action(adapterAction);

            const menuItem = new Gio.MenuItem();
            menuItem.set_label(displayName);
            menuItem.set_action_and_target_value(
                `win.adapter-${adapter.name}`,
                null,
            );
            this._adapter_list.append_item(menuItem);
        }
    }

    private _initializeAdapter(): void {
        if (!bluetooth.activeAdapter) {
            this._disabled_header_label.set_label("No Bluetooth Adapter");
            this._disabled_description_label.set_label(
                "Ensure BlueZ is configured correctly and try again.",
            );
            this._disabled_state.set_visible(true);
            this._enabled_state.set_visible(false);
            this._bluetooth_toggle.set_visible(false);
            return;
        }

        const adapter = bluetooth.activeAdapter;

        // Start discovery if powered but not discovering
        if (adapter.powered && !adapter.discovering) {
            bluetooth.startDiscovery().catch((error) => {
                log(`Failed to start discovery: ${error}`);
                this._showToast("Failed to start device discovery");
            });
        }

        // Update visibility
        this._disabled_state.set_visible(!adapter.powered);
        this._enabled_state.set_visible(adapter.powered);

        // Property bindings
        adapter.bind_property(
            "powered",
            this._bluetooth_toggle,
            "active",
            GObject.BindingFlags.SYNC_CREATE,
        );
        adapter.bind_property(
            "discovering",
            this._discovering_spinner,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );
    }

    private _setupDeviceList(): void {
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

        // Sort: connected > paired > unpaired
        this._deviceSorter = new Gtk.CustomSorter();
        this._deviceSorter.set_sort_func((a, b) => {
            const device1 = a as Device;
            const device2 = b as Device;

            if (device1.connected && !device2.connected) return -1;
            if (!device1.connected && device2.connected) return 1;
            if (device1.paired && !device2.paired) return -1;
            if (!device1.paired && device2.paired) return 1;

            return 0;
        });

        const sortedModel = new Gtk.SortListModel({
            model: bluetooth.devices,
            sorter: this._deviceSorter,
        });

        this._devices_list.bind_model(sortedModel, (item) => {
            const device = item as Device;
            const row = this._createDeviceRow(device);

            row.connect("activated", () => {
                if (!device.connecting) {
                    if (device.paired) {
                        this._showDeviceDetails(device);
                    } else {
                        this._handleDeviceAction(device);
                    }
                }
            });

            device.connect("notify::connected", () => {
                this._deviceSorter?.changed(Gtk.SorterChange.DIFFERENT);
            });

            device.connect("notify::paired", () => {
                this._deviceSorter?.changed(Gtk.SorterChange.DIFFERENT);
            });

            return row;
        });
    }

    private _createDeviceRow(device: Device): Adw.ActionRow {
        const row = new Adw.ActionRow({
            name: device.path,
            activatable: true,
        });

        row.set_can_focus(false);

        const statusLabel = new Gtk.Label({ label: device.connectedStatus });
        const spinner = new Adw.Spinner({ visible: false });

        row.add_suffix(statusLabel);
        row.add_suffix(spinner);

        device.bind_property(
            "alias",
            row,
            "title",
            GObject.BindingFlags.SYNC_CREATE,
        );
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

        const updateStatus = () =>
            statusLabel.set_label(device.connectedStatus);
        device.connect("notify::connected", updateStatus);
        device.connect("notify::paired", updateStatus);

        return row;
    }

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

    vfunc_close_request(): boolean {
        bluetooth.destroy();
        this._incomingTransferManager.destroy();
        return super.vfunc_close_request();
    }
}
