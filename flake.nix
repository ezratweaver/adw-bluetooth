{
  description = "Adwaita Bluetooth — GJS + Libadwaita Bluetooth manager";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      daemon = pkgs.buildGoModule {
        pname = "adw-bluetooth-daemon";
        version = "1.0.0";
        src = ./daemon;
        vendorHash = "";
      };
    in
    {
      # ---- Buildable package ----
      packages.${system}.default = pkgs.stdenv.mkDerivation {
        pname = "adw-bluetooth";
        version = "1.0.0";
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

        # Skip the meson daemon custom_target — we use buildGoModule instead
        mesonFlags = [ "-Dbuild_daemon=false" ];

        postInstall = ''
          install -Dm755 ${daemon}/bin/daemon $out/libexec/adw-bluetooth-daemon
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
          pkgs.go
        ];
      };
    };
}