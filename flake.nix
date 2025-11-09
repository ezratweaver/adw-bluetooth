{
  description = "Adwaita Bluetooth — GJS + Libadwaita Bluetooth manager";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      # ---- Buildable package ----
      packages.${system}.default = pkgs.stdenv.mkDerivation {
        pname = "adw-bluetooth";
        version = "0.2.0";
        src = ./.;

        nativeBuildInputs = [
          pkgs.meson
          pkgs.ninja
          pkgs.pkg-config
          pkgs.blueprint-compiler
          pkgs.typescript
          pkgs.desktop-file-utils
          pkgs.wrapGAppsHook4
        ];

        buildInputs = [
          pkgs.gjs
          pkgs.libadwaita
        ];

        # Change executable to adw-bluetooth on nixos, and then fix the entrypoint
        preFixup = ''
          mv "$out/bin/com.ezratweaver.AdwBluetooth" "$out/bin/adw-bluetooth"

          sed -i "1 a imports.package._findEffectiveEntryPointName = () => 'com.ezratweaver.AdwBluetooth';" "$out/bin/adw-bluetooth"
        '';
      };

      # ---- Dev shell ----
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.git
          pkgs.pkg-config
          pkgs.gobject-introspection
          pkgs.gtk4
          pkgs.libadwaita
          pkgs.meson
          pkgs.ninja
          pkgs.gjs
          pkgs.typescript
          pkgs.desktop-file-utils
          pkgs.librsvg
          pkgs.blueprint-compiler
        ];
      };
    };
}
