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
        // Disable vim mode when the user moves the mouse over the list
        const motionController = new Gtk.EventControllerMotion();
        let lastX = 0;
        let lastY = 0;

        motionController.connect("motion", () => {
            const [, x, y] = motionController
                .get_current_event()!
                .get_position();
            if (x === lastX && y === lastY) return;

            lastX = x;
            lastY = y;
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

    private _selectRow(row: Gtk.ListBoxRow): void {
        this.listBox.select_row(row);

        // Scroll the list so the selected row stays visible
        const viewport = this.listBox.get_ancestor(
            Gtk.Viewport.$gtype
        ) as Gtk.Viewport | null;
        viewport?.scroll_to(row, null);
    }

    public navigateDown(): void {
        this._navigateBy(1);
    }

    public navigateUp(): void {
        this._navigateBy(-1);
    }

    public navigatePageDown(): void {
        this._navigateBy(this._halfPageRows());
    }

    public navigatePageUp(): void {
        this._navigateBy(-this._halfPageRows());
    }

    // Number of rows in half of the visible list, like Vim Ctrl+D / Ctrl+U
    private _halfPageRows(): number {
        const viewport = this.listBox.get_ancestor(Gtk.Viewport.$gtype);
        const row =
            this.listBox.get_selected_row() ?? this.listBox.get_row_at_index(0);
        if (!viewport || !row || row.get_height() === 0) return 1;

        const visibleRows = viewport.get_height() / row.get_height();
        return Math.max(1, Math.floor(visibleRows / 2));
    }

    private _navigateBy(offset: number): void {
        this.enableMode();
        const selectedRow = this.listBox.get_selected_row();
        if (!selectedRow) {
            // If no row is selected, select the first one
            const firstRow = this.listBox.get_row_at_index(0);
            if (firstRow) {
                this._selectRow(firstRow);
            }
            return;
        }

        // Stop at the first or last row
        const index = Math.max(0, selectedRow.get_index() + offset);
        const row = this.listBox.get_row_at_index(index);
        if (row) {
            this._selectRow(row);
        } else {
            this.navigateLast();
        }
    }

    public navigateFirst(): void {
        this.enableMode();
        const firstRow = this.listBox.get_row_at_index(0);
        if (firstRow) {
            this._selectRow(firstRow);
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
            this._selectRow(lastRow);
        }
    }

    public selectCurrent(): void {
        this.enableMode();
        const selectedRow = this.listBox.get_selected_row();
        if (selectedRow) {
            try {
                const device = findDeviceByPath(selectedRow.name);
                if (device && !device.connecting) {
                    this.callbacks.onDevicePair(device);
                }
            } catch (e) {
                log(`Error occurred interacting with device: ${e}`);
            }
        }
    }
}
