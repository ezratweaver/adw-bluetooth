import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";

export class PinConfirmationDialog extends Adw.Dialog {
    private _cancel_button!: Gtk.Button;
    private _confirm_button!: Gtk.Button;
    private _device_message!: Gtk.Label;
    private _pin_label!: Gtk.Label;

    static {
        GObject.registerClass(
            {
                Template:
                    "resource:///com/ezratweaver/AdwBluetooth/ui/pin-confirmation.ui",
                InternalChildren: [
                    "cancel_button",
                    "confirm_button",
                    "device_message",
                    "pin_label",
                ],
                Signals: {
                    confirmed: {},
                    cancelled: {},
                },
            },
            this,
        );
    }

    constructor(deviceName: string, pin: string, displayOnly: boolean = false) {
        super();

        if (displayOnly) {
            this._device_message.set_text(`Enter this PIN on "${deviceName}":`);
            this._cancel_button.set_visible(false);
            this._confirm_button.set_label("OK");
        } else {
            this._device_message.set_text(
                `Please confirm that the following PIN matches the one displayed on "${deviceName}".`,
            );
        }

        this._pin_label.set_text(pin);

        this._cancel_button.connect("clicked", () => {
            this.emit("cancelled");
            this.close();
        });

        this._confirm_button.connect("clicked", () => {
            if (displayOnly) {
                this.close();
            } else {
                this.emit("confirmed");
                this.close();
            }
        });
    }
}
