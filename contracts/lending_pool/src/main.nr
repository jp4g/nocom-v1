pub mod lib;
pub mod types;

use dep::aztec::macros::aztec;

#[aztec]
pub contract NocomLendingPoolV1 {
    use aztec::{
        oracle::debug_log::debug_log_format,
        macros::{functions::{external, initializer, internal, view}, storage::storage},
        messages::message_delivery::MessageDelivery,
        note::note_viewer_options::NoteViewerOptions,
        protocol_types::address::AztecAddress,
        state_vars::{Map, PrivateMutable, PublicImmutable, PublicMutable},
    };

    use crate::{
        lib::{
            constants,
            contract_methods::{_update_loan},
            math,
            time,
        },
        types::{
            config::Config, loan_note::LoanNote,
            utilization::Utilization, collateral_note::CollateralNote
        },
    };

    use mock_price_feed::MockPriceFeed;
    use token_contract::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        collateral: Map<AztecAddress, PrivateMutable<CollateralNote, Context>, Context>,
        loan: Map<AztecAddress, PrivateMutable<LoanNote, Context>, Context>,
        borrow: Map<AztecAddress, PrivateMutable<LoanNote, Context>, Context>,
        utilization: PublicMutable<Utilization, Context>,
    }

    // Initialize Nocom Isolated Lending Pool
    #[external("public")]
    #[initializer]
    fn constructor(
        admin_address: AztecAddress,
        price_oracle_address: AztecAddress,
        treasury_address: AztecAddress,
        collateral_token_address: AztecAddress,
        loaned_token_address: AztecAddress,
        max_ltv: u128,
        liquidation_threshold: u128,
    ) {
        let config = Config {
            admin_address,
            price_oracle_address,
            treasury_address,
            collateral_token_address,
            loaned_token_address,
            max_ltv,
            liquidation_threshold,
        };
        storage.config.initialize(config);
    }

    /// LENDING FUNCTIONS ///

    /**
     * Supply collateral tokens to the pool to enable borrowing
     *
     * @param from - the tx entrypoint address which will supply tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to supply
     * @param authwit_nonce - the authwit nonce authorizing `transfer_private_to_public` 
     */
    #[external("private")]
    fn collateralize_private(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        // 1. get the config and caller
        let config = storage.config.read();
        let depositor = context.msg_sender().unwrap();

        // 2. update or insert a collateral receipt
        storage.collateral.at(depositor).initialize_or_replace(|existing_receipt| {
            // if note currently exists, calclulate existing amount with interest
            let collateral_amount = if existing_receipt.is_some() {
                existing_receipt.unwrap().amount + amount
            } else {
                amount
            };
            CollateralNote::new(depositor, collateral_amount)
        }).emit(depositor, MessageDelivery.CONSTRAINED_ONCHAIN);

        // 3. pull in tokens to collateralize
        Token::at(config.collateral_token_address)
            .transfer_private_to_public(from, context.this_address(), amount, authwit_nonce)
            .call(&mut context);
    }

    /**
     * Supply loan tokens to the pool to earn interest from borrowers
     *
     * @param from - the tx entrypoint address which will supply tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to supply
     * @param authwit_nonce - the authwit nonce authorizing `transfer_private_to_public` 
     */
    #[external("private")]
    fn supply_private(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        // 1. get the config
        let config = storage.config.read();
        let supplier = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // 2. update or insert a loan deposit receipt
        _update_loan(
            &mut context,
            storage.loan.at(supplier),
            supplier,
            amount, // add amount
            0, // sub amount
            constants::LEND_INTEREST,
        );

        // 3. pull in tokens to lend
        Token::at(config.loaned_token_address)
            .transfer_private_to_public(from, context.this_address(), amount, authwit_nonce)
            .call(&mut context);
        
        // 4. update utilization
        NocomLendingPoolV1::at(self_address)._supply_public(amount).enqueue(&mut context);
    }

    /**
     * Borrow loan tokens against supplied collateral
     *
     * @param from - the tx entrypoint address which will receive borrowed tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to borrow
     * @param partial_commitment - the partial commitment to transfer borrowed tokens to
     * @param asserted_collateral_token_price - the price of the collateral token as asserted by the caller
     * @param asserted_loaned_token_price - the price of the loaned token as asserted by the caller
     */
    #[external("private")]
    fn borrow_private(
        from: AztecAddress,
        amount: u128,
        partial_commitment: Field,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
    ) {
        // 1. get the config and caller
        let config = storage.config.read();
        let borrower = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // 2. get the amount of collateral deposited
        let emission = storage.collateral.at(borrower).get_note();
        emission.emit(borrower, MessageDelivery.CONSTRAINED_ONCHAIN); //reemit
        let collateral_amount = emission.content.note.amount;

        // 3. get the next epoch
        let next_epoch = time::get_next_epoch(&mut context, constants::EPOCH_LENGTH);

        // 4. calculate interest on existing borrow receipt if any and update the loan note
        let borrow_note_emission = storage.borrow.at(borrower).initialize_or_replace(|existing_borrow| {
            let mut total_borrowed = amount;
            if existing_borrow.is_some() {
                let existing_borrow_note = existing_borrow.unwrap_unchecked();
                let existing_borrow_principal = existing_borrow_note.amount;
                let existing_borrow_epoch = existing_borrow_note.epoch;
                let interest = math::calculate_interest(
                    existing_borrow_principal,
                    existing_borrow_epoch,
                    next_epoch,
                    constants::EPOCH_LENGTH,
                    constants::BORROW_INTEREST,
                );
                total_borrowed += existing_borrow_principal + interest
            };
            LoanNote::new(borrower, total_borrowed, next_epoch)
        });
        let borrowed_amount = borrow_note_emission.content.note.amount;
        borrow_note_emission.emit(borrower, MessageDelivery.CONSTRAINED_ONCHAIN);

        // 5. check the LTV is not exceeded
        let ltv_health = math::calculate_ltv_health(
            asserted_loaned_token_price,
            borrowed_amount,
            asserted_collateral_token_price,
            collateral_amount,
            config.max_ltv,
        );
        assert(
            ltv_health >= constants::LTV_THRESHOLD,
            "LTV exceeded, cannot borrow"
        );

        // 6. transfer borrowed tokens to borrower
        Token::at(config.loaned_token_address)
            .transfer_public_to_commitment(self_address, partial_commitment, amount, 0)
            .enqueue(&mut context);

        // 7. update utilization and check prices
        NocomLendingPoolV1::at(self_address)
            ._borrow_public(
                amount,
                asserted_collateral_token_price,
                asserted_loaned_token_price,
            )
            .enqueue(&mut context);
    }

    // #[external("private")]
    // fn withdraw_collateral_private(
    //     to: AztecAddress,
    //     amount: u128,
    //     partial_commitment: Field,
    //     asserted_collateral_token_price: u128,
    //     asserted_loaned_token_price: u128,
    // ) {
    //     // 1. get the config and caller
    //     let config = storage.config.read();
    //     let withdrawer = context.msg_sender().unwrap();
    //     let self_address = context.this_address();

    //     // 2. get the next epoch
    //     let next_epoch = time::get_next_epoch(&mut context, constants::EPOCH_LENGTH);

    //     // 3. get the current borrow amount with interest if any
    //     let borrow_emission = storage.borrow.at(withdrawer).get_note();
    //     borrow_emission.emit(withdrawer, MessageDelivery.CONSTRAINED_ONCHAIN); //reemit
    //     let borrow_note = borrow_emission.content.note;
    //     let existing_borrow_principal = borrow_note.amount;
    //     let existing_borrow_epoch = borrow_note.epoch;
    //     let interest = math::calculate_interest(
    //         existing_borrow_principal,
    //         existing_borrow_epoch,
    //         next_epoch,
    //         constants::EPOCH_LENGTH,
    //         constants::BORROW_INTEREST,
    //     );
    //     let total_borrowed = existing_borrow_principal + interest;

    //     // 5. calculate new collateral amount after withdrawal
    //     let new_collateral_amount = collateral_amount - amount;

    //     // 6. check the LTV is not exceeded after withdrawal
    //     let ltv_health = math::calculate_ltv_health(
    //         asserted_loaned_token_price,
    //         total_borrowed,
    //         asserted_collateral_token_price,
    //         new_collateral_amount,
    //         config.max_ltv,
    //     );
    //     assert(
    //         ltv_health >= constants::LTV_THRESHOLD,
    //         "LTV exceeded, cannot withdraw collateral"
    //     );

    //     // 7. update the collateral receipt
    //     storage.collateral.at(withdrawer).replace(|_existing_receipt| {
    //         CollateralNote::new(withdrawer, new_collateral_amount)
    //     }).emit(withdrawer, MessageDelivery.CONSTRAINED_ONCHAIN);

    //     // 8. transfer collateral tokens to withdrawer
    //     Token::at(config.collateral_token_address)
    //         .transfer_public_to_commitment(self_address, partial_commitment, amount, 0)
    //         .enqueue(&mut context);
    // }

    /**
     * Withdraw supplied loan tokens from the pool
     * @TODO: add amount = 0 to withdraw all tokens
     *
     * @param to - the tx entrypoint address which will receive withdrawn tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to withdraw
     * @param partial_commitment - the partial commitment to transfer withdrawn tokens to
     */
    #[external("private")]
    fn withdraw_loan_private(
        amount: u128,
        partial_commitment: Field
    ) {
        // 1. get the config and caller
        let config = storage.config.read();
        let lender = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // 2. update loan note
        _update_loan(
            &mut context,
            storage.loan.at(lender),
            lender,
            0, // add amount
            amount, // sub amount
            constants::LEND_INTEREST,
        );

        // 3. transfer tokens to lender
        Token::at(config.loaned_token_address)
            .transfer_public_to_commitment(self_address, partial_commitment, amount, 0)
            .enqueue(&mut context);
        
        // 4. update utilization
        NocomLendingPoolV1::at(self_address)._withdraw_public(amount).enqueue(&mut context);
    }

    // fn repay_loan_private(

    // )

    /// PUBLIC CLEANUP HOOKS ///

    /**
     * Update total supplied in utilization
     *
     * @param amount_supplied - the amount of tokens supplied
     */
    #[external("public")]
    #[internal]
    fn _supply_public(amount_supplied: u128) {
        let mut utilization = storage.utilization.read();
        utilization.total_supplied += amount_supplied;
        storage.utilization.write(utilization);
    }

    #[external("public")]
    #[internal]
    fn _withdraw_public(amount_withdrawn: u128) {
        let mut utilization = storage.utilization.read();
        utilization.total_borrowed -= amount_withdrawn;
        storage.utilization.write(utilization);
    }

    /**
     * Update total borrowed in utilization
     *
     * @param amount_borrowed - the amount of tokens borrowed
     * @param asserted_collateral_token_price - the price of the collateral token as asserted in private
     * @param asserted_loaned_token_price - the price of the loaned token as asserted in private
     */
    #[external("public")]
    #[internal]
    fn _borrow_public(
        amount_borrowed: u128,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
    ) {
        // 1. update utilization
        let mut utilization = storage.utilization.read();
        utilization.total_borrowed += amount_borrowed;
        storage.utilization.write(utilization);

        // 2. check prices
        let config = storage.config.read();
        let assets = BoundedVec::from_array([
            config.collateral_token_address,
            config.loaned_token_address,
        ]);
        let prices = MockPriceFeed::at(config.price_oracle_address)
            .get_prices(assets)
            .view(&mut context);
        assert(prices.len() == 2, "Price feed returned incorrect number of prices");
        
        // 3. check collateral price is higher or equal to asserted
        //    if price is higher, borrower got a worse deal but pool is safe
        let collateral_price = prices.get_unchecked(0);
        assert(
            collateral_price > asserted_collateral_token_price,
            "Collateral price lower than asserted",
        );
        // 4. check loaned price is lower or equal to asserted
        //    if price is lower, borrower got a worse deal but pool is safe
        let loaned_price = prices.get_unchecked(1);
        assert(
            loaned_price < asserted_loaned_token_price,
            "Loaned price higher than asserted",
        );
    }

    // fn _repay_public() {

    // }
}
