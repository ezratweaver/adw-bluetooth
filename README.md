<h1>
<p align="center">
  <img width="80" height="100" alt="bluetooth" src="https://github.com/user-attachments/assets/f9f9e18c-2cd3-48f6-a465-d228b2f223c3" />
  <br>
  <br>
  Adwaita Bluetooth
</h1>
<p align="center">
    A fully featured GNOME inspired Bluetooth device manager built with GTK4 and Libadwaita.
    <br />
</p>
</p>

![adw-bluetooth-1-0-0](https://github.com/user-attachments/assets/4ebfe0a8-9296-4c2d-b216-183a1bc4f902)

## About This Project

A fully featured bluetooth device manager built for tiling window managers like Hyprland and Niri. For NixOS and Arch Linux users who want GNOME's Bluetooth functionality without the full GNOME desktop.

## Features

- **Device Discovery:** Scan for and discover nearby Bluetooth devices.
- **Pairing & Connecting:** Easily pair with and connect to devices.
- **Battery Info:** View and monitor device battery information.
- **File Transfer:** Send and receive files to and from other devices.
- **Multi-Adapter Support:** Switch between adapter hardware.
- **Modern UI:** A clean and modern user interface using Adwaita.
- **Vim Keybindings:** Navigate and manage devices with vim-like keybindings.
  - `j`/`↓`: Move down
  - `k`/`↑`: Move up
  - `g`: Go to first device
  - `Shift+g`: Go to last device
  - `Enter`/`Space`: Pair, connect, or disconnect device
  - `d`: Toggle discovery mode

## Installation

### Arch Linux (AUR)

```bash
yay -S adw-bluetooth
```

### NixOS (available only on unstable)

```nix
services.adw-bluetooth.enable = true;
```

## Compiling from source

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
