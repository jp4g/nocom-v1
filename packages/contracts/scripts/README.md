# Build Scripts

## postinstall.ts

Automatic patch script that runs after `pnpm install` to fix known issues with the Aztec packages.

### What it does:

1. **Patches missing `public_include_metric_prefixes.json` file** in all `@aztec/cli` installations
   - This file is missing from `@aztec/cli@3.0.0-devnet.5` due to a packaging bug
   - Creates an empty array `[]` which means no OpenTelemetry metrics filtering
   - Patches all versions found in `node_modules/.pnpm/`

2. **Creates required artifacts directories**:
   - `src/artifacts/escrow/`
   - `src/artifacts/pool/`
   - `src/artifacts/price_oracle/`

### Why this is needed:

The `@aztec/cli@3.0.0-devnet.5` package has a packaging bug where the `public_include_metric_prefixes.json` file referenced in the source code is not included in the published package. This causes module resolution errors during the `aztec codegen` step.

### When it runs:

- Automatically after `pnpm install`
- Can be run manually: `bun run scripts/postinstall.ts`

### Note:

This is a temporary workaround. When Aztec releases a fixed version, this script can be removed.
