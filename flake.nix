{
  description = "subq - subscription tracking";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    nixpkgs,
    flake-utils,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          biome
          flyctl
          sqlite
          # E2E testing browsers
          playwright-driver.browsers
        ];
        shellHook = ''
          # Point to nix-provided browsers
          export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
          export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
          export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

          echo "subq dev shell"
        '';
      };
    });
}
