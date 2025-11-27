import Adw from "gi://Adw";
import { bluetooth } from "../../bluetooth/bluetooth.js";
import { FileTransferProgressDialog } from "../../ui/file-transfer-progress.js";
import { formatBytesToHumanReadable } from "../formatting.js";
import { displayDialogAsTopLevel } from "../dialog.js";
import { moveFileToDownloads } from "../filesystem.js";
import { findDeviceByAddress } from "../find-by-device.js";

export class IncomingTransferManager {
    private incomingTransfers: Map<string, FileTransferProgressDialog> =
        new Map();
    private showToast: (message: string) => void;

    constructor(showToast: (message: string) => void) {
        this.showToast = showToast;
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        if (!bluetooth.obex) return;

        bluetooth.obex.connect(
            "incoming-transfer-request",
            (
                _,
                requestId: string,
                filename: string,
                size: string,
                deviceAddress: string
            ) => {
                this.showIncomingTransferRequest(
                    requestId,
                    filename,
                    size,
                    deviceAddress
                );
            }
        );

        bluetooth.obex.connect(
            "incoming-transfer-started",
            (
                _,
                transferPath: string,
                filename: string,
                deviceAddress: string
            ) =>
                this.showIncomingTransferDialog(
                    transferPath,
                    filename,
                    deviceAddress
                )
        );

        bluetooth.obex.connect(
            "transfer-progress",
            (_, transferPath: string, transferred: number, total: number) => {
                const dialog = this.incomingTransfers.get(transferPath);
                if (dialog) {
                    this.updateIncomingTransferProgress(
                        dialog,
                        transferred,
                        total
                    );
                }
            }
        );

        bluetooth.obex.connect(
            "transfer-completed",
            (_, transferPath: string, filename: string) => {
                const dialog = this.incomingTransfers.get(transferPath);
                if (dialog) {
                    this.onIncomingTransferCompleted(
                        dialog,
                        transferPath,
                        filename
                    );
                }
            }
        );

        bluetooth.obex.connect("transfer-failed", (_, transferPath: string) => {
            const dialog = this.incomingTransfers.get(transferPath);
            if (dialog) {
                this.onIncomingTransferFailed(dialog, transferPath);
            }
        });
    }

    private showIncomingTransferRequest(
        requestId: string,
        filename: string,
        size: string,
        deviceAddress: string
    ): void {
        const humanReadableSize = formatBytesToHumanReadable(parseInt(size));

        // Find device by address to get the device name
        const device = findDeviceByAddress(deviceAddress);
        const deviceName = device?.alias || deviceAddress;

        const dialog = new Adw.AlertDialog({
            heading: "Incoming File Transfer",
            body: `Device "${deviceName}" wants to send you the file "${filename}" (${humanReadableSize}).\n\nDo you want to accept this file?`,
            closeResponse: "reject",
            defaultResponse: "accept",
        });

        dialog.add_response("reject", "_Reject");
        dialog.add_response("accept", "_Accept");

        dialog.connect("response", (_, response: string) => {
            try {
                if (response === "accept") {
                    bluetooth.obex?.acceptAuthorization(requestId);
                } else {
                    bluetooth.obex?.rejectAuthorization(requestId);
                }
            } catch (error) {
                log(`Failed to handle transfer authorization: ${error}`);
                if (response === "accept") {
                    this.showToast("Failed to accept file transfer");
                }
            }
        });

        displayDialogAsTopLevel(dialog);
    }

    private showIncomingTransferDialog(
        transferPath: string,
        filename: string,
        deviceAddress: string
    ): void {
        // Find device by address to get the device name
        const device = findDeviceByAddress(deviceAddress);
        const deviceName = device?.alias || deviceAddress;

        const progressDialog = new FileTransferProgressDialog(
            deviceName,
            "~/Downloads/" + filename
        );
        progressDialog.updateProgress(0, 1);

        const stopTransfer = async () => {
            try {
                await bluetooth.obex?.cancelTransfer(transferPath);
            } catch (error) {
                log(`Failed to cancel incoming transfer: ${error}`);
            }
            this.incomingTransfers.delete(transferPath);
        };

        progressDialog.connect("closed", () => {
            if (progressDialog.progress < 1) {
                stopTransfer();
            }
        });

        this.incomingTransfers.set(transferPath, progressDialog);

        displayDialogAsTopLevel(progressDialog);
    }

    private updateIncomingTransferProgress(
        dialog: FileTransferProgressDialog,
        transferred: number,
        total: number
    ): void {
        dialog.updateProgress(transferred, total);
    }

    private async onIncomingTransferCompleted(
        dialog: FileTransferProgressDialog,
        transferPath: string,
        filename: string
    ): Promise<void> {
        this.incomingTransfers.delete(transferPath);

        // Move file from .cache to Downloads
        await moveFileToDownloads(filename);

        dialog.showCompleted();
    }

    private onIncomingTransferFailed(
        dialog: FileTransferProgressDialog,
        transferPath: string
    ): void {
        dialog.showError("File transfer failed");
        this.incomingTransfers.delete(transferPath);
    }

    public destroy(): void {
        // Clean up any remaining dialogs
        for (const [_, dialog] of this.incomingTransfers) {
            dialog.close();
        }
        this.incomingTransfers.clear();
    }
}
