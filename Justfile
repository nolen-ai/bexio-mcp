# bexio-mcp task runner — https://github.com/casey/just
#
# Release flow:
#   just bump minor     # 0.3.0 -> 0.4.0 in package.json + src/version.ts, committed
#   git push            # get the release commit onto origin/main (CI must pass)
#   just tag            # tag v<version> and push it -> GitHub Actions builds the
#                       # Docker image (GHCR), creates the GitHub release and
#                       # publishes to npm (when NPM_TOKEN is configured)

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# List available recipes
default:
    @just --list

# Install dependencies
install:
    npm ci

# Typecheck without emitting
typecheck:
    npx tsc --noEmit

# Run the test suite (includes the 310-operation API coverage gate)
test:
    npx vitest run

# Build ESM/CJS bundles and type declarations
build:
    npm run build

# Full gate: typecheck + tests + build
check: typecheck test build

# Build the Docker image locally
docker-build:
    docker build -t bexio-mcp .

# Bump the version (patch|minor|major), sync src/version.ts and commit
bump level="patch":
    node scripts/bump.mjs {{level}}

# Tag v<package.json version> and push it (triggers the release workflow)
tag:
    node scripts/tag.mjs

# Remove build artifacts
clean:
    node -e "require('node:fs').rmSync('dist', {recursive: true, force: true}); require('node:fs').rmSync('coverage', {recursive: true, force: true})"
