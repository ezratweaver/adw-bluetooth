import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import Gio from "gi://Gio?version=2.0";
import { Device } from "./bluetooth/device.js";
import { bluetoothManager } from "./bluetooth/bluetooth.js";
import { BluetoothUUID } from "./bluetooth/device-metadata.js";
import { FileTransferProgressDialog } from "./file-transfer-progress-dialog.js";

export class DeviceDetailsModal extends Adw.Window {
    private device: Device;
    private _connection_switch!: Gtk.Switch;
    private _connection_spinner!: Adw.Spinner;
    private _paired_row!: Adw.ActionRow;
    private _type_row!: Adw.ActionRow;
    private _address_row!: Adw.ActionRow;
    private _send_files_group!: Adw.PreferencesGroup;
    private _send_files_button!: Adw.ButtonRow;
    private _forget_button!: Adw.ButtonRow;
    private _device_icon!: Gtk.Image;
    private _device_name!: Gtk.Label;

    static {
        GObject.registerClass(
            {
                Template:
                    "resource:///com/ezratweaver/AdwBluetooth/ui/device-details-modal.ui",
                InternalChildren: [
                    "connection_switch",
                    "connection_spinner",
                    "paired_row",
                    "type_row",
                    "address_row",
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
        this._address_row.set_subtitle(device.address);

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
        if (this.device.uuids.has(BluetoothUUID.OBJECT_PUSH)) {
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
                if (bluetoothManager.adapter?.discovering) {
                    bluetoothManager.adapter.stopDiscovery();
                }
                device.connectDevice().catch((error) => {
                    log(
                        `An error occured trying to connect to device: ${error}`,
                    );
                    this._connection_switch.set_active(false); // Ensure switch is off
                    device.disconnectDevice(); // Explicity cut connection when timeout/failure occurs
                });
            } else if (!switchTurnedOn && device.connected) {
                device.disconnectDevice();
            }
            return false;
        });

        this._send_files_button.connect("activated", () => {
            this.showFilePicker();
        });

        this._forget_button.connect("activated", () => {
            this.showForgetDialog();
        });
    }

    private showForgetDialog(): void {
        const dialog = new Adw.AlertDialog({
            heading: "Forget Device?",
            body: `"${this.device.alias}" will be removed from your saved devices. You will have to set it up again to use it.`,
        });

        dialog.add_response("cancel", "Cancel");
        dialog.add_response("forget", "Forget");
        dialog.set_response_appearance(
            "forget",
            Adw.ResponseAppearance.DESTRUCTIVE,
        );

        dialog.connect("response", (_, response) => {
            if (response === "forget") {
                bluetoothManager.adapter?.removeDevice(this.device.devicePath);
                this.close();
            }
        });

        dialog.present(this);
    }

    private showFilePicker(): void {
        const fileDialog = new Gtk.FileDialog({
            title: "Choose files to send",
            modal: true,
        });

        fileDialog.open_multiple(this, null, async (dialog, result) => {
            try {
                const files = dialog?.open_multiple_finish(result);
                if (!files || files.get_n_items() === 0) {
                    return;
                }

                const fileArray: Gio.File[] = [];
                for (let i = 0; i < files.get_n_items(); i++) {
                    fileArray.push(files.get_item(i) as Gio.File);
                }

                await this.sendFiles(fileArray);
            } catch (error: any) {
                if (error.code !== Gio.IOErrorEnum.CANCELLED) {
                    log(`File dialog error: ${error}`);
                }
            }
        });
    }

    private async sendFiles(files: Gio.File[]): Promise<void> {
        const obexManager = bluetoothManager.adapter?.obexManager;
        if (!obexManager) {
            this.showDialog(
                "OBEX not available",
                "File sending is not supported on this system.",
            );
            return;
        }

        const sessionPath = await obexManager.createSession(
            this.device.address,
        );

        if (!sessionPath) {
            this.showDialog(
                "Connection failed",
                "Could not establish connection to device.",
            );
            return;
        }

        let currentFileIndex = 0;
        let transferPath: string | null = null;
        let signalIds: number[] = [];

        const progressDialog = new FileTransferProgressDialog(
            "Preparing...",
            this.device.alias,
        );

        const cleanupSignals = () => {
            signalIds.forEach((id) => obexManager.disconnect(id));
            signalIds = [];
        };

        const cleanupSession = async () => {
            try {
                await obexManager.removeSession(sessionPath);
            } catch (error) {
                log(`Failed to cleanup session: ${error}`);
            }
        };

        const processNextFile = async (): Promise<void> => {
            // Clear up signals from last transfer
            cleanupSignals();

            // Check to see if we're done
            if (currentFileIndex >= files.length) {
                progressDialog.close();
                const message =
                    files.length === 1
                        ? `"${files[0].get_basename()}" was sent to ${this.device.alias}.`
                        : `${files.length} files were sent to ${this.device.alias}.`;
                this.showDialog("Files sent successfully", message);
                cleanupSignals();
                cleanupSession();
                return;
            }

            const currentFile = files[currentFileIndex];
            const currentFilePath = currentFile.get_path();
            const currentFilename = currentFile.get_basename();

            if (!currentFilePath || !currentFilename) {
                // Skip invalid files
                currentFileIndex++;
                return processNextFile();
            }

            progressDialog.hideError();
            progressDialog.updateFrom(currentFilePath);
            progressDialog.updateProgress(0, 1);

            signalIds.push(
                obexManager.connect(
                    "transfer-progress",
                    (_, path: string, transferred: number, total: number) => {
                        if (path === transferPath) {
                            progressDialog.updateProgress(transferred, total);
                        }
                    },
                ),

                obexManager.connect("transfer-completed", (_, path: string) => {
                    if (path === transferPath) {
                        currentFileIndex++;
                        processNextFile();
                    }
                }),

                obexManager.connect("transfer-failed", (_, path: string) => {
                    if (path === transferPath) {
                        const message =
                            "Make sure that the remote device is switched on and that it accepts Bluetooth connections";
                        progressDialog.showError(message);
                    }
                }),
            );

            try {
                transferPath = await obexManager.sendFileWithSession(
                    sessionPath,
                    currentFilePath,
                );

                if (!transferPath) {
                    const message =
                        files.length === 1
                            ? "Could not start file transfer."
                            : `Could not start transfer for "${currentFilename}".`;
                    progressDialog.showError(message);
                }
            } catch (error) {
                const message =
                    files.length === 1
                        ? `Failed to send file: ${error}`
                        : `Failed to send "${currentFilename}": ${error}`;
                progressDialog.showError(message);
            }
        };

        progressDialog.connect("cancelled", () => {
            if (transferPath) {
                obexManager.cancelTransfer(transferPath);
            }
            cleanupSignals();
            cleanupSession();
        });

        progressDialog.connect("retry", () => processNextFile());

        progressDialog.present(this);

        await processNextFile();
    }

    private showDialog(heading: string, body: string): void {
        const dialog = new Adw.AlertDialog({
            heading,
            body,
        });
        dialog.add_response("ok", "OK");
        dialog.present(this);
    }
}
