# Nocom Fi 
No Comment Finance - encrypted money market with private collateral and loans

Features:
 * Native to Aztec Network
 * Private collateral and health factor using TEE's and the Secret Escrow contract pattern
 * Anonymous borrowing and lending reveals only debt tokens entering and leaving the pool
 * Relies on cross chain bridges (mocked) to enable non-native assets like ZCash and USDC
 * TEE-based (mocked) liquidator service monitors position health and executes liquidation without revealing any data publicly
 * GHO-style stable coin collateralized by debt assets like ZCash

## Installation
### Prerequisites
1. install the [aztec cli](https://docs.aztec.network/devnet/developers/getting_started_on_sandbox)
2. ensure right version of aztec cli with `aztec-up -v 3.0.0-devnet.5`
3. install [`bun`](https://bun.com/docs/installation) and [`pnpm`](https://pnpm.io/installation) 

Note: this project was started with bun and [encountered an unpatched issue with monorepos](https://github.com/oven-sh/bun/issues/22846) so we have to use pnpm for installation. Not pretty but its a hackathon

### Installation Steps
The following are steps to run run and populate the full stack Nocom.Fi sandbox environment
```
# 1. clone the repository
git clone  https://github.com/jp4g/nocom-v1 && cd nocom-v1

# 2. install the repository
# This will automatically run a postinstall script that installs the aztec-standards AIP20 token
pnpm i

# 3. IN A SEPARATE TERMINAL start the aztec sandbox
aztec start --sandbox

# 4 IN THE FIRST TERMINAL go to the contracts package
cd packages/contracts

# 5. OPTIONAL: rebuild the contract artifacts
# `./packages/contracts` exports the artifacts so this is not necessary to run to test
bun run build:nr

# 6. deploy the contracts to the sandbox and populate Nocom with loans and borrows
# you can omit `-p` for a clean deploy that skips population
bun run deploy -p

# 7. IN A SEPARATE TERMINAL run the liquidation services package
# assumes `pwd` is ./packages/contracts
cd ../liquidator && docker compose up

# 8. Run the front end
# assumes `pwd` is ./packages/contracts
cd ../frontend

# 9. Open the web app at http://localhost:3000
```


## Components

## What corners were cut
 - Privacy of addresses in Nocom relies on partial notes. Due to a bug ("expecting field, found u32") this was not working at runtime. As a mock, we employ `Token.transfer_public_to_private` instead of `Token.transfer_public_to_commitment` which leaks the address publicly while still shielding funds. There is no technical limitation to using `transfer_public_to_commitment` - it just seems like a bug - but for the sake of the hackathon we elected not to debug this and worry about fixing this in the future.
 - The interest rate math is pretty messy and uses approximations that can have up to 1% error rate over a year on larger interest rates. In the future, we will switch from u128 to some sort of u252 (native in the field) and employ ray math to get precision in 
 - The interest rates are static currently. Like the public constraint over asserted prices, introducing scaling and accumulators is not difficult, but requires time. As a privacy hackathon (not a defi hackathon), this feature was deprioritized
 - There are plenty of optimizations that can be done on the noir contracts (most notably unconstrained division helpers) that are out of the scope of a PoC but impact the UX of the app
 - Testing only covers happy cases in both TXE and PXE and does not attempt to be complete. The goal of the hackathon for Nocom is PoC, not production grade code coverage. There is minimal testing of the liquidator infrastructure as well.
 - The app is not deployed to the testnet. This decision reflects the goal of proving the entire stack out, even if local, rather than spending time trying to stablize a live deployment for a demo app.
 - The liquidator service is not placed in a TEE for this hackathon. It is dockerized and mostly ready for deployment inside of Phala/ Nillion (or GCP SEV-SNP), so I think it is reasonable to assert this can just be run in a TEE while not hosting it there due to time constraints
 - The ZEC and USDC tokens are mocked, meaning they are natively issued and minted freely on Aztec. In the future, USDC will be bridged with wormhole or the native rollup bridge, and ZEC will be bridged with Train Protocol, one of the Zypherpunk Aztec<>Zcash bridges, or with additional work on the [Aztec Pioneers Zcash Aztec Swap Bridge](https://github.com/aztec-pioneers/zcash_aztec_private_swaps).
 - The price oracle is mocked, meaning it is controlled by a service owned by the liquidator. In the future, if a solid price oracle platform is launched on aztec it will be integrated. In the case that oracle service offerings are weak, we will employ the [Primus zkTLS network's noir support](https://github.com/primus-labs/zktls-verification-noir). This is overkill for a public price oracle, but the security of the price oracle is quite important, and Primus is the only service currently resembling an oracle available to Aztec Network.
 - The front end employs a non-negligible amount of hardcoding of assets by assuming there will only be USDC and ZCash debt markets and a single ZCash-collateralized stablecon