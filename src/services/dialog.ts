import Adw from "gi://Adw";
import Gtk from "gi://Gtk?version=4.0";

/**
 * Display a dialog at the top level of the window hierarchy
 */
export function displayDialogAsTopLevel(dialog: Adw.Dialog): void {
    const focusedWindow = Gtk.Window.list_toplevels().find((w) => w.is_focus());
    const visibleWindow = Gtk.Window.list_toplevels().find((w) =>
        w.is_visible(),
    );

    const target = focusedWindow || visibleWindow;
    if (target) {
        dialog.present(target);
    }
}

/**
 * Show a generic alert dialog with title and description
 */
export function showAlertDialog({
    parent,
    title,
    description,
}: {
    parent: Gtk.Window;
    title: string;
    description: string;
}): void {
    const dialog = new Adw.AlertDialog({
        heading: title,
        body: description,
        defaultResponse: "ok",
    });

    dialog.add_response("ok", "OK");
    dialog.present(parent);
}

/**
 * Show a confirmation dialog with custom actions
 */
export function showDestructiveConfirmationDialog({
    parent,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
}: {
    parent: Gtk.Window;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
}): Promise<boolean> {
    return new Promise((resolve) => {
        const dialog = new Adw.AlertDialog({
            heading: title,
            body: description,
            defaultResponse: "confirm",
        });

        dialog.add_response("cancel", cancelText);
        dialog.add_response("confirm", confirmText);
        dialog.set_response_appearance(
            "confirm",
            Adw.ResponseAppearance.DESTRUCTIVE,
        );

        dialog.connect("response", (_, response) => {
            resolve(response === "confirm");
        });

        dialog.present(parent);
    });
}
