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
        version = "1.1.0";
        src = ./daemon;
        vendorHash = "sha256-7tiSwNhq6e4LEh4lUkfh2i4tEdWWL6TxQpYYwYKsfog=";
      };
    in
    {
      # ---- Derivation ----
      packages.${system}.default = pkgs.stdenv.mkDerivation {
        pname = "adw-bluetooth";
        version = "1.1.0";
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

        # Skip building the daemon through meson; we use buildGoModule instead
        mesonFlags = [ "-Dbuild_daemon=false" ];

        postInstall = ''
          install -Dm755 ${daemon}/bin/daemon $out/libexec/adw-bluetooth-daemon
        '';
      };

      # ---- NixOS module ----
      nixosModules.default =
        {
          config,
          lib,
          pkgs,
          ...
        }:
        let
          pkg = self.packages.${pkgs.system}.default;
        in
        {
          options.services.adw-bluetooth = {
            enable = lib.mkEnableOption "Adwaita Bluetooth daemon";
          };

          config = lib.mkIf config.services.adw-bluetooth.enable {
            systemd.user.services.adw-bluetooth-daemon = {
              description = "AdwBluetooth Daemon";
              wantedBy = [ "default.target" ];
              after = [ "bluetooth.target" ];
              serviceConfig = {
                Type = "dbus";
                BusName = "com.ezratweaver.AdwBluetoothDaemon";
                ExecStart = "${pkg}/libexec/adw-bluetooth-daemon";
              };
            };

            environment.systemPackages = [ pkg ];
            services.dbus.packages = [ pkg ];
          };
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
