<h1 align="center">
  <img width="80" height="100" alt="Adwaita Bluetooth icon" src="https://github.com/user-attachments/assets/f9f9e18c-2cd3-48f6-a465-d228b2f223c3" />
  <br>
  Adwaita Bluetooth
</h1>
<p align="center">
  A Bluetooth device manager for Hyprland, Niri, and other tiling window managers, built with GTK4 and Libadwaita.
</p>

<p align="center">
  Pair and connect devices, check battery levels, and transfer files without installing the full GNOME desktop.
</p>

![Adwaita Bluetooth device manager](https://github.com/user-attachments/assets/4ebfe0a8-9296-4c2d-b216-183a1bc4f902)

## Installation

### Arch Linux (AUR)

```bash
yay -S adw-bluetooth
```

### NixOS (26.05 & Unstable)

```nix
services.adw-bluetooth.enable = true;
```

## Features

- **Device discovery:** Scan for nearby Bluetooth devices.
- **Pairing and connections:** Pair with, connect to, and disconnect devices.
- **Battery information:** Check battery levels for devices that report them.
- **File transfer:** Send files to and receive files from other devices.
- **Multiple adapters:** Switch between Bluetooth adapters.
- **Keyboard controls:** Navigate and manage devices with Vim shortcuts.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `g` | Go to the first device |
| `Shift+g` | Go to the last device |
| `Enter` / `Space` | Pair, connect, or disconnect the selected device |
| `d` | Turn discovery on or off |

## Building from source

### Dependencies

#### Using Nix (Recommended)

Enter the development environment with all dependencies:

```bash
nix develop
```

#### Arch

Install dependencies:

```bash
sudo pacman -S dconf gjs glib2 gtk4 hicolor-icon-theme libadwaita blueprint-compiler git meson typescript go
```

### Build Steps

#### Using Nix

```bash
nix build
```

#### Using Meson

```bash
meson setup builddir
meson compile -C builddir
```

For local development, start the daemon in one terminal before running the GUI:

```bash
# Terminal 1: Start the daemon
./builddir/adw-bluetooth-daemon

# Terminal 2: Run the GUI
meson compile -C builddir devel
```

To skip building the daemon (e.g. if you are building it separately):

```bash
meson setup builddir -Dbuild_daemon=false
```
