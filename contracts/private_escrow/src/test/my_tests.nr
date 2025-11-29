use aztec::{
    oracle::{random::random, debug_log::{debug_log, debug_log_format}},
    test::helpers::authwit::add_private_authwit_from_call_interface,
    protocol_types::traits::ToField
};

use crate::{
    test::utils::{
        setup::setup,
        token::private_transfer_authwit,
        pool::get_next_epoch
    },
    NocomEscrowV1
};
use token_contract::Token;
use nocom_pool::{
    utils::{math, constants},
    NocomLendingPoolV1
};
use mock_price_feed::MockPriceFeed;


#[test]
unconstrained fn math_test() {
    let (env, accounts, contracts) = setup(true);
    debug_log_format("is this thing on?", []);
    let principal = 7000 * constants::WAD;
    let start_epoch = 0;
    let next_epoch = 1;
    let interest = math::calculate_interest(
        principal,
        start_epoch,
        next_epoch,
        constants::EPOCH_LENGTH,
        constants::BORROW_INTEREST,
    );
    debug_log_format("Interest: {0}", [interest as Field]);
    debug_log_format("principal: {0}", [principal as Field]);
}

// #[test]
unconstrained fn test_liquidation() {
    let (env, accounts, contracts) = setup(true);

    // 1. lend 500,000 USDC from lender into the pool 
    let lender_deposit_amount = 500_000 * constants::WAD;
    // 1a. approve the lending pool to spend lender's USDC
    // Safety: ignore
    let nonce = unsafe { random() };
    let lender_supply_call_iface = Token::at(contracts.usdc)
        .transfer_private_to_public(
            accounts.lender,
            contracts.lending_pool,
            lender_deposit_amount,
            nonce
        );
    add_private_authwit_from_call_interface(
        *env,
        accounts.lender,
        contracts.lending_pool,
        lender_supply_call_iface
    );
    // 1b. supply the USDC to the pool
    env.call_private(
        accounts.lender,
        NocomLendingPoolV1::at(contracts.lending_pool)
            .supply_private(
                accounts.lender, // account holding tokens
                lender_deposit_amount,
                nonce,
            )
    );
    // 1c. check pool utilization is updated
    let utilization = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_utilization()
    );
    assert(
        (utilization.total_supplied == lender_deposit_amount)
        & (utilization.total_borrowed == 0),
        "Pool utilization incorrect after lending"
    );
    // 1d. check lender's loan note exists
    let expected_loan_epoch = unsafe { get_next_epoch() };
    let loan_note = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_loan(accounts.lender)
    );
    assert(
        (loan_note.amount == lender_deposit_amount)
        & (loan_note.epoch == expected_loan_epoch),
        "Lender loan note incorrect after lending"
    );
    // 1e. check token balances
    let lender_usdc_balance_after_lend = env.simulate_utility(
        Token::at(contracts.usdc).balance_of_private(accounts.lender)
    );
    let expected_lender_usdc_balance_after_lend = 1_000_000 * constants::WAD - lender_deposit_amount;
    assert(
        lender_usdc_balance_after_lend == expected_lender_usdc_balance_after_lend,
        "Lender USDC balance incorrect after lending"
    );
    let pool_usdc_balance_after_lend = env.view_public(
        Token::at(contracts.usdc).balance_of_public(contracts.lending_pool)
    );
    assert(
        pool_usdc_balance_after_lend == lender_deposit_amount,
        "Lending pool USDC balance incorrect after lending"
    );

    // 2. register borrower's escrow (shows liquidator can read the escrow notes)
    let liquidator_escrow_signature: [u8; 64] = [0; 64]; // TODO: set real signature
    env.call_private(
        accounts.borrower,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .register(liquidator_escrow_signature)
    );

    // 3. supply 20 ZEC as collateral from borrower escrow to the pool
    let borrower_collateral_amount = 20 * constants::WAD;
    // 3a. approve the lending pool to spend borrower's ZEC
    // Safety: ignore
    let collateral_authwit_nonce = unsafe { random() };
    let borrower_collateral_approve_call_iface = Token::at(contracts.zcash)
        .transfer_private_to_public(
            accounts.borrower,
            contracts.lending_pool,
            borrower_collateral_amount,
            collateral_authwit_nonce
        );
    add_private_authwit_from_call_interface(
        *env,
        accounts.borrower,
        contracts.lending_pool,
        borrower_collateral_approve_call_iface
    );
    // 3b. supply the collateral to the pool
    env.call_private(
        accounts.borrower,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .supply_collateral(
                borrower_collateral_amount,
                collateral_authwit_nonce
            )
    );
    // 3c. check token balances
    let borrower_zec_balance_after_collateral = env.simulate_utility(
        Token::at(contracts.zcash).balance_of_private(accounts.borrower)
    );
    let expected_borrower_zec_balance_after_collateral = 20_000 * constants::WAD - borrower_collateral_amount;
    assert(
        borrower_zec_balance_after_collateral == expected_borrower_zec_balance_after_collateral,
        "Borrower ZEC balance incorrect after supplying collateral"
    );
    let pool_zec_balance_after_collateral = env.view_public(
        Token::at(contracts.zcash).balance_of_public(contracts.lending_pool)
    );
    assert(
        pool_zec_balance_after_collateral == borrower_collateral_amount,
        "Lending pool ZEC balance incorrect after borrower supplying collateral"
    );

    // 4. borrow USDC against the collateral
    // 4a. execute the borrow
    let borrow_amount = 7_000 * constants::WAD as u128;
    let mut zec_asserted_price = 500 * constants::PRICE_BASE; // $500
    let mut usdc_asserted_price = constants::PRICE_BASE; // $1
    env.call_private(
        accounts.borrower,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .borrow(
                borrow_amount,
                zec_asserted_price,
                usdc_asserted_price
            )
    );
    // 4b. check pool utilization is updated
    let utilization_after_borrow = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_utilization()
    );
    assert(
        (utilization_after_borrow.total_supplied == lender_deposit_amount)
        & (utilization_after_borrow.total_borrowed == borrow_amount),
        "Pool utilization incorrect after borrowing"
    );
    // 4c. check borrower's loan and collateral notes exists
    let expected_borrow_epoch = unsafe { get_next_epoch() - 1 };
    let (borrower_collateral_note, borrower_loan_note) = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_collateral_and_debt(contracts.borrower_escrow)
    );
    debug_log_format("expected: {0}, epoch: {1}", [
        expected_borrow_epoch as Field,
        borrower_loan_note.epoch as Field
    ]);
    assert(
        (borrower_loan_note.amount == borrow_amount)
        & (borrower_loan_note.epoch == expected_borrow_epoch),
        "Borrower loan note incorrect after borrowing"
    );
    assert(
        borrower_collateral_note.amount == borrower_collateral_amount,
        "Borrower collateral note incorrect after borrowing"
    );
    // 4d. check token balances
    let borrower_usdc_balance_after_borrow = env.simulate_utility(
        Token::at(contracts.usdc).balance_of_private(accounts.borrower)
    );
    assert(
        borrower_usdc_balance_after_borrow == borrow_amount,
        "Borrower USDC balance incorrect after borrowing"
    );
    // 4e. check LTV and liquidation health are correct
    let (ltv_initial, liquidation_health_initial) = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_health_factor(
                contracts.borrower_escrow,
                expected_borrow_epoch,
                zec_asserted_price,
                usdc_asserted_price
            )
    );
    // todo: methodology on expected ltv
    let mut expected_ltv = 107142;
    let mut expected_liquidation_health = 114285;
    assert(
        (ltv_initial == expected_ltv)
        & (liquidation_health_initial == expected_liquidation_health),
        "LTV or liquidation health incorrect after borrowing"
    );

    // 5. drop the price of ZEC below the liquidation threshold
    // @ $437 is just under 20% drop -> below .8 liquidation threshold
    zec_asserted_price = 437 * constants::PRICE_BASE; // $437
    env.call_public(
        accounts.admin,
        MockPriceFeed::at(contracts.price_oracle)
            .set_price(contracts.zcash, zec_asserted_price)
    );

    let (ltv_after_drop, liquidation_health_after_drop) = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_health_factor(
                contracts.borrower_escrow,
                expected_borrow_epoch,
                zec_asserted_price,
                usdc_asserted_price
            )
    );

    debug_log_format("ltv after price drop: {0}\nliq threshold after drop: {1}", [
        ltv_after_drop as Field,
        liquidation_health_after_drop as Field
    ]);

    // 6. liquidate part of the borrower's loan from the liquidator's escrow
    // 6a. approve the lending pool to spend liquidator's USDC
    let liquidator_liquidation_amount = 3_500 * constants::WAD;
    let liquidation_authwit_nonce = unsafe { random() };
    let liquidation_repay_transfer_call_iface = Token::at(contracts.usdc)
        .transfer_private_to_public(
            accounts.liquidator,
            contracts.lending_pool,
            liquidator_liquidation_amount,
            liquidation_authwit_nonce
        );
    add_private_authwit_from_call_interface(
        *env,
        accounts.liquidator,
        contracts.lending_pool,
        liquidation_repay_transfer_call_iface
    );
    // 6b. execute the liquidation
    env.call_private(
        accounts.liquidator,
        NocomEscrowV1::at(contracts.borrower_escrow)
            .liquidate(
                liquidator_liquidation_amount,
                liquidation_authwit_nonce,
                zec_asserted_price,
                usdc_asserted_price
            )
    );

    let (collateral_note_after_liquidation, loan_note_after_liquidation) = env.simulate_utility(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_collateral_and_debt(contracts.borrower_escrow)
    );
    debug_log_format("collateral after liquidation: {0}\nloan after liquidation: {1}", [
        collateral_note_after_liquidation.amount as Field,
        loan_note_after_liquidation.amount as Field
    ]);

    // let (ltv_after_liquidation, liquidation_health_after_liquidation) = env.simulate_utility(
    //     NocomLendingPoolV1::at(contracts.lending_pool)
    //         .get_health_factor(
    //             contracts.borrower_escrow,
    //             expected_borrow_epoch,
    //             zec_asserted_price,
    //             usdc_asserted_price
    //         )
    // );

    // debug_log_format("ltv after liquidation: {0}\nliq threshold after liquidation: {1}", [
    //     ltv_after_liquidation as Field,
    //     liquidation_health_after_liquidation as Field
    // ]);
}

// test cases:
// borrow over ltv
// borrow with no collateral
// try to withdraw more collateral than available
// try to withdraw more than deposited
// liquidate when ltv is above threshold
// check epoch advancement and interest accrual on borrow and lend
