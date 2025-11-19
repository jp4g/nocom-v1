use aztec::{
    oracle::random::random,
    protocol_types::address::AztecAddress,
    test::helpers::{test_environment::TestEnvironment, txe_oracles}
};

use token_contract::Token;
use mock_price_feed::MockPriceFeed;
use nocom_pool::NocomLendingPoolV1;
use crate::NocomEscrowV1;

pub global USDC_NAME: str<31> = "USD Coin\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n";
pub global USDC_SYMBOL: str<31> = "USDC\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n";
pub global USDC_DECIMALS: u8 = 18;

pub global ZCASH_NAME: str<31> = "ZCash\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n";
pub global ZCASH_SYMBOL: str<31> = "ZEC\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n";
pub global ZCASH_DECIMALS: u8 = 18;

pub struct TestAccounts {
    pub admin: AztecAddress,
    pub user: AztecAddress,
    pub liquidator: AztecAddress,
    pub external: AztecAddress,
    pub secret: Field,
}

pub struct TestContracts {
    pub zcash: AztecAddress,
    pub usdc: AztecAddress,
    pub lending_pool: AztecAddress,
    pub price_feed: AztecAddress,
    pub escrow: AztecAddress
}

pub unconstrained fn setup(mint: bool) -> (
    &mut TestEnvironment,
    TestAccounts,
    TestContracts
) {
  let mut env = TestEnvironment::new();
  let accounts = setup_accounts::<4>(&mut env);

  let mut test_accounts = TestAccounts {
      admin: accounts[0],
      user: accounts[1],
      liquidator: accounts[2],
      external: accounts[3],
      secret: random(),
  };

  // deploy token contracts
  let usdc = deploy_token_contract(
      &mut env,
      test_accounts.admin,
      USDC_NAME,
      USDC_SYMBOL,
      USDC_DECIMALS
  );
  let zcash = deploy_token_contract(
      &mut env,
      test_accounts.admin,
      ZCASH_NAME,
      ZCASH_SYMBOL,
      ZCASH_DECIMALS
  );
  // deploy mock price feed contract
  let price_feed = deploy_price_feed_contract(
      &mut env,
      test_accounts.admin
  );
  // deploy lending pool contract
  let lending_pool = deploy_lending_pool_contract(
        &mut env,
        test_accounts.admin,
        price_feed,
        AztecAddress::zero(), // stable token address to be set later
        test_accounts.admin,
  );
  // deploy shared account escrow
    let (escrow, escrow_secret) = deploy_shared_account_contract(
        &mut env,
        test_accounts.admin,
        lending_pool
    );

  let contracts = TestContracts {
      zcash,
      usdc,
      lending_pool: lending_pool,
      price_feed,
      escrow
  };

  test_accounts.secret = escrow_secret;

  (&mut env, test_accounts, contracts)
}

pub unconstrained fn setup_accounts<let NUM_ACCOUNTS: u32>(
    env: &mut TestEnvironment
) -> [AztecAddress; NUM_ACCOUNTS] {
    // Setup env, generate keys
    let mut accounts = [AztecAddress::zero(); NUM_ACCOUNTS];
    for i in 0..NUM_ACCOUNTS {        
        accounts[i] = env.create_contract_account();
    }
    accounts
}

pub unconstrained fn deploy_lending_pool_contract(
    env: &mut TestEnvironment,
    admin: AztecAddress,
    price_feed_address: AztecAddress,
    stable_token_address: AztecAddress,
    treasury_address: AztecAddress,
) -> AztecAddress {
    let initializer_call_interface = NocomLendingPoolV1::interface()
        .constructor(
            price_feed_address,
            stable_token_address,
            treasury_address,
        );
    env.deploy("@nocom_lending_pool/NocomLendingPoolV1")
        .with_public_initializer(admin, initializer_call_interface)
}


pub unconstrained fn deploy_token_contract(
    env: &mut TestEnvironment,
    owner: AztecAddress,
    name: str<31>,
    symbol: str<31>,
    decimals: u8
) -> AztecAddress {
    let initializer_call_interface = Token::interface()
        .constructor_with_minter(
            name,
            symbol,
            decimals,
            owner,
            AztecAddress::zero()
        );
    env.deploy("Token")
        .with_public_initializer(owner, initializer_call_interface)
}

pub unconstrained fn deploy_price_feed_contract(
    env: &mut TestEnvironment,
    owner: AztecAddress
) -> AztecAddress {
    let initializer_call_interface = MockPriceFeed::interface()
        .constructor(owner);
    env.deploy("@nocom_mock_price_oracle/MockPriceFeed")
        .with_public_initializer(owner, initializer_call_interface)
}

pub unconstrained fn deploy_shared_account_contract(
    env: &mut TestEnvironment,
    owner: AztecAddress,
    lending_pool_address: AztecAddress
) -> (AztecAddress, Field) {
    // setup keys for escrow account
    let escrow_secret = unsafe { random() };
    let _ = txe_oracles::add_account(escrow_secret);

    // deploy shared account escrow
    let initializer_call_interface = NocomEscrowV1::interface()
        .constructor(lending_pool_address);
    let mut contract_instance = env.deploy("NocomEscrowV1");

    contract_instance.secret = escrow_secret;

    let contract_address = contract_instance
        .with_private_initializer(owner, initializer_call_interface);

    (contract_address, escrow_secret)
}