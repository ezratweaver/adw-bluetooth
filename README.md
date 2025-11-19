<h1>
<p align="center">
  <img width="80" height="100" alt="bluetooth" src="https://github.com/user-attachments/assets/f9f9e18c-2cd3-48f6-a465-d228b2f223c3" />
  <br>
  <br>
  Adwaita Bluetooth
</h1>
<p align="center">
    A GNOME inspired Bluetooth device manager built with GTK4 and Libadwaita.
    <br />
</p>
</p>

> [!WARNING]
> This project is a work in progress

![adw-bluetooth](https://github.com/user-attachments/assets/67b1ae9d-0c9c-4a8b-8810-42c1d0ec1d9b)

## About This Project

A Bluetooth device manager built for tiling window managers like Hyprland and Niri. For NixOS and Arch Linux users who want GNOME's Bluetooth functionality without the full GNOME desktop.

## Installation

### Arch Linux (AUR)

```bash
yay -S adw-bluetooth
```

### NixOS (Flake only)

Add input to the flake:

```nix
adw-bluetooth.url = "github:ezratweaver/adwaita-bluetooth";
```

And in environment.systemPackages add:

```nix
inputs.adw-bluetooth.packages.${system}.default
```

### Other (Flatpak)

```bash
flatpak install --user <flatpak-file-name>.flatpak
```

Download the Flatpak from [releases](https://github.com/ezratweaver/adwaita-bluetooth/releases).

## Dependencies

### Using Nix (Recommended)

Enter the development environment with all dependencies:

```bash
nix develop
```

### Arch

Install dependencies:

```bash
sudo pacman -S dconf gjs glib2 gtk4 hicolor-icon-theme libadwaita blueprint-compiler git meson typescript
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

# For running locally
meson compile -C builddir devel
```

#### Using Flatpak

```bash
# Install dependencies
flatpak install --user flathub org.gnome.Platform//49 org.gnome.Sdk//49
flatpak install --user flathub org.freedesktop.Sdk.Extension.node20//25.08 org.freedesktop.Sdk.Extension.typescript//25.08

# Build && Install (only in user space)
flatpak-builder --user --install --force-clean build-dir com.ezratweaver.AdwBluetooth.json

# Run
flatpak run com.ezratweaver.AdwBluetooth

# Build .flatpak file
flatpak-builder --repo=repo build-dir com.ezratweaver.AdwBluetooth.json
flatpak build-bundle repo adw-bluetooth.flatpak com.ezratweaver.AdwBluetooth
```