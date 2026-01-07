{
  description = "subq - subscription tracking";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    bun2nix,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      bun2nix' = bun2nix.packages.${system}.default;

      bunDeps = bun2nix'.fetchBunDeps {
        bunNix = ./bun.nix;
      };

      mkSubqPackage = {
        pname,
        entryPoint,
      }:
        pkgs.stdenv.mkDerivation {
          inherit pname;
          version = "0.0.0";
          src = ./.;

          nativeBuildInputs = [
            bun2nix'.hook
            pkgs.makeBinaryWrapper
          ];

          inherit bunDeps;

          # Run with bun interpreter (not AOT compiled)
          dontUseBunBuild = true;
          dontUseBunCheck = true;
          dontUseBunInstall = true;

          installPhase = ''
            runHook preInstall

            mkdir -p $out/lib/subq
            cp -r . $out/lib/subq

            mkdir -p $out/bin
            makeBinaryWrapper ${pkgs.bun}/bin/bun $out/bin/${pname} \
              --add-flags "run $out/lib/subq/${entryPoint}"

            runHook postInstall
          '';
        };
    in {
      packages = {
        subq = mkSubqPackage {
          pname = "subq";
          entryPoint = "packages/tui/src/main.tsx";
        };
        subq-cli = mkSubqPackage {
          pname = "subq-cli";
          entryPoint = "packages/cli/src/main.ts";
        };
        default = self.packages.${system}.subq;
      };

      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          biome
          flyctl
          sqlite
          zig # Required for @opentui/core native module
          # E2E testing browsers
          playwright-driver.browsers
          bun2nix'
        ];
        shellHook = ''
          # Point to nix-provided browsers
          export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
          export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
          export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

          echo "subq dev shell"
          echo "  bun2nix - Regenerate bun.nix after lockfile changes"
        '';
      };
    });
}
