{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  };
  outputs = {nixpkgs, ...}: let
    forAllSystems = function:
      nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed
      (system: function nixpkgs.legacyPackages.${system});
  in {
    formatter = forAllSystems (pkgs: pkgs.alejandra);
    devShells = forAllSystems (pkgs: {
      default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          nodejs_22 # Provides npx
          biome
          # For systems that do not ship with Python by default (required by `node-gyp`)
          python3
          # E2E testing browsers
          playwright-driver.browsers
        ];
        shellHook = ''
          # Point to nix-provided browsers
          export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
          export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
          export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
        '';
      };
    });
  };
}
