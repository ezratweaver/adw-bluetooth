import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import Gio from "gi://Gio?version=2.0";
import { Device } from "../bluetooth/device.js";
import { bluetooth } from "../bluetooth/bluetooth.js";
import { BluetoothUUID } from "../services/device-metadata.js";
import { FileTransferProgressDialog } from "./file-transfer-progress.js";
import { showDestructiveConfirmationDialog } from "../services/dialog.js";
import { showFilePicker } from "../services/filesystem.js";

export class DeviceDetailsModal extends Adw.Window {
    private device: Device;
    private _connection_switch!: Gtk.Switch;
    private _connection_spinner!: Adw.Spinner;
    private _paired_row!: Adw.ActionRow;
    private _type_row!: Adw.ActionRow;
    private _address_row!: Adw.ActionRow;
    private _battery_row!: Adw.ActionRow;
    private _send_files_group!: Adw.PreferencesGroup;
    private _send_files_button!: Adw.ButtonRow;
    private _forget_button!: Adw.ButtonRow;
    private _device_icon!: Gtk.Image;
    private _device_name!: Gtk.Label;

    static {
        GObject.registerClass(
            {
                Template:
                    "resource:///com/ezratweaver/AdwBluetooth/blueprints/device-details.ui",
                InternalChildren: [
                    "connection_switch",
                    "connection_spinner",
                    "paired_row",
                    "type_row",
                    "address_row",
                    "battery_row",
                    "send_files_group",
                    "send_files_button",
                    "forget_button",
                    "device_icon",
                    "device_name",
                ],
            },
            this,
        );
    }

    constructor(device: Device, parent: Gtk.Window) {
        super({
            transientFor: parent,
        });

        this.device = device;

        this._paired_row.set_subtitle(device.paired ? "Yes" : "No");
        this._type_row.set_subtitle(device.deviceType);
        this._address_row.set_subtitle(device.mac);

        this.device.connect("notify::battery-percentage", () => {
            this.updateBatteryDisplay();
        });

        this.updateBatteryDisplay();

        this._device_icon.set_from_icon_name(
            device.icon || "bluetooth-symbolic",
        );
        this._device_name.set_text(device.alias);

        this.device.bind_property(
            "connected",
            this._connection_switch,
            "active",
            GObject.BindingFlags.SYNC_CREATE,
        );

        // Show send files group only if device supports Object Push
        if (this.device.uuids.has(BluetoothUUID.OBJECT_PUSH as string)) {
            this.device.bind_property(
                "connected",
                this._send_files_group,
                "visible",
                GObject.BindingFlags.SYNC_CREATE,
            );
        }

        this.device.bind_property(
            "connecting",
            this._connection_switch,
            "visible",
            GObject.BindingFlags.SYNC_CREATE |
                GObject.BindingFlags.INVERT_BOOLEAN,
        );

        this.device.bind_property(
            "connecting",
            this._connection_spinner,
            "visible",
            GObject.BindingFlags.SYNC_CREATE,
        );

        this._connection_switch.connect("state-set", (_, switchTurnedOn) => {
            if (switchTurnedOn && !device.connected) {
                if (bluetooth.activeAdapter?.discovering) {
                    bluetooth.stopDiscovery();
                }

                device.connecting = true;
                bluetooth
                    .connectDevice(device.path)
                    .then(() => {
                        device.connecting = false;
                    })
                    .catch((error) => {
                        device.connecting = false;
                        log(
                            `An error occured trying to connect to device: ${error}`,
                        );
                        this._connection_switch.set_active(false);
                        bluetooth.disconnectDevice(device.path);
                    });
            } else if (!switchTurnedOn && device.connected) {
                device.connecting = true;
                bluetooth
                    .disconnectDevice(device.path)
                    .then(() => {
                        device.connecting = false;
                    })
                    .catch((error) => {
                        device.connecting = false;
                        log(`Failed to turn off connection: ${error}`);
                        this._connection_switch.set_active(true);
                    });
            }
        });

        this._send_files_button.connect("activated", () => {
            this.openFileDialog();
        });

        this._forget_button.connect("activated", () => {
            this.confirmForgetDevice();
        });
    }

    private updateBatteryDisplay(): void {
        if (this.device.batteryPercentage !== null) {
            this._battery_row.set_subtitle(`${this.device.batteryPercentage}%`);
            this._battery_row.set_visible(true);
        } else {
            this._battery_row.set_visible(false);
        }
    }

    private async confirmForgetDevice(): Promise<void> {
        const confirmed = await showDestructiveConfirmationDialog({
            parent: this,
            title: "Forget Device?",
            description: `"${this.device.alias}" will be removed from your saved devices. You will have to set it up again to use it.`,
            confirmText: "Forget",
            cancelText: "Cancel",
        });

        if (confirmed) {
            try {
                this.close();
                await bluetooth.removeDevice(this.device.path);
            } catch (error) {
                log(`Failed to remove device: ${error}`);
            }
        }
    }

    private async openFileDialog(): Promise<void> {
        const files = await showFilePicker(this);
        if (files) {
            await this.sendFiles(files);
        }
    }

    private async sendFiles(files: Gio.File[]): Promise<void> {
        const progressDialog = new FileTransferProgressDialog(
            files[0].get_basename() ?? "Pending...",
            this.device.alias,
        );
        progressDialog.present(this);

        const obex = bluetooth.obex;
        if (!obex) {
            progressDialog.showError(
                "File sending is not supported on this system.",
            );
            return;
        }

        let sessionPath: string | null;
        try {
            sessionPath = await obex.createSession(this.device.mac);
        } catch (error) {
            progressDialog.showError(`Failed to create session: ${error}`);
            return;
        }

        if (!sessionPath) {
            progressDialog.showError(
                "Could not establish connection to device.",
            );
            return;
        }

        let currentFileIndex = 0;
        let transferPath: string | null = null;
        let signalIds: number[] = [];

        const cleanupSignals = () => {
            signalIds.forEach((id) => obex.disconnect(id));
            signalIds = [];
        };

        const cleanupSession = async () => {
            try {
                await obex.removeSession(sessionPath!);
            } catch (error) {
                log(`Failed to cleanup session: ${error}`);
            }
        };

        const processNextFile = async (): Promise<void> => {
            // Clear up signals from last transfer
            cleanupSignals();

            // Check to see if we're done
            if (currentFileIndex >= files.length) {
                progressDialog.showCompleted();
                cleanupSignals();
                cleanupSession();
                return;
            }

            const currentFile = files[currentFileIndex];
            const currentFilePath = currentFile.get_path();
            const currentFileName = currentFile.get_basename();

            if (!currentFilePath || !currentFileName) {
                // Skip invalid files
                currentFileIndex++;
                return processNextFile();
            }

            progressDialog.hideError();
            progressDialog.updateFrom(currentFileName);
            progressDialog.updateProgress(0, 1);

            signalIds.push(
                obex.connect(
                    "transfer-progress",
                    (_, path: string, transferred: number, total: number) => {
                        if (path === transferPath) {
                            progressDialog.updateProgress(transferred, total);
                        }
                    },
                ),

                obex.connect("transfer-completed", (_, path: string) => {
                    if (path === transferPath) {
                        currentFileIndex++;
                        processNextFile();
                    }
                }),

                obex.connect("transfer-failed", (_, path: string) => {
                    if (path === transferPath) {
                        const message =
                            "Make sure that the remote device is switched on and that it accepts Bluetooth connections";
                        progressDialog.showError(message);
                    }
                }),
            );

            try {
                transferPath = await obex.sendFileWithSession(
                    sessionPath!,
                    currentFilePath,
                );

                if (!transferPath) {
                    const message =
                        files.length === 1
                            ? "Could not start file transfer."
                            : `Could not start transfer for "${currentFileName}".`;
                    progressDialog.showError(message);
                }
            } catch (error) {
                const message =
                    files.length === 1
                        ? `Failed to send file: ${error}`
                        : `Failed to send "${currentFileName}": ${error}`;
                progressDialog.showError(message);
            }
        };

        const stopTransfer = async () => {
            if (transferPath) {
                try {
                    await obex.cancelTransfer(transferPath);
                } catch (error) {
                    log(`Failed to cancel transfer: ${error}`);
                }
            }
            cleanupSignals();
            cleanupSession();
        };

        progressDialog.connect("closed", () => {
            if (progressDialog.progress < 1) {
                stopTransfer();
            }
        });

        progressDialog.connect("retry", () => processNextFile());

        await processNextFile();
    }
}
