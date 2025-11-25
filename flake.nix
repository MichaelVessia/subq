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
          nodejs_22  # Provides npx
          biome
          # For systems that do not ship with Python by default (required by `node-gyp`)
          python3
          postgresql_16
        ];

        shellHook = ''
          export PGDATA="$PWD/.postgres/data"
          export PGHOST="$PWD/.postgres"
          export PGDATABASE="scalability_dev"

          if [ ! -d "$PGDATA" ]; then
            echo "Initializing PostgreSQL database..."
            initdb --auth=trust --no-locale --encoding=UTF8
          fi

          # Start PostgreSQL if not running
          if ! pg_ctl status > /dev/null 2>&1; then
            echo "Starting PostgreSQL..."
            pg_ctl start -l "$PWD/.postgres/postgres.log" -o "-k $PGHOST"
          fi

          # Create database if it doesn't exist
          if ! psql -lqt | cut -d \| -f 1 | grep -qw "$PGDATABASE"; then
            echo "Creating database $PGDATABASE..."
            createdb "$PGDATABASE"
          fi
        '';
      };
    });
  };
}
