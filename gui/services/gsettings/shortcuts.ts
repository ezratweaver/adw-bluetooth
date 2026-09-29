import { settings } from "./settings.js";

export interface ShortcutDefinition {
    // GSettings key holding the shortcut
    key: string;
    // Window action the shortcut activates
    action: string;
    title: string;
    // Fixed shortcut shown next to the configurable one
    fixed?: string;
}

export const SHORTCUTS = {
    moveDown: {
        key: "shortcut-move-down",
        action: "win.vim-down",
        title: "Move down",
        fixed: "↓",
    },
    moveUp: {
        key: "shortcut-move-up",
        action: "win.vim-up",
        title: "Move up",
        fixed: "↑",
    },
    first: {
        key: "shortcut-first",
        action: "win.vim-first",
        title: "Go to first device",
    },
    last: {
        key: "shortcut-last",
        action: "win.vim-last",
        title: "Go to last device",
    },
    toggleDiscovery: {
        key: "shortcut-toggle-discovery",
        action: "win.toggle-discovery",
        title: "Toggle discovery mode",
    },
} satisfies Record<string, ShortcutDefinition>;

export function getShortcut(key: string): string {
    return settings.get_string(key);
}

export function setShortcut(key: string, shortcut: string): void {
    settings.set_string(key, shortcut);
}

export function resetShortcut(key: string): void {
    settings.reset(key);
}

export function onShortcutChanged(key: string, callback: () => void): number {
    return settings.connect(`changed::${key}`, callback);
}

export function disconnectShortcutChanged(handlerId: number): void {
    settings.disconnect(handlerId);
}
