use aztec::macros::aztec;

#[aztec]
pub contract NocomStablePoolV1 {
    use aztec::{
        macros::{functions::{external, initializer, internal}, storage::storage},
        messages::message_delivery::MessageDelivery,
        oracle::debug_log::debug_log_format,
        protocol_types::{address::AztecAddress, traits::ToField},
        state_vars::{Map, PrivateMutable, PublicImmutable, PublicMutable},
    };
    use nocom_pool_common::{
        constants,
        contract_methods::{_get_loan_value, _update_loan},
        math,
        time,
        types::{collateral_note::CollateralNote, config::Config, loan_note::LoanNote},
    };

    use mock_price_feed::MockPriceFeed;
    use token_contract::Token;

    use poseidon::poseidon2::Poseidon2;

    pub global STABLE_PRICE: u128 = constants::PRICE_BASE; // 1 USD

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        collateral: Map<AztecAddress, PrivateMutable<CollateralNote, Context>, Context>,
        debt: Map<AztecAddress, PrivateMutable<LoanNote, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor() {}

    /**
     * Initialize a Nocom Isolated Lending Pool
     * notice: use separate initialize so token knows about pool address
     * todo: get deploy method to determine address and just use constructor
     *
     * @param admin_address - address of admin who can control contract
     * @param liquidator_pubkey_x - x coordinate of liquidator schnorr pubkey
     * @param liquidator_pubkey_y - y coordinate of liquidator schnorr pubkey
     * @param price_oracle_address - address of the price oracle contract
     * @param treasury_address - address of the treasury where protocol fees accrue
     * @param collateral_token_address - address of the token supplied as collateral for borrowing
     * @param stable_token_address - address of the stable coin minted against collateral
     * @param max_ltv - max loan-to-value allowed
     * @param liquidation_threshold - threshold at which positions can be liquidated
     */
    #[external("public")]
    fn initialize(
        admin_address: AztecAddress,
        liquidator_pubkey_x: Field,
        liquidator_pubkey_y: Field,
        price_oracle_address: AztecAddress,
        treasury_address: AztecAddress,
        collateral_token_address: AztecAddress,
        stable_token_address: AztecAddress,
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
            loaned_token_address: stable_token_address,
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
        storage.collateral.at(caller).initialize(CollateralNote::new(caller, 0)).emit(
            caller,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
        storage.debt.at(caller).initialize(LoanNote::new(caller, 0, 0)).emit(
            caller,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    /// PRIVATE STABLE LENDING FUNCTIONS ///

    /**
     * Supply collateral tokens to the pool to enable stable minting
     *
     * @param from - the tx entrypoint address which will supply tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to supply
     * @param authwit_nonce - the authwit nonce authorizing `transfer_private_to_public` 
     */
    #[external("private")]
    fn collateralize_private(from: AztecAddress, amount: u128) {
        // 1. get the config and caller
        let config = storage.config.read();
        let depositor = context.msg_sender().unwrap();

        // 2. update or insert a collateral receipt
        storage
            .collateral
            .at(depositor)
            .initialize_or_replace(|existing_receipt| {
                // if note currently exists, calclulate existing amount with interest
                let collateral_amount = if existing_receipt.is_some() {
                    existing_receipt.unwrap().amount + amount
                } else {
                    amount
                };
                CollateralNote::new(depositor, collateral_amount)
            })
            .emit(depositor, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    /**
     * Borrow loan tokens against supplied collateral
     *
     * @param from - the tx entrypoint address which will receive borrowed tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to borrow
     * @param asserted_collateral_token_price - the price of the collateral token as asserted by the caller
     */
    #[external("private")]
    fn mint_private(recipient: AztecAddress, amount: u128, asserted_collateral_token_price: u128) {
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
        let borrow_note_emission = storage
            .debt
            .at(borrower)
            .initialize_or_replace(|existing_borrow| {
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
            STABLE_PRICE,
            borrowed_amount,
            asserted_collateral_token_price,
            collateral_amount,
            config.max_ltv,
        );

        assert(ltv_health >= constants::LTV_THRESHOLD, "LTV exceeded, cannot borrow");

        // 6. check price
        NocomStablePoolV1::at(self_address)
            ._check_collateral_price(asserted_collateral_token_price)
            .enqueue(&mut context);

        // 7. mint the tokens to the borrower
        let stable_token_address = config.loaned_token_address;
        Token::at(stable_token_address).mint_to_private(recipient, amount).call(&mut context);
    }

    /**
     * Withdraw supplied collateral from the pool
     * @notice - collateral is not actually stored in the pool, this is just the accounting
     *           for privately escrowed collateral
     *
     * @param amount - the amount of tokens to withdraw
     * @param asserted_collateral_token_price - the price of the collateral token as asserted in
     */
    #[external("private")]
    fn withdraw_collateral_private(amount: u128, asserted_collateral_token_price: u128) {
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
                STABLE_PRICE,
                amount_borrowed,
                asserted_collateral_token_price,
                new_collateral_amount,
                config.max_ltv,
            );
            assert(
                ltv_health >= constants::LTV_THRESHOLD,
                "LTV exceeded, cannot withdraw collateral",
            );
            CollateralNote::new(withdrawer, new_collateral_amount)
        });
        collateral_emission.emit(withdrawer, MessageDelivery.CONSTRAINED_ONCHAIN);

        // 6. check prices
        NocomStablePoolV1::at(self_address)
            ._check_collateral_price(asserted_collateral_token_price)
            .enqueue(&mut context);
    }

    /**
     * Repay a loan by burning the stable tokens to claim collateral
     *
     * @param from - the tx entrypoint address which will burn tokens (not the escrow calling this funciton)
     * @param amount - the amount of tokens to burn
     * @param authwit_nonce - the authwit nonce authorizing `burn_private` 
     */
    #[external("private")]
    fn repay_by_burn_private(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        // 1. get the config and caller
        let config = storage.config.read();
        let repayer = context.msg_sender().unwrap();
        let self_address = context.this_address();
        let stable_token_address = config.loaned_token_address;

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
        Token::at(stable_token_address).burn_private(from, amount, authwit_nonce).call(&mut context);
    }

    /**
     * Liquidate an undercollateralized position by burning stable tokens to seize collateral
     * @notice - collateral seizure occurs in the escrow contract
     *
     * @param amount_to_repay - the amount of stable tokens to burn on behalf of the borrower
     * @param liquidator_address - the address of the liquidator paying the loan back
     * @param liquidation_authwit_nonce - the authwit nonce authorizing `burn_private`
     * @param asserted_collateral_token_price - the price of the collateral token as asserted by the caller
     * @return (liquidator_collateral_amount, protocol_fee, treasury_address)
     */
    #[external("private")]
    fn liquidate_private(
        amount_to_repay: u128,
        liquidator_address: AztecAddress,
        liquidation_authwit_nonce: Field,
        asserted_collateral_token_price: u128,
    ) -> (u128, u128, AztecAddress) {
        // 1. get the config and caller
        let config = storage.config.read();
        let liquidator = context.msg_sender().unwrap();
        let self_address = context.this_address();
        let stable_token_address = config.loaned_token_address;

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
            STABLE_PRICE,
            total_borrowed,
            asserted_collateral_token_price,
            collateral_amount,
            config.liquidation_threshold,
        );
        assert(ltv_health < constants::LTV_THRESHOLD, "Position healthy, cannot liquidate");

        // 7. check that amount to repay is <= 50% of total borrowed
        assert(
            amount_to_repay * 2 <= total_borrowed,
            "Cannot repay more than 50% of total borrowed in liquidation",
        );

        // 8. calculate the amount of collateral to seize to match loan repayment
        let (total_collateral_seized, liquidator_collateral_amount, protocol_fee) = math::calculate_liquidation(
            amount_to_repay,
            STABLE_PRICE,
            asserted_collateral_token_price,
        );

        // 9. update borrow note
        let remaining_loan_amount = total_borrowed - amount_to_repay;
        let current_epoch = next_epoch - 1;
        storage
            .debt
            .at(liquidator)
            .replace(|existing_loan| {
                LoanNote::new(liquidator, remaining_loan_amount, current_epoch)
            })
            .emit(liquidator, MessageDelivery.CONSTRAINED_ONCHAIN);

        // 10. update collateral note
        let remaining_collateral_amount = collateral_amount - total_collateral_seized;
        storage
            .collateral
            .at(liquidator)
            .replace(|existing_collateral| {
                CollateralNote::new(liquidator, remaining_collateral_amount)
            })
            .emit(liquidator, MessageDelivery.CONSTRAINED_ONCHAIN);

        // 11. transfer the loan token repayment into the pool
        Token::at(config.loaned_token_address)
            .burn_private(liquidator_address, amount_to_repay, liquidation_authwit_nonce)
            .call(&mut context);

        // 12. update utilization, transfer seized collateral to liquidator and protocol fee to treasury
        NocomStablePoolV1::at(self_address)
            ._check_collateral_price(asserted_collateral_token_price)
            .enqueue(&mut context);

        // 13. return amounts to escrow for private transfer
        (liquidator_collateral_amount, protocol_fee, config.treasury_address)
    }

    /// PUBLIC INTERNAL ///

    /**
     * Check that the public collateral price is at least the asserted price
     *
     * @param asserted_collateral_token_price - price used to privately calculate LTV or health factor
     */
    #[external("public")]
    fn _check_collateral_price(asserted: u128) {
        let config = storage.config.read();
        let price = MockPriceFeed::at(config.price_oracle_address)
            .get_price(config.collateral_token_address)
            .view(&mut context);
        assert(price >= asserted, "Collateral price lower than asserted");
    }

    /// UTILITY & VIEW FUNCTIONS ///

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
