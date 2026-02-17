import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";
import Gtk from "gi://Gtk?version=4.0";

/**
 * Move a file from cache to Downloads directory
 */
export async function moveFileToDownloads(filename: string): Promise<void> {
    const sourceFile = Gio.File.new_for_path(
        `${GLib.get_home_dir()}/.cache/obexd/${filename}`
    );
    
    const destinationFile = Gio.File.new_for_path(
        `${GLib.get_home_dir()}/Downloads/${filename}`
    );

    try {
        await new Promise<void>((resolve, reject) => {
            sourceFile.move_async(
                destinationFile,
                Gio.FileCopyFlags.OVERWRITE,
                GLib.PRIORITY_DEFAULT,
                null,
                null,
                (file, result) => {
                    try {
                        file?.move_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    } catch (error) {
        log(`Failed to move file to Downloads: ${error}`);
        throw error;
    }
}

/**
 * Show file picker dialog for selecting multiple files
 */
export function showFilePicker(parent: Gtk.Window): Promise<Gio.File[] | null> {
    return new Promise((resolve) => {
        const fileDialog = new Gtk.FileDialog({
            title: "Select Files to Send",
        });

        fileDialog.open_multiple(parent, null, (dialog, result) => {
            try {
                const files = dialog?.open_multiple_finish(result);
                if (files) {
                    const fileArray: Gio.File[] = [];
                    for (let i = 0; i < files.get_n_items(); i++) {
                        const file = files.get_item(i) as Gio.File;
                        fileArray.push(file);
                    }
                    resolve(fileArray);
                } else {
                    resolve(null);
                }
            } catch (error: any) {
                if (error.code !== Gio.IOErrorEnum.CANCELLED) {
                    log(`File dialog error: ${error}`);
                }
                resolve(null);
            }
        });
    });
}