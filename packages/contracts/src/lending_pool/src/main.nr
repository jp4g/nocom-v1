pub mod utils;
pub mod types;

use dep::aztec::macros::aztec;

#[aztec]
pub contract NocomLendingPoolV1 {
    use aztec::{
        oracle::debug_log::debug_log_format,
        macros::{functions::{external, initializer, internal}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::{address::AztecAddress, traits::ToField},
        state_vars::{Map, PrivateMutable, PublicImmutable, PublicMutable},
    };
    use crate::{
        utils::{
            constants, math, time,
            contract_methods::{_update_loan, _get_loan_value},
        },
        types::{
            config::Config, loan_note::LoanNote,
            utilization::Utilization, collateral_note::CollateralNote
        },
    };

    use mock_price_feed::MockPriceFeed;
    use token_contract::Token;

    use poseidon::poseidon2::Poseidon2;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        collateral: Map<AztecAddress, PrivateMutable<CollateralNote, Context>, Context>,
        loan: Map<AztecAddress, PrivateMutable<LoanNote, Context>, Context>,
        debt: Map<AztecAddress, PrivateMutable<LoanNote, Context>, Context>,
        utilization: PublicMutable<Utilization, Context>,
    }

    /**
     * Initialize a Nocom Isolated Lending Pool
     * NOTICE: admin will be used when we update config to be DelayedPublicMutable
     * @param admin_address - address of admin who can control contract
     * @param liquidator_pubkey_x - x coordinate of liquidator schnorr pubkey
     * @param liquidator_pubkey_y - y coordinate of liquidator schnorr pubkey
     * @param price_oracle_address - address of the price oracle contract
     * @param treasury_address - address of the treasury where protocol fees accrue
     * @param collateral_token_address - address of the token supplied as collateral for borrowing
     * @param loaned_token_address - address of the token lent out
     * @param max_ltv - max loan-to-value allowed
     * @param liquidation_threshold - threshold at which positions can be liquidated
     */
    #[external("public")]
    #[initializer]
    fn constructor(
        admin_address: AztecAddress,
        liquidator_pubkey_x: Field,
        liquidator_pubkey_y: Field,
        price_oracle_address: AztecAddress,
        treasury_address: AztecAddress,
        collateral_token_address: AztecAddress,
        loaned_token_address: AztecAddress,
        max_ltv: u128,
        liquidation_threshold: u128,
    ) {
        let config = Config {
            admin_address,
            liquidator_pubkey_x,
            liquidator_pubkey_y,
            price_oracle_address,
            treasury_address,
            collateral_token_address,
            loaned_token_address,
            max_ltv,
            liquidation_threshold,
        };
        storage.config.initialize(config);
    }

    /**
     * Constrains that the liquidator has access to the escrow to perform liquidations
     * also initializes loan, collateral, and deposit notes with 0 values so we can always assume it exists
     * @NOTICE this can be done by liquidator or user
     * @TODO: add nullifier check to each function to collateral/ borrow actions
     *
     * @param signature - schnorr signature by liquidator over (pool_address, escrow_address, admin_address)
     */
    #[external("private")]
    fn register(signature: [u8; 64]) {
        // 1. check the liquidator signature
        let config = storage.config.read();
        let caller = context.msg_sender().unwrap();
        let self_address = context.this_address();
        // todo: reenable signature check with sig hardcoded for txe
        // config.signed_by_liquidator(self_address, caller, signature);

        // 2. compute the registration nullifier and emit
        // todo: maybe add blinding factor (need to store it in escrow or something for guaranteed DA)
        //       but not important since escrow contract address is already secret
        let preimage = [self_address.to_field(), caller.to_field()];
        let registration_nullifier = Poseidon2::hash(preimage, 2);
        context.push_nullifier(registration_nullifier);

        // 3. intitialize empty notes for loan and collateral
        storage.collateral.at(caller).initialize(CollateralNote::new(caller, 0))
            .emit(caller, MessageDelivery.CONSTRAINED_ONCHAIN);
        storage.debt.at(caller).initialize(LoanNote::new(caller, 0, 0))
            .emit(caller, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    /// PRIVATE LENDING FUNCTIONS ///

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
     * @param from - the loan supplier (not an escrow)
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
            false, // not a borrow
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
     * @param partial_note - the partial commitment to transfer borrowed tokens to
     * @param asserted_collateral_token_price - the price of the collateral token as asserted by the caller
     * @param asserted_loaned_token_price - the price of the loaned token as asserted by the caller
     */
    #[external("private")]
    fn borrow_private(
        recipient: AztecAddress, // todo: remove once partial note working
        amount: u128,
        partial_note: Field,
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
        let borrow_note_emission = storage.debt.at(borrower).initialize_or_replace(|existing_borrow| {
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
            let current_epoch = next_epoch - 1;
            LoanNote::new(borrower, total_borrowed, current_epoch)
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
        
        // 6. update utilization, check prices, and transfer borrowed tokens
        NocomLendingPoolV1::at(self_address)
            ._borrow_public(
                amount,
                asserted_collateral_token_price,
                asserted_loaned_token_price,
                partial_note,
            )
            .enqueue(&mut context);
        
        // 7. hack: transfer borrowed tokens directly
        Token::at(config.loaned_token_address)
            .transfer_public_to_private(self_address, recipient, amount, 0)
            .call(&mut context);
    }

    /**
     * Withdraw supplied collateral from the pool
     *
     * @param amount - the amount of tokens to withdraw
     * @param partial_note - the partial commitment to transfer withdrawn tokens to
     * @param asserted_collateral_token_price - the price of the collateral token as asserted in
     * @param asserted_loaned_token_price - the price of the loaned token as asserted in
     */
    #[external("private")]
    fn withdraw_collateral_private(
        amount: u128,
        recipient: AztecAddress, // todo: remove once partial note working
        partial_note: Field,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
    ) {
        // 1. get the config and caller
        let config = storage.config.read();
        let withdrawer = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // 2. get the next epoch
        let next_epoch = time::get_next_epoch(&mut context, constants::EPOCH_LENGTH);

        // 3. get the current borrow amount principal
        let borrow_emission = storage.debt.at(withdrawer).get_note();
        borrow_emission.emit(withdrawer, MessageDelivery.CONSTRAINED_ONCHAIN); //reemit
        let borrow_principal = borrow_emission.content.note.amount;

        // 4. calculate total liability with interest
        let borrow_epoch = borrow_emission.content.note.epoch;
        let borrow_interest = math::calculate_interest(
            borrow_principal,
            borrow_epoch,
            next_epoch,
            constants::EPOCH_LENGTH,
            constants::BORROW_INTEREST,
        ); // NOTE: will just be 0 if principal is 0
        let amount_borrowed = borrow_principal + borrow_interest;

        // 5. update the amount of collateral supplied while checking the LTV health
        let collateral_emission = storage.collateral.at(withdrawer).replace(|existing_receipt| {
            let new_collateral_amount = existing_receipt.amount - amount;
            let ltv_health = math::calculate_ltv_health(
                asserted_loaned_token_price,
                amount_borrowed,
                asserted_collateral_token_price,
                new_collateral_amount,
                config.max_ltv,
            );
            assert(
                ltv_health >= constants::LTV_THRESHOLD,
                "LTV exceeded, cannot withdraw collateral"
            );
            CollateralNote::new(withdrawer, new_collateral_amount)
        });
        
        // 6. transfer collateral tokens to withdrawer and check prices
        NocomLendingPoolV1::at(self_address)
            ._withdraw_collateral_public(
                asserted_collateral_token_price,
                asserted_loaned_token_price,
                amount,
                partial_note,
            )
            .enqueue(&mut context);

        // 7. hack: transfer withdrawn tokens directly
        Token::at(config.collateral_token_address)
            .transfer_public_to_private(self_address, recipient, amount, 0)
            .call(&mut context);
    }

    /**
     * Withdraw supplied loan tokens from the pool
     * @TODO: add amount = 0 to withdraw all tokens
     *
     * @param to - the tx entrypoint address which will receive withdrawn tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to withdraw
     * @param partial_note - the partial commitment to transfer withdrawn tokens to
     */
    #[external("private")]
    fn withdraw_loan_private(
        amount: u128,
        recipient: AztecAddress, // todo: remove once partial note working
        partial_note: Field
    ) {
        // 1. get the config and caller
        let config = storage.config.read();
        let lender = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // 2. determine the loan note principal and interest
        let (principal, interest) = _get_loan_value(
            &mut context,
            storage.loan.at(lender),
            constants::LEND_INTEREST
        );

        // 3. determine the ratio being withdrawn to find protocol fee on interest
        let withdraw_ratio = math::calculate_withdraw_ratio(
            principal + interest,
            amount,
        );

        // 4. calculate protocol fee on interest
        let interest_protocol_fee = (interest * withdraw_ratio) / constants::LTV_BASE;

        // 5. determine amount to send to lender after fee
        let amount_to_lender = amount - interest_protocol_fee;

        // 6. update the loan note
        // NOTE: cannot get interest from inside this lambda so we have to read the note in step 2,
        //       re-emit it, then read again during replace. TODO: optimize this if possible
        storage.loan.at(lender).replace(|existing_loan| {
            // constrains amount <= total assets claimable
            let new_principal = existing_loan.amount - amount; 
            LoanNote::new(lender, new_principal, existing_loan.epoch)
        }).emit(lender, MessageDelivery.CONSTRAINED_ONCHAIN);

        // 7. update utilization and take protocol fee
        NocomLendingPoolV1::at(self_address)
            ._withdraw_public(amount, interest_protocol_fee, partial_note)
            .enqueue(&mut context);
        
        // 8. hack: transfer withdrawn tokens directly
        Token::at(config.loaned_token_address)
            .transfer_public_to_private(self_address, recipient, amount_to_lender, 0)
    }

    /**
     * Repay borrowed loan tokens to the pool
     *
     * @param from - the tx entrypoint address which will repay tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to repay
     * @param authwit_nonce - the authwit nonce authorizing `transfer_private_to_public` 
     */
    #[external("private")]
    fn repay_loan_private(
        from: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
    ) {
        // 1. get the config and caller
        let config = storage.config.read();
        let repayer = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // 2. update borrow note
        // NOTICE: will constrain amount <= total owed in _update_loan
        _update_loan(
            &mut context,
            storage.debt.at(repayer),
            repayer,
            0, // add amount
            amount, // sub amount
            constants::BORROW_INTEREST,
            true, // is a borrow
        );

        // 3. pull in tokens to repay
        Token::at(config.loaned_token_address)
            .transfer_private_to_public(from, context.this_address(), amount, authwit_nonce)
            .call(&mut context);
        
        // 4. update utilization
        NocomLendingPoolV1::at(self_address)._repay_public(amount).enqueue(&mut context);
    }

    #[external("private")]
    fn liquidate_private(
        amount_to_repay: u128,
        liquidator_address: AztecAddress,
        liquidation_authwit_nonce: Field,
        liquidator_partial_note: Field,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
    ) {
        // 1. get the config and caller
        let config = storage.config.read();
        let liquidator = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // 2. get the next epoch
        let next_epoch = time::get_next_epoch(&mut context, constants::EPOCH_LENGTH);

        // 3. get the current borrow amount principal
        let borrow_emission = storage.debt.at(liquidator).get_note();
        borrow_emission.emit(liquidator, MessageDelivery.CONSTRAINED_ONCHAIN); //reemit
        let borrow_principal = borrow_emission.content.note.amount;

        // 4. calculate total liability with interest
        let borrow_epoch = borrow_emission.content.note.epoch;
        let borrow_interest = math::calculate_interest(
            borrow_principal,
            borrow_epoch,
            next_epoch,
            constants::EPOCH_LENGTH,
            constants::BORROW_INTEREST,
        ); // NOTE: will just be 0 if principal is 0
        let total_borrowed = borrow_principal + borrow_interest;

        // 5. determine the amount of collateral deposited
        let collateral_emission = storage.collateral.at(liquidator).get_note();
        collateral_emission.emit(liquidator, MessageDelivery.CONSTRAINED_ONCHAIN); //reemit
        let collateral_amount = collateral_emission.content.note.amount;

        // 6. check that position is under liquidation threshold
        let ltv_health = math::calculate_ltv_health(
            asserted_loaned_token_price,
            total_borrowed,
            asserted_collateral_token_price,
            collateral_amount,
            config.liquidation_threshold,
        );
        assert(
            ltv_health < constants::LTV_THRESHOLD,
            "Position healthy, cannot liquidate"
        );

        // 7. check that amount to repay is <= 50% of total borrowed
        assert(
            amount_to_repay * 2 <= total_borrowed,
            "Cannot repay more than 50% of total borrowed in liquidation"
        );

        // 8. calculate the amount of collateral to seize to match loan repayment
        let (total_collateral_seized, liquidator_collateral_amount, protocol_fee) =
            math::calculate_liquidation(
                amount_to_repay,
                asserted_loaned_token_price,
                asserted_collateral_token_price,
            );
        debug_log_format("Collateral Seized: {0}, Liquidator Collateral: {1}, Protocol Fee: {2}, initial collateral: {3}", [
            total_collateral_seized as Field,
            liquidator_collateral_amount as Field,
            protocol_fee as Field,
            collateral_amount as Field,
        ]);


        // 9. update borrow note
        let remaining_loan_amount = total_borrowed - amount_to_repay;
        let current_epoch = next_epoch - 1;
        storage.debt.at(liquidator).replace(|existing_loan| {
            LoanNote::new(liquidator, remaining_loan_amount, current_epoch)
        }).emit(liquidator, MessageDelivery.CONSTRAINED_ONCHAIN);
        debug_log_format("Remaining Loan Amount: {0}", [
            remaining_loan_amount as Field,
        ]);

        // 10. update collateral note
        let remaining_collateral_amount = collateral_amount - total_collateral_seized;
        storage.collateral.at(liquidator).replace(|existing_collateral| {
            CollateralNote::new(liquidator, remaining_collateral_amount)
        }).emit(liquidator, MessageDelivery.CONSTRAINED_ONCHAIN);
        debug_log_format("Remaining Collateral Amount: {0}", [
            remaining_collateral_amount as Field,
        ]);

        // 11. pull in tokens to repay
        // NOTE: this could be public but we leave it private so liquidator can prepare for liquidation
        //       without leaking that they are acquiring the funds to do so
        Token::at(config.loaned_token_address)
            .transfer_private_to_public(
                liquidator_address,
                context.this_address(),
                amount_to_repay,
                liquidation_authwit_nonce
            ).call(&mut context);
        
        // 12. update utilization, transfer seized collateral to liquidator and protocol fee to treasury
        NocomLendingPoolV1::at(self_address)
            ._liquidate_public(
                liquidator_collateral_amount,
                protocol_fee,
                liquidator_partial_note,
                asserted_loaned_token_price,
                asserted_collateral_token_price,
            ).enqueue(&mut context);

        // 13. hack: transfer seized collateral directly
        Token::at(config.collateral_token_address)
            .transfer_public_to_private(
                self_address,
                liquidator_address,
                liquidator_collateral_amount,
                0
            )
            .call(&mut context);
    }

    /// PUBLIC INTERNAL ///

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

    /**
     * Publicly reduce total supplied and take protocol fee on interest
     *
     * @param amount_withdrawn - the amount of tokens withdrawn
     * @param interest_protocol_fee - the amount of interest taken as protocol fee
     */
    #[external("public")]
    #[internal]
    fn _withdraw_public(amount_withdrawn: u128, interest_protocol_fee: u128, partial_note: Field) {
        // 1. reduce total supplied
        let mut utilization = storage.utilization.read();
        utilization.total_borrowed -= amount_withdrawn;
        storage.utilization.write(utilization);

        // 2. transfer protocol fee to treasury
        let config = storage.config.read();
        if interest_protocol_fee > 0 {
            Token::at(config.loaned_token_address)
                .transfer_public_to_public(
                    context.this_address(),
                    config.treasury_address,
                    interest_protocol_fee,
                    0
                )
                .call(&mut context);
        }

        // 3. transfer withdrawn tokens to withdrawer partial note
        // let self_address = context.this_address();
        // Token::at(config.loaned_token_address)
        //     .transfer_public_to_commitment(self_address, partial_note, amount_withdrawn, 0)
        //     .call(&mut context);
    }

    /**
     * Update total borrowed in utilization
     *
     * @param amount_borrowed - the amount of tokens borrowed
     * @param asserted_collateral_token_price - the price of the collateral token as asserted in private
     * @param asserted_loaned_token_price - the price of the loaned token as asserted in private
     * @param partial_note - the partial commitment to transfer borrowed tokens to (shielded)
     */
    #[external("public")]
    #[internal]
    fn _borrow_public(
        amount_borrowed: u128,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
        partial_note: Field
    ) {
        // 1. update utilization
        let mut utilization = storage.utilization.read();
        utilization.total_borrowed += amount_borrowed;
        storage.utilization.write(utilization);

        // 2. check prices
        // FOR SOME REASON CANNOT MAKE THIS A CONTRACT LIBRARY METHODS
        // 2a. check prices from oracle
        let config = storage.config.read();
        let assets = BoundedVec::from_array([
            config.collateral_token_address,
            config.loaned_token_address,
        ]);
        let prices = MockPriceFeed::at(config.price_oracle_address)
            .get_prices(assets)
            .view(&mut context);
        // this check might be unncessary
        assert(prices.len() == 2, "Price feed returned incorrect number of prices");
        // 2b. check collateral price is higher or equal to asserted
        //    if price is higher, borrower got a worse deal but pool is safe
        let collateral_price = prices.get_unchecked(0);
        assert(
            collateral_price >= asserted_collateral_token_price,
            "Collateral price lower than asserted",
        );
        // 2c. check loaned price is lower or equal to asserted
        //    if price is lower, borrower got a worse deal but pool is safe
        let loaned_price = prices.get_unchecked(1);
        assert(
            loaned_price <= asserted_loaned_token_price,
            "Loaned price higher than asserted",
        );

        // TODO: FIX
        // // 3. transfer borrowed tokens to borrower partial note
        // let self_address = context.this_address();
        // Token::at(config.loaned_token_address)
        //     .transfer_public_to_commitment(self_address, partial_note, amount_borrowed, 0)
        //     .call(&mut context);
    }

    /**
     * Publicly reduce total borrowed
     *
     * @param amount_repaid - the amount of tokens repaid
     */
    #[external("public")]
    #[internal]
    fn _repay_public(amount_repaid: u128) {
        let mut utilization = storage.utilization.read();
        utilization.total_borrowed -= amount_repaid;
        storage.utilization.write(utilization);
    }

    /**
     * Withdraw supplied collateral from the pool
     *
     * @param asserted_collateral_token_price - the price of the collateral token as asserted in
     * @param asserted_loaned_token_price - the price of the loaned token as asserted in
     * @param amount_withdrawn - the amount of tokens to withdraw
     * @param partial_note - the partial commitment to transfer withdrawn tokens to (shielded)
     */
    #[external("public")]
    #[internal]
    fn _withdraw_collateral_public(
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
        amount_withdrawn: u128,
        partial_note: Field
    ) {
        // 1. check prices
        // FOR SOME REASON CANNOT MAKE THIS A CONTRACT LIBRARY METHODS
        // 1a. check prices from oracle
        let config = storage.config.read();
        let assets = BoundedVec::from_array([
            config.collateral_token_address,
            config.loaned_token_address,
        ]);
        let prices = MockPriceFeed::at(config.price_oracle_address)
            .get_prices(assets)
            .view(&mut context);
        // this check might be unncessary
        assert(prices.len() == 2, "Price feed returned incorrect number of prices");
        // 1b. check collateral price is higher or equal to asserted
        //    if price is higher, borrower got a worse deal but pool is safe
        let collateral_price = prices.get_unchecked(0);
        assert(
            collateral_price >= asserted_collateral_token_price,
            "Collateral price lower than asserted",
        );
        // 1c. check loaned price is lower or equal to asserted
        //    if price is lower, borrower got a worse deal but pool is safe
        let loaned_price = prices.get_unchecked(1);
        assert(
            loaned_price <= asserted_loaned_token_price,
            "Loaned price higher than asserted",
        );

        // 2. transfer collateral tokens to partial note commitment
        // let self_address = context.this_address();
        // Token::at(config.collateral_token_address)
        //     .transfer_public_to_commitment(self_address, partial_note, amount_withdrawn, 0)
        //     .call(&mut context);
    }

    #[external("public")]
    #[internal]
    fn _liquidate_public(   
        liquidator_collateral_amount: u128,
        protocol_fee_amount: u128,
        liquidator_partial_note: Field,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128
    ) {
        // 1. check prices
        // FOR SOME REASON CANNOT MAKE THIS A CONTRACT LIBRARY METHODS
        // 1a. check prices from oracle
        let config = storage.config.read();
        let assets = BoundedVec::from_array([
            config.collateral_token_address,
            config.loaned_token_address,
        ]);
        let prices = MockPriceFeed::at(config.price_oracle_address)
            .get_prices(assets)
            .view(&mut context);
        // this check might be unncessary
        assert(prices.len() == 2, "Price feed returned incorrect number of prices");
        // 1b. check collateral price is higher or equal to asserted
        //    if price is higher, borrower got a worse deal but pool is safe
        let collateral_price = prices.get_unchecked(0);
        assert(
            collateral_price >= asserted_collateral_token_price,
            "Collateral price lower than asserted",
        );
        // 1c. check loaned price is lower or equal to asserted
        //    if price is lower, borrower got a worse deal but pool is safe
        let loaned_price = prices.get_unchecked(1);
        assert(
            loaned_price <= asserted_loaned_token_price,
            "Loaned price higher than asserted",
        );
        // 2. transfer seized collateral to liquidator
        let config = storage.config.read();
        let self_address = context.this_address();
        // Token::at(config.collateral_token_address)
        //     .transfer_public_to_commitment(
        //         self_address,
        //         liquidator_partial_note,
        //         liquidator_collateral_amount,
        //         0
        //     )
        //     .call(&mut context);
        // 3. transfer protocol fee to treasury
        Token::at(config.collateral_token_address)
            .transfer_public_to_public(
                self_address,
                config.treasury_address,
                protocol_fee_amount,
                0
            )
            .call(&mut context);
    }

    /// UTILITY & VIEW FUNCTIONS ///
    #[external("utility")]
    unconstrained fn get_utilization() -> Utilization {
        storage.utilization.read()
    }

    #[external("utility")]
    unconstrained fn get_loan(lender: AztecAddress) -> LoanNote {
        storage.loan.at(lender).view_note()
    }

    #[external("utility")]
    unconstrained fn get_collateral_and_debt(borrower: AztecAddress) -> (CollateralNote, LoanNote) {
        let collateral_note = storage.collateral.at(borrower).view_note();
        let debt_note = storage.debt.at(borrower).view_note();
        (collateral_note, debt_note)
    }

    /**
     * Calculate the health factor for LTV and liquidation threshold
     *
     * @param borrower - the address of the borrower
     * @param next_epoch - the next epoch number (MUST BE SUPPLIED EXTERNALLY IN UTILITY CONTEXT)
     * @param asserted_collateral_token_price - the price of the collateral token as asserted by
     * @param asserted_loaned_token_price - the price of the loaned token as asserted by
     * @return (ltv_health, liquidation_health)
     */
    #[external("utility")]
    unconstrained fn get_health_factor(
        borrower: AztecAddress,
        next_epoch: u64,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
    ) -> (u128, u128) {
        // 1. get the config
        let config = storage.config.read();

        // 2. get collateral and debt notes
        let collateral_note = storage.collateral.at(borrower).view_note();
        let debt_note = storage.debt.at(borrower).view_note();

        // 3. calculate the interest on the debt and find total liability
        let borrow_interest = math::calculate_interest(
            debt_note.amount,
            debt_note.epoch,
            next_epoch,
            constants::EPOCH_LENGTH,
            constants::BORROW_INTEREST,
        );
        let total_debt = debt_note.amount + borrow_interest;

        // TODO: can optimize by not repeating majority of calculation in calculate_ltv_health
        // 4. calculate the health factor for LTV
        let ltv_health = math::calculate_ltv_health(
            asserted_loaned_token_price,
            total_debt,
            asserted_collateral_token_price,
            collateral_note.amount,
            config.max_ltv,
        );

        // 5. calculate the health factor for liquidation threshold
        let liquidation_health = math::calculate_ltv_health(
            asserted_loaned_token_price,
            total_debt,
            asserted_collateral_token_price,
            collateral_note.amount,
            config.liquidation_threshold,
        );

        (ltv_health, liquidation_health)
    }

    #[external("utility")]
    unconstrained fn get_config() -> Config {
        storage.config.read()
    }
}
