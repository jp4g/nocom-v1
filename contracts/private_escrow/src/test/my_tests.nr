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
    let zec_supply_amount = 100.pow_32(18) as u128;
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
    let usdc_supply_amount = 5_000.pow_32(6) as u128;
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
    debug_log_format("Collateral receipts len: {0}, debt receipt length: {1}", [collateral_receipts.len() as Field, debt_receipts.len() as Field]);
    let health_factor = env.view_private(
        NocomLendingPoolV1::at(contracts.lending_pool)
            .get_health_factor(
                prices_collateral,
                prices_debt
            )
    );
    debug_log_format("Health factor: {0}", [health_factor as Field]);
}