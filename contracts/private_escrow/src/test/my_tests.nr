use aztec::{
    oracle::{random::random, debug_log::{debug_log, debug_log_format}},
    test::helpers::authwit::add_private_authwit_from_call_interface,
    protocol_types::traits::ToField
};

use crate::{
    test::utils::{
        setup::setup,
        token::private_transfer_authwit
    },
    NocomEscrowV1
};
use token_contract::Token;
use nocom_pool::{
    lib::math,
    NocomLendingPoolV1
};


#[test]
unconstrained fn e2e_test() {
    let (env, accounts, contracts) = setup(true);

    // lend tokens
    // 1. create private transfer authwit from lender to pool
    let nonce = unsafe { random() };
    let supply_amount = 10.pow_32(18) as u128;
    let supply_call_iface = Token::at(contracts.zcash)
        .transfer_private_to_public(
            accounts.lender,
            contracts.lending_pool,
            supply_amount,
            nonce
        );
    
    add_private_authwit_from_call_interface(
        *env,
        accounts.lender,
        contracts.lending_pool,
        supply_call_iface
    );
    // 2. execute deposit into protocol
    env.call_private(
        accounts.lender,
        NocomEscrowV1::at(contracts.lender_escrow)
            .supply_collateral(
                contracts.zcash,
                supply_amount,
                nonce
            )
    );

   // 3. verify balance changes
   let expected_private_balance = 20_000.pow_32(18) as u128 - supply_amount;
    assert_eq(
        env.simulate_utility(
            Token::at(contracts.zcash).balance_of_private(accounts.lender)
        ),
        expected_private_balance,
    );
    assert_eq(
        env.view_public(
            Token::at(contracts.zcash).balance_of_public(contracts.lending_pool)
        ),
        supply_amount
    );

    // 4. verify deposit receipt created
    let deposit_receipts = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_deposit_receipts(contracts.lender_escrow)
    );
    debug_log_format("Deposit receipts len: {0}", [deposit_receipts.len() as Field]);
    assert(deposit_receipts.len() == 1);
}