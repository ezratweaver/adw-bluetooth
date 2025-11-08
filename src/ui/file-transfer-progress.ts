import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";

export class FileTransferProgressDialog extends Adw.Dialog {
    private _cancel_button!: Gtk.Button;
    private _retry_button!: Gtk.Button;
    private _ok_button!: Gtk.Button;
    private _from_label!: Gtk.Label;
    private _to_label!: Gtk.Label;
    private _progress_bar!: Gtk.ProgressBar;
    private _error_box!: Gtk.Box;
    private _error_label!: Gtk.Label;
    private _error_icon!: Gtk.Image;

    static {
        GObject.registerClass(
            {
                Template:
                    "resource:///com/ezratweaver/AdwBluetooth/blueprints/file-transfer-progress.ui",
                InternalChildren: [
                    "cancel_button",
                    "retry_button",
                    "ok_button",
                    "from_label",
                    "to_label",
                    "progress_bar",
                    "error_box",
                    "error_label",
                    "error_icon",
                ],
                Signals: {
                    cancelled: {},
                    retry: {},
                },
            },
            this,
        );
    }

    constructor(fromName: string, toName: string) {
        super();

        this._from_label.set_text(fromName);
        this._to_label.set_text(toName);

        this._cancel_button.connect("clicked", () => {
            this.emit("cancelled");
            this.close();
        });

        this._retry_button.connect("clicked", () => {
            this.emit("retry");
        });

        this._ok_button.connect("clicked", () => {
            this.close();
        });
    }

    public updateProgress(transferred: number, total: number): void {
        const progress = transferred / total;
        this._progress_bar.set_fraction(progress);
    }

    public updateFrom(fromName: string): void {
        this._from_label.set_text(fromName);
    }

    public updateTo(toName: string): void {
        this._to_label.set_text(toName);
    }

    public showError(error: string): void {
        this._error_label.set_text(error);
        this._error_box.set_visible(true);
        this._retry_button.set_sensitive(true);
        this._retry_button.set_visible(true);
    }

    public hideError(): void {
        this._error_box.set_visible(false);
        this._retry_button.set_sensitive(false);
        this._retry_button.set_visible(false);
    }

    public showCompleted(): void {
        // Disable focus, so GTK errors don't happen
        this._cancel_button.set_can_focus(false);
        this._cancel_button.set_visible(false);

        this._retry_button.set_can_focus(false);
        this._retry_button.set_visible(false);

        this._ok_button.set_visible(true);
        this._ok_button.add_css_class("suggested-action");

        this._error_label.set_text("File transfer completed successfully");
        this._error_label.remove_css_class("error");
        this._error_box.set_visible(true);
        this._error_icon.set_from_icon_name("folder-download-symbolic");
        this._error_icon.remove_css_class("error");

        this._progress_bar.set_fraction(1.0);
    }
}
