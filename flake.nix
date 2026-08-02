{
  description = "9router dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_22   # LTS, Next 16 compatible (>=20.9)
              bun         # untuk skrip dev:bun/build:bun/start:bun
              git
              pnpm
              ripgrep
            ];
          };
        });
    };
}