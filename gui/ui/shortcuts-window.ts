import Gtk from "gi://Gtk?version=4.0";
import Adw from "gi://Adw?version=1";
import GObject from "gi://GObject";
import Gdk from "gi://Gdk?version=4.0";
import {
    SHORTCUTS,
    ShortcutDefinition,
    disconnectShortcutChanged,
    getShortcut,
    onShortcutChanged,
    resetShortcut,
    setShortcut,
} from "../services/gsettings/shortcuts.js";

// Normalize so "<Shift>G" and "<Shift>g" compare equal
function normalizeShortcut(shortcut: string): string {
    const [ok, key, mods] = Gtk.accelerator_parse(shortcut);
    if (!ok) return shortcut;
    return Gtk.accelerator_name(Gdk.keyval_to_lower(key), mods);
}

function formatShortcut(shortcut: string): string {
    const [ok, key, mods] = Gtk.accelerator_parse(shortcut);
    return ok ? Gtk.accelerator_get_label(key, mods) : shortcut;
}

export class ShortcutsWindow extends Adw.Dialog {
    private _settingsHandlerIds: number[] = [];

    static {
        GObject.registerClass(
            {
                GTypeName: "ShortcutsWindow",
            },
            this,
        );
    }

    constructor(parent: Gtk.Window) {
        super();

        this.set_content_width(480);
        this.set_content_height(520);

        this._createContent();

        this.connect("closed", () => {
            this._settingsHandlerIds.forEach(disconnectShortcutChanged);
        });

        this.present(parent);
    }

    private _createContent(): void {
        // Create toolbar view with header
        const toolbarView = new Adw.ToolbarView();

        const headerbar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: "Keyboard Shortcuts",
            }),
        });
        toolbarView.add_top_bar(headerbar);

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });

        const clamp = new Adw.Clamp({
            maximum_size: 600,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 24,
        });

        // Navigation section
        box.append(
            this._createSection("Navigation", [
                this._createEditableRow(SHORTCUTS.moveDown),
                this._createEditableRow(SHORTCUTS.moveUp),
                this._createEditableRow(SHORTCUTS.first),
                this._createEditableRow(SHORTCUTS.last),
                this._createEditableRow(SHORTCUTS.pageDown),
                this._createEditableRow(SHORTCUTS.pageUp),
            ]),
        );

        // Actions section
        box.append(
            this._createSection("Actions", [
                this._createFixedRow(
                    "Pair, connect, or disconnect device",
                    "Enter, Space",
                ),
                this._createEditableRow(SHORTCUTS.toggleDiscovery),
            ]),
        );

        // General section
        box.append(
            this._createSection("General", [
                this._createFixedRow("Close window", "Ctrl+w"),
                this._createFixedRow("Show keyboard shortcuts", "Ctrl+?"),
            ]),
        );

        clamp.set_child(box);
        scrolled.set_child(clamp);
        toolbarView.set_content(scrolled);
        this.set_child(toolbarView);
    }

    private _createSection(title: string, rows: Adw.ActionRow[]): Gtk.Widget {
        const group = new Adw.PreferencesGroup({
            title: title,
        });

        for (const row of rows) {
            group.add(row);
        }

        return group;
    }

    private _createFixedRow(title: string, keys: string): Adw.ActionRow {
        const row = new Adw.ActionRow({ title });

        row.add_suffix(
            new Gtk.Label({
                label: keys,
                css_classes: ["dim-label", "numeric"],
            }),
        );

        return row;
    }

    private _createEditableRow(definition: ShortcutDefinition): Adw.ActionRow {
        const row = new Adw.ActionRow({
            title: definition.title,
            activatable: true,
        });

        const label = new Gtk.Label({
            css_classes: ["dim-label", "numeric"],
        });

        const updateLabel = () => {
            const keys = formatShortcut(getShortcut(definition.key));
            label.set_label(
                definition.fixed ? `${keys}, ${definition.fixed}` : keys,
            );
        };

        updateLabel();
        this._settingsHandlerIds.push(
            onShortcutChanged(definition.key, updateLabel),
        );

        row.add_suffix(label);
        row.add_suffix(new Gtk.Image({ icon_name: "document-edit-symbolic" }));
        row.connect("activated", () => this._editShortcut(definition));

        return row;
    }

    private _editShortcut(definition: ShortcutDefinition): void {
        const dialog = new Adw.AlertDialog({
            heading: "Set Shortcut",
            body: `Press a new shortcut for ${definition.title}`,
            closeResponse: "cancel",
        });

        dialog.add_response("cancel", "_Cancel");
        dialog.add_response("reset", "_Reset to Default");

        dialog.connect("response", (_, response: string) => {
            if (response === "reset") {
                resetShortcut(definition.key);
            }
        });

        const keyController = new Gtk.EventControllerKey({
            propagation_phase: Gtk.PropagationPhase.CAPTURE,
        });

        keyController.connect("key-pressed", (_, keyval, _keycode, state) => {
            const mods = state & Gtk.accelerator_get_default_mod_mask();

            // Let Escape close the dialog and ignore modifier keys alone
            if (
                keyval === Gdk.KEY_Escape ||
                !Gtk.accelerator_valid(keyval, mods)
            ) {
                return false;
            }

            const shortcut = Gtk.accelerator_name(
                Gdk.keyval_to_lower(keyval),
                mods,
            );

            const conflict = Object.values(SHORTCUTS).find(
                (other) =>
                    other.key !== definition.key &&
                    normalizeShortcut(getShortcut(other.key)) === shortcut,
            );

            if (conflict) {
                dialog.set_body(`Already used by ${conflict.title}`);
                return true;
            }

            setShortcut(definition.key, shortcut);
            dialog.close();
            return true;
        });

        dialog.add_controller(keyController);
        dialog.present(this);
    }
}
