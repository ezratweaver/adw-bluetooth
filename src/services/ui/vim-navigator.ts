import Gtk from "gi://Gtk?version=4.0";
import { Device } from "../../bluetooth/device.js";
import { findDeviceByPath } from "../find-by-device.js";

export interface VimNavigatorCallbacks {
    onDevicePair: (device: Device) => Promise<void>;
}

export class VimNavigator {
    private listBox: Gtk.ListBox;
    private callbacks: VimNavigatorCallbacks;
    private _vimModeActive: boolean = false;

    constructor(listBox: Gtk.ListBox, callbacks: VimNavigatorCallbacks) {
        this.listBox = listBox;
        this.callbacks = callbacks;
        this._setupMotionController();
    }

    private _setupMotionController(): void {
        // Disable vim mode if mouse hovers over the list
        const motionController = new Gtk.EventControllerMotion();
        motionController.connect("motion", () => {
            this.disableMode();
        });
        this.listBox.add_controller(motionController);
    }

    public enableMode(): void {
        if (!this._vimModeActive) {
            this._vimModeActive = true;
            this.listBox.set_selection_mode(Gtk.SelectionMode.SINGLE);
        }
    }

    public disableMode(): void {
        if (this._vimModeActive) {
            this._vimModeActive = false;
            this.listBox.set_selection_mode(Gtk.SelectionMode.NONE);
            this.listBox.unselect_all();
        }
    }

    public get isActive(): boolean {
        return this._vimModeActive;
    }

    public navigateDown(): void {
        this.enableMode();
        const selectedRow = this.listBox.get_selected_row();
        if (!selectedRow) {
            // If no row is selected, select the first one
            const firstRow = this.listBox.get_row_at_index(0);
            if (firstRow) {
                this.listBox.select_row(firstRow);
            }
            return;
        }

        const currentIndex = selectedRow.get_index();
        const nextRow = this.listBox.get_row_at_index(currentIndex + 1);
        if (nextRow) {
            this.listBox.select_row(nextRow);
        }
    }

    public navigateUp(): void {
        this.enableMode();
        const selectedRow = this.listBox.get_selected_row();
        if (!selectedRow) {
            // If no row is selected, select the first one
            const firstRow = this.listBox.get_row_at_index(0);
            if (firstRow) {
                this.listBox.select_row(firstRow);
            }
            return;
        }

        const currentIndex = selectedRow.get_index();
        if (currentIndex > 0) {
            const prevRow = this.listBox.get_row_at_index(currentIndex - 1);
            if (prevRow) {
                this.listBox.select_row(prevRow);
            }
        }
    }

    public navigateFirst(): void {
        this.enableMode();
        const firstRow = this.listBox.get_row_at_index(0);
        if (firstRow) {
            this.listBox.select_row(firstRow);
        }
    }

    public navigateLast(): void {
        this.enableMode();
        // Get the last row by iterating through all rows
        let lastRow = null;
        let index = 0;
        while (true) {
            const row = this.listBox.get_row_at_index(index);
            if (!row) break;
            lastRow = row;
            index++;
        }
        if (lastRow) {
            this.listBox.select_row(lastRow);
        }
    }

    public selectCurrent(): void {
        this.enableMode();
        const selectedRow = this.listBox.get_selected_row();
        if (selectedRow) {
            try {
                const device = findDeviceByPath(selectedRow.name);
                if (device && !device.connecting) {
                    this._handleDeviceAction(device);
                }
            } catch (e) {
                log(`Error occurred interacting with device: ${e}`);
            }
        }
    }

    private async _handleDeviceAction(device: Device): Promise<void> {
        if (!device.paired) {
            // Device not paired - pair it
            await this.callbacks.onDevicePair(device);
        } else if (device.connected) {
            // Device connected - disconnect it
            try {
                await device.disconnectDevice();
            } catch (error) {
                log(`Failed to disconnect device: ${error}`);
            }
        } else {
            // Device paired but not connected - connect it
            try {
                await device.connectDevice();
            } catch (error) {
                log(`Failed to connect device: ${error}`);
            }
        }
    }
}

