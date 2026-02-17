import Gtk from "gi://Gtk?version=4.0";
import Adw from "gi://Adw?version=1";
import GObject from "gi://GObject";

export class ShortcutsWindow extends Adw.Dialog {
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
                { title: "Move down", accelerator: "j, ↓" },
                { title: "Move up", accelerator: "k, ↑" },
                { title: "Go to first device", accelerator: "g" },
                { title: "Go to last device", accelerator: "Shift+g" },
            ]),
        );

        // Actions section
        box.append(
            this._createSection("Actions", [
                {
                    title: "Pair, connect, or disconnect device",
                    accelerator: "Enter, Space",
                },
                {
                    title: "Toggle discovery mode",
                    accelerator: "d",
                },
            ]),
        );

        // General section
        box.append(
            this._createSection("General", [
                { title: "Close window", accelerator: "Ctrl+w" },
                { title: "Show keyboard shortcuts", accelerator: "Ctrl+?" },
            ]),
        );

        clamp.set_child(box);
        scrolled.set_child(clamp);
        toolbarView.set_content(scrolled);
        this.set_child(toolbarView);
    }

    private _createSection(
        title: string,
        shortcuts: Array<{ title: string; accelerator: string }>,
    ): Gtk.Widget {
        const group = new Adw.PreferencesGroup({
            title: title,
        });

        for (const shortcut of shortcuts) {
            const row = new Adw.ActionRow({
                title: shortcut.title,
            });

            const label = new Gtk.Label({
                label: shortcut.accelerator,
                css_classes: ["dim-label", "numeric"],
            });

            row.add_suffix(label);
            group.add(row);
        }

        return group;
    }
}
