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
use mock_price_feed::MockPriceFeed;



// #[test]
unconstrained fn e2e_test() {
    let (env, accounts, contracts) = setup(true);

    // lend tokens
    // 1. create private transfer authwit from lender to pool
    let nonce = unsafe { random() };
    let zec_supply_amount = 100 * 10.pow_32(18) as u128;
    let supply_call_iface = Token::at(contracts.zcash)
        .transfer_private_to_public(
            accounts.lender,
            contracts.lending_pool,
            zec_supply_amount,
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
                zec_supply_amount,
                nonce
            )
    );

   // 3. verify balance changes
   let expected_private_balance = 20_000.pow_32(18) as u128 - zec_supply_amount;
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
        zec_supply_amount
    );

    // 4. verify deposit receipt created
    let deposit_receipts = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_deposit_receipts(contracts.lender_escrow)
    );
    debug_log_format("Deposit receipts len: {0}", [deposit_receipts.len() as Field]);
    assert(deposit_receipts.len() == 1);

    // 5. supply usdc collateral as borrower
    // 733 usdc should result in ~1.1 health factor when borrowing 1 zec @ .75 LTV for usdc
    let usdc_supply_amount = 733 * 10.pow_32(18) as u128;
    let usdc_nonce = unsafe { random() };
    let usdc_supply_call_iface = Token::at(contracts.usdc)
        .transfer_private_to_public(
            accounts.borrower,
            contracts.lending_pool,
            usdc_supply_amount,
            usdc_nonce
        );
    add_private_authwit_from_call_interface(
        *env,
        accounts.borrower,
        contracts.lending_pool,
        usdc_supply_call_iface
    );
    env.call_private(
        accounts.borrower,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .supply_collateral(
                contracts.usdc,
                usdc_supply_amount,
                usdc_nonce
            )
    );
    let mut prices_collateral: BoundedVec<u128, 4> = BoundedVec::from_array([10.pow_32(4) as u128]);
    let mut prices_debt: BoundedVec<u128, 4> = BoundedVec::from_array([500 * 10.pow_32(4) as u128]);
    // 7. borrow zec
    let zec_borrow_amount = 10.pow_32(18) as u128;
    env.call_private(
        accounts.borrower,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .borrow(
                accounts.borrower,
                contracts.zcash,
                zec_borrow_amount,
                prices_collateral,
                prices_debt
            )
    );

    // 8. verify balances and utilization
    let borrowed_amount = env.simulate_utility(
            Token::at(contracts.zcash).balance_of_private(accounts.borrower)
        );
    debug_log_format("BORROWED AMOUNT: {0}", [borrowed_amount as Field]);
    assert_eq(
        borrowed_amount,
        zec_borrow_amount,
    );
    assert_eq(
        env.view_public(
            Token::at(contracts.zcash).balance_of_public(contracts.lending_pool)
        ),
        zec_supply_amount - zec_borrow_amount
    );
    let (total_supplied, total_borrowed) = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_utilization(contracts.zcash)
    );
    assert_eq(total_supplied, zec_supply_amount);
    assert_eq(total_borrowed, zec_borrow_amount);
    debug_log_format("TOTAL SUPPLIED: {0}, TOTAL BORROWED: {1}", [total_supplied as Field, total_borrowed as Field]);

    // 9. check health factor
    let debt_receipts = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_loan_receipts(contracts.borrower_escrow)
    );
    let collateral_receipts = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_deposit_receipts(contracts.borrower_escrow)
    );
    let health_factor = env.view_private(
        NocomEscrowV1::at(contracts.borrower_escrow)
            .get_health_factor(
                prices_collateral,
                prices_debt
            )
    );
    let expected_health_factor = 10995;
    debug_log_format("Health factor: {0}", [health_factor as Field]);
    assert_eq(health_factor, expected_health_factor);

    // 10. drop the price of USDC by 10% (which should bring health factor to ~.99)
    prices_collateral.set(0, 9 * 10.pow_32(3) as u128);
    env.call_public(
        accounts.admin,
        MockPriceFeed::at(contracts.price_feed).set_price(contracts.usdc, 9 * 10.pow_32(3) as u128)
    );
    let health_factor_after_price_drop = env.view_private(
        NocomEscrowV1::at(contracts.borrower_escrow)
            .get_health_factor(
                prices_collateral,
                prices_debt
            )
    );
    debug_log_format("Health factor after price drop: {0}", [health_factor_after_price_drop as Field]);

    // 11. attempt liquidation
    let liquidation_nonce = unsafe { random() };
    let liquidation_amount = 10.pow_32(18) as u128;
    let zec_liquidation_call_iface = Token::at(contracts.zcash)
        .transfer_private_to_public(
            accounts.lender,
            contracts.lending_pool,
            liquidation_amount,
            liquidation_nonce
        );
    add_private_authwit_from_call_interface(
        *env,
        accounts.lender,
        contracts.lending_pool,
        zec_liquidation_call_iface
    );
    let debt_receipts = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_loan_receipts(contracts.borrower_escrow)
    );
    let collateral_receipts = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_deposit_receipts(contracts.borrower_escrow)
    );
    let lender_zec_balance_after = env.simulate_utility(
        Token::at(contracts.zcash).balance_of_private(accounts.lender)
    );
    let lender_usdc_balance_after = env.simulate_utility(
        Token::at(contracts.usdc).balance_of_private(accounts.lender)
    );
    let treasury_usdc_balance_after = env.view_public(
        Token::at(contracts.usdc).balance_of_public(contracts.lending_pool)
    );
    debug_log_format("=========================================================", []);
    debug_log_format("Lender ZEC balance after liquidation: {0}", [lender_zec_balance_after as Field]);
    debug_log_format("Lender USDC balance after liquidation: {0}", [lender_usdc_balance_after as Field]);
    debug_log_format("Treasury USDC balance after liquidation: {0}", [treasury_usdc_balance_after as Field]);
    env.call_private(
        accounts.lender,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .liquidate(
                contracts.zcash,
                contracts.usdc,
                liquidation_amount,
                liquidation_nonce,
                prices_collateral,
                prices_debt,
                0,
                0
            )
    );

    // // 12. check state after
    // // 12a. check balances
    // let lender_zec_balance_after = env.simulate_utility(
    //     Token::at(contracts.zcash).balance_of_private(accounts.lender)
    // );
    // let lender_usdc_balance_after = env.simulate_utility(
    //     Token::at(contracts.usdc).balance_of_private(accounts.lender)
    // );
    // let treasury_usdc_balance_after = env.view_public(
    //     Token::at(contracts.usdc).balance_of_public(contracts.lending_pool)
    // );
    // debug_log_format("=========================================================", []);
    // debug_log_format("Lender ZEC balance after liquidation: {0}", [lender_zec_balance_after as Field]);
    // debug_log_format("Lender USDC balance after liquidation: {0}", [lender_usdc_balance_after as Field]);
    // debug_log_format("Treasury USDC balance after liquidation: {0}", [treasury_usdc_balance_after as Field]);
}

// #[test(should_fail_with = "Undercollateralized BOZO, L + LTV RATIO")]
unconstrained fn undercollateralized_borrow_fail() {
    let (env, accounts, contracts) = setup(true);

    // lend tokens
    // 1. create private transfer authwit from lender to pool
    let nonce = unsafe { random() };
    let zec_supply_amount = 100 * 10.pow_32(18) as u128;
    let supply_call_iface = Token::at(contracts.zcash)
        .transfer_private_to_public(
            accounts.lender,
            contracts.lending_pool,
            zec_supply_amount,
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
                zec_supply_amount,
                nonce
            )
    );

   // 3. verify balance changes
   let expected_private_balance = 20_000.pow_32(18) as u128 - zec_supply_amount;
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
        zec_supply_amount
    );

    // 4. verify deposit receipt created
    let deposit_receipts = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_deposit_receipts(contracts.lender_escrow)
    );
    debug_log_format("Deposit receipts len: {0}", [deposit_receipts.len() as Field]);
    assert(deposit_receipts.len() == 1);

    // 5. supply usdc collateral as borrower
    let usdc_supply_amount = 500 * 10.pow_32(18) as u128;
    debug_log_format("USDC supply amount: {0}", [usdc_supply_amount as Field]);
    let usdc_nonce = unsafe { random() };
    let usdc_supply_call_iface = Token::at(contracts.usdc)
        .transfer_private_to_public(
            accounts.borrower,
            contracts.lending_pool,
            usdc_supply_amount,
            usdc_nonce
        );
    add_private_authwit_from_call_interface(
        *env,
        accounts.borrower,
        contracts.lending_pool,
        usdc_supply_call_iface
    );
    env.call_private(
        accounts.borrower,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .supply_collateral(
                contracts.usdc,
                usdc_supply_amount,
                usdc_nonce
            )
    );
    let prices_collateral: BoundedVec<u128, 4> = BoundedVec::from_array([10.pow_32(4) as u128]);
    let prices_debt: BoundedVec<u128, 4> = BoundedVec::from_array([500 * 10.pow_32(4) as u128]);
    // 7. borrow zec
    let zec_borrow_amount = 10.pow_32(18) as u128; // 1 zec = 500 usdc, only 500 usdc collateral supplied -> should fail
    env.call_private(
        accounts.borrower,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .borrow(
                accounts.borrower,
                contracts.zcash,
                zec_borrow_amount,
                prices_collateral,
                prices_debt
            )
    );
    let health_factor = env.view_private(
        NocomEscrowV1::at(contracts.borrower_escrow)
            .get_health_factor(
                prices_collateral,
                prices_debt
            )
    );
    debug_log_format("Health factor after borrow attempt: {0}", [health_factor as Field]);
}