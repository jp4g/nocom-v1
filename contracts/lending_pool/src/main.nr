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
            contract_methods::{_update_receipt},
            math,
            constants
        },
        types::{
            config::Config, receipt_note::ReceiptNote,
            utilization::Utilization
        },
    };

    use mock_price_feed::MockPriceFeed;
    use token_contract::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        collateral: Map<AztecAddress, PrivateMutable<ReceiptNote, Context>, Context>,
        loan: Map<AztecAddress, PrivateMutable<ReceiptNote, Context>, Context>,
        borrow: Map<AztecAddress, PrivateMutable<ReceiptNote, Context>, Context>,
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
        ltv: u128,
        liquidation_threshold: u128,
    ) {
        let config = Config {
            admin_address,
            price_oracle_address,
            treasury_address,
            collateral_token_address,
            loaned_token_address,
            ltv,
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
        // TODO: custom get_receipt with no interest calculation
        _update_receipt(
            &mut context,
            NocomLendingPoolV1::storage_layout().collateral.slot,
            storage.collateral.at(depositor),
            depositor,
            amount,
            0 // no interest is given for collateral
        );

        // 3. pull in tokens to collateralize
        Token::at(config.collateral_token_address)
            .transfer_private_to_public(from, context.this_address(), amount, authwit_nonce)
            .call(&mut context);
    }

    // /**
    //  * Withdraw supplied collateral
    //  * TODO: pay protocol fees from 10% of interest
    //  *
    //  * @param asset_address The address of the token collateral to withdraw
    //  * @param amount the amount of the collateral token to withdraw
    //  * @param partial_commitment - the partial commitment to transfer tokens to
    //  * @param
    //  */
    // #[external("private")]
    // fn withdraw_private(
    //     asset_address: AztecAddress,
    //     amount: u128,
    //     collateral_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     partial_commitment: Field,
    // ) {
    //     let depositor = context.msg_sender().unwrap();
    //     // 1. get the config
    //     let config = storage.config.read();

    //     // 2. combine deposit receipts to get principal + interest
    //     let (amount_supplied, interest, current_epoch) = _pop_existing_receipt(
    //         &mut context,
    //         asset_address,
    //         storage.deposit_receipts.at(depositor),
    //         LEND_INTEREST,
    //     );

    //     // 3. determine the amount of interest claimable by the protocol
    //     let lending_protocol_fee = (interest * LENDING_PROTOCOL_FEE) / math::WAD;
    //     let total_available = amount_supplied + interest - lending_protocol_fee;
    //     assert(total_available >= amount);

    //     // 3. create new deposit receipt for remaining amount (if any)
    //     let remaining_amount = total_available - amount;
    //     if remaining_amount > 0 {
    //         let receipt_note = ReceiptNote::new(
    //             depositor,
    //             asset_address,
    //             remaining_amount,
    //             current_epoch + 1,
    //         );
    //         storage.deposit_receipts.at(depositor).insert(receipt_note).emit(
    //             depositor,
    //             MessageDelivery.CONSTRAINED_ONCHAIN,
    //         );
    //     }

    //     // 4. Compute the health factor after withdrawal and return the assets involved
    //     // NOTE: this will automatically order assets by ascending address when returned
    //     // if the asserted prices are not ordered correctly, the public price check will catch it
    //     let (health_factor, collateral_assets, debt_assets) = _calculate_health_factor(
    //         &mut context,
    //         storage.deposit_receipts.at(depositor),
    //         storage.loan_receipts.at(depositor),
    //         storage.ltvs,
    //         collateral_prices,
    //         debt_asserted_prices,
    //     );

    //     // 5. Check the health factor
    //     assert(health_factor >= HEALTH_FACTOR_THRESHOLD, "Undercollateralized BOZO, L + LTV RATIO");

    //     // 6. transfer tokens out to depositor
    //     Token::at(asset_address)
    //         .transfer_public_to_commitment(context.this_address(), partial_commitment, amount, 0)
    //         .enqueue(&mut context);

    //     // 7. update utilization and check asserted prices
    //     NocomLendingPoolV1::at(context.this_address())
    //         ._post_withdrawal(
    //             asset_address,
    //             amount,
    //             lending_protocol_fee,
    //             collateral_assets,
    //             collateral_prices,
    //             debt_assets,
    //             debt_asserted_prices,
    //         )
    //         .enqueue(&mut context);
    // }

    // /// BORROWING FUNCTIONS ///
    // #[external("private")]
    // fn borrow_private(
    //     asset_address: AztecAddress,
    //     recipient_address: AztecAddress,
    //     amount: u128,
    //     collateral_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     partial_commitment: Field,
    // ) {
    //     let depositor = context.msg_sender().unwrap();
    //     // 1. get the config
    //     let config = storage.config.read();

    //     // 2. determine if there is an existing loan receipt
    //     // if so, remove from set and return the amount with interest
    //     let (principal, interest, current_epoch) = _pop_existing_receipt(
    //         &mut context,
    //         asset_address,
    //         storage.loan_receipts.at(depositor),
    //         BORROW_INTEREST,
    //     );
    //     let amount_existing = principal + interest;
    //     // 4. Insert new loan receipt note
    //     let receipt_note = ReceiptNote::new(
    //         depositor,
    //         asset_address,
    //         amount_existing + amount,
    //         current_epoch + 1, // start accumulating next epoch
    //     );
    //     // 5. Insert the new receipt note
    //     storage.loan_receipts.at(depositor).insert(receipt_note).emit(
    //         depositor,
    //         MessageDelivery.CONSTRAINED_ONCHAIN,
    //     );

    //     // 6. Compute the health factor after withdrawal and return the assets involved
    //     // NOTE: this will automatically order assets by ascending address when returned
    //     // if the asserted prices are not ordered correctly, the public price check will catch it
    //     let (health_factor, collateral_assets, debt_assets) = _calculate_health_factor(
    //         &mut context,
    //         storage.deposit_receipts.at(depositor),
    //         storage.loan_receipts.at(depositor),
    //         storage.ltvs,
    //         collateral_prices,
    //         debt_asserted_prices,
    //     );

    //     // 6. Check the health factor
    //     assert(health_factor >= HEALTH_FACTOR_THRESHOLD, "Undercollateralized BOZO, L + LTV RATIO");

    //     // 7. transfer tokens out to depositor
    //     // Token::at(asset_address)
    //     //     .transfer_public_to_commitment(context.this_address(), partial_commitment, amount, 0)
    //     //     .enqueue(&mut context);
    //     Token::at(asset_address)
    //         .transfer_public_to_private(context.this_address(), recipient_address, amount, 0)
    //         .call(&mut context);

    //     // // 8. update utilization and check prices
    //     NocomLendingPoolV1::at(context.this_address())
    //         ._post_borrow(
    //             asset_address,
    //             amount,
    //             collateral_assets,
    //             collateral_prices,
    //             debt_assets,
    //             debt_asserted_prices,
    //         )
    //         .enqueue(&mut context);
    // }

    // #[external("private")]
    // fn repay_private(
    //     asset_address: AztecAddress,
    //     amount: u128,
    //     from: AztecAddress,
    //     authwit_nonce: Field,
    // ) {
    //     let depositor = context.msg_sender().unwrap();
    //     // 1. get the config
    //     let config = storage.config.read();

    //     // 2. determine if there is an existing debt to pay for this asset
    //     let (principal, interest, current_epoch) = _pop_existing_receipt(
    //         &mut context,
    //         asset_address,
    //         storage.loan_receipts.at(depositor),
    //         BORROW_INTEREST,
    //     );
    //     let amount_debt = principal + interest;
    //     assert(amount_debt > 0, "No existing debt to repay");

    //     // 3. determine the exact amount to repay
    //     assert(
    //         amount_debt >= amount,
    //         "Repay amount exceeds debt, set to 0 if you want to fully repay",
    //     );
    //     let amount_to_repay = if amount == 0 {
    //         // if amount is set to 0, repay whatever the full debt is
    //         amount_debt
    //     } else {
    //         amount
    //     };

    //     // 4. Insert new loan receipt note for remaining amount if partial repayment
    //     let remaining_amount = amount_debt - amount_to_repay;
    //     if remaining_amount > 0 {
    //         let receipt_note = ReceiptNote::new(
    //             depositor,
    //             asset_address,
    //             remaining_amount,
    //             current_epoch, // start accumulating this epoch
    //         );
    //         storage.loan_receipts.at(depositor).insert(receipt_note).emit(
    //             depositor,
    //             MessageDelivery.CONSTRAINED_ONCHAIN,
    //         );
    //     }

    //     // 5. pull in tokens for repayment
    //     Token::at(asset_address)
    //         .transfer_private_to_public(from, context.this_address(), amount_to_repay, authwit_nonce
    //             )
    //         .call(&mut context);

    //     // 6. update utilization
    //     NocomLendingPoolV1::at(context.this_address())
    //         ._post_repay(asset_address, amount_to_repay)
    //         .enqueue(&mut context);
    // }

    // #[external("private")]
    // fn liquidate_private(
    //     liquidation_asset: AztecAddress,
    //     collateral_asset: AztecAddress,
    //     amount_to_repay: u128,
    //     liquidator: AztecAddress,
    //     liquidator_authwit_nonce: Field,
    //     collateral_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     collateral_asset_index: u32, // todo: cleaner way
    //     liquidation_asset_index: u32,
    // ) {
    //     let depositor = context.msg_sender().unwrap();
    //     // 1. get the config
    //     let config = storage.config.read();

    //     // 2. check the health factor is below the threshold
    //     let (health_factor, collateral_assets, debt_assets) = _calculate_health_factor(
    //         &mut context,
    //         storage.deposit_receipts.at(depositor),
    //         storage.loan_receipts.at(depositor),
    //         storage.ltvs,
    //         collateral_asserted_prices,
    //         debt_asserted_prices,
    //     );

    //     assert(health_factor < HEALTH_FACTOR_THRESHOLD, "Undercollateralized BOZO, L + LTV RATIO");


    //     // 3. get the specific loan receipt to pay down and collateral to claim
    //     let (loan_principal, loan_interest, current_epoch) = _pop_existing_receipt(
    //         &mut context,
    //         liquidation_asset,
    //         storage.loan_receipts.at(depositor),
    //         BORROW_INTEREST
    //     );
    //     let loan_total_amount = loan_principal + loan_interest;
    //     let (collateral_principal, collateral_interest, _) = _pop_existing_receipt(
    //         &mut context,
    //         collateral_asset,
    //         storage.deposit_receipts.at(depositor),
    //         LEND_INTEREST
    //     );
    //     let collateral_total_amount = collateral_principal + collateral_interest;

    //     // 4. check that amount to repay is < or equal to the loan receipt amount
    //     debug_log_format("Amount to repay: {0}, loan total amount: {1}", [amount_to_repay as Field, loan_total_amount as Field]);
    //     assert(amount_to_repay <= loan_total_amount, "Repay amount exceeds debt");

    //     debug_log_format("Sending repay from liquidator: {0}", [amount_to_repay as Field]);
    //     // 5. repay the loan
    //     Token::at(liquidation_asset)
    //         .transfer_private_to_public(
    //             liquidator,
    //             context.this_address(),
    //             amount_to_repay,
    //             liquidator_authwit_nonce,
    //         )
    //         .call(&mut context);
        
    //     // 6. if remaining value from loan, reinsert receipt
    //     let remaining_loan_amount = loan_total_amount - amount_to_repay;
    //     if remaining_loan_amount > 0 {
    //         let receipt_note = ReceiptNote::new(
    //             depositor,
    //             liquidation_asset,
    //             remaining_loan_amount,
    //             current_epoch, // start accumulating this epoch
    //         );
    //         storage.loan_receipts.at(depositor).insert(receipt_note).emit(
    //             depositor,
    //             MessageDelivery.CONSTRAINED_ONCHAIN,
    //         );
    //     }

    //     // 7. determine amount of collateral to give to liquidator
    //     // 7a. get prices
    //     let collateral_price = collateral_asserted_prices.get_unchecked(collateral_asset_index);
    //     assert(collateral_assets.get_unchecked(collateral_asset_index as u32) == collateral_asset, "Incorrect collateral index");
    //     let loan_price = debt_asserted_prices.get_unchecked(liquidation_asset_index);
    //     assert(debt_assets.get_unchecked(liquidation_asset_index as u32) == liquidation_asset, "Incorrect debt index");
    //     // 7b. determine corresponding amount of collateral without liq bonus
    //     let collateral_equivalent = (amount_to_repay * loan_price)
    //         / (collateral_price * math::PRICE_BASE);
    //     // 7c. determine liquidation bonus
    //     let liquidation_bonus = (collateral_equivalent * LIQUIDATION_BONUS) / BONUS_BASE;
    //     // 7d. determine protocol share of bonus 
    //     let protocol_fee = (liquidation_bonus * PROTOCOL_LIQUIDATION_FEE) / BONUS_BASE;
    //     // 7e. collateral transfer results
    //     let total_collateral_liquidated = collateral_equivalent + liquidation_bonus;
    //     let collateral_to_liquidator = total_collateral_liquidated - protocol_fee;
    //     debug_log_format("Collateral price: {0}, loan price: {1}", [collateral_price as Field, loan_price as Field]);
    //     debug_log_format("Collateral equivalent: {0}", [collateral_equivalent as Field]);
    //     debug_log_format("Liquidation bonus: {0}", [liquidation_bonus as Field]);
    //     debug_log_format("Total collateral liquidated: {0}", [total_collateral_liquidated as Field]);
    //     debug_log_format("Protocol fee: {0}", [protocol_fee as Field]);
    //     // 8. check that there is enough collateral to cover
    //     assert(total_collateral_liquidated <= collateral_total_amount, "Not enough collateral to cover liquidation");

    //     // 9. if remaining collateral, reinsert receipt
    //     let remaining_collateral_amount = collateral_total_amount - total_collateral_liquidated;
    //     if remaining_collateral_amount > 0 {
    //         let receipt_note = ReceiptNote::new(
    //             depositor,
    //             collateral_asset,
    //             remaining_collateral_amount,
    //             current_epoch + 1, // start accumulating next epoch
    //         );
    //         storage.deposit_receipts.at(depositor).insert(receipt_note).emit(
    //             depositor,
    //             MessageDelivery.CONSTRAINED_ONCHAIN,
    //         );
    //     }

    //     debug_log_format("Sending collateral to liquidator: {0}", [collateral_to_liquidator as Field]);
    //     debug_log_format("protocol fee: {0}", [protocol_fee as Field]);
    //     debug_log_format("total collateral liquidated: {0}", [total_collateral_liquidated as Field]);
    //     // 10. transfer collateral to liquidator
    //     Token::at(collateral_asset)
    //         .transfer_public_to_private(
    //             context.this_address(),
    //             liquidator,
    //             collateral_to_liquidator,
    //             0,
    //         )
    //         .call(&mut context);
        
    //     // 11. post liquidation hook
    //     NocomLendingPoolV1::at(context.this_address())
    //         ._post_liquidation(
    //             liquidation_asset,
    //             collateral_asset,
    //             amount_to_repay,
    //             total_collateral_liquidated,
    //             collateral_asserted_prices,
    //             collateral_assets,
    //             debt_asserted_prices,
    //             debt_assets,
    //             protocol_fee
    //         )
    //         .enqueue(&mut context);

    // }


    // /// PUBLIC CLEANUP HOOKS ///
    // // todo: combine all prices into one
    // #[external("public")]
    // fn _post_withdrawal(
    //     asset: AztecAddress,
    //     amount_withdrawn: u128,
    //     protocol_fee: u128,
    //     collateral_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     collateral_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    // ) {
    //     // 1. update utilization
    //     let mut utilization = storage.utilization.at(asset).read();
    //     utilization.total_supplied -= amount_withdrawn;
    //     storage.utilization.at(asset).write(utilization);

    //     // 2. check prices
    //     let config = storage.config.read();
    //     assert(collateral_addresses.len() == collateral_asserted_prices.len());


    //     let collateral_prices = MockPriceFeed::at(config.oracle_address)
    //         .get_prices(collateral_addresses)
    //         .view(&mut context);
        
    //     for i in 0..collateral_prices.len() {
    //         let price = collateral_prices.get_unchecked(i);
    //         let asserted_price = collateral_asserted_prices.get_unchecked(i);
    //         assert(price == asserted_price, "Price mismatch");
    //     }

    //     assert(debt_addresses.len() == debt_asserted_prices.len());
    //     let debt_prices =
    //         MockPriceFeed::at(config.oracle_address).get_prices(debt_addresses).view(&mut context);
    //     for i in 0..debt_prices.len() {
    //         let price = debt_prices.get_unchecked(i);
    //         let asserted_price = debt_asserted_prices.get_unchecked(i);
    //         assert(price == asserted_price, "Price mismatch");
    //     }

    //     // 3. claim protocol fees to treasury
    //     Token::at(asset)
    //         .transfer_public_to_public(
    //             context.this_address(),
    //             config.treasury_address,
    //             protocol_fee,
    //             0,
    //         )
    //         .call(&mut context);
    // }

    
    // // todo: combine all prices into one
    // #[external("public")]
    // fn _post_borrow(
    //     asset: AztecAddress,
    //     amount_borrowed: u128,
    //     collateral_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     collateral_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    // ) {
    //     // 1. update utilization
    //     let mut utilization = storage.utilization.at(asset).read();
    //     utilization.total_borrowed += amount_borrowed;
    //     storage.utilization.at(asset).write(utilization);
    //     // 2. check prices
    //     let config = storage.config.read();
    //     assert(collateral_addresses.len() == collateral_asserted_prices.len());

    //     let collateral_prices = MockPriceFeed::at(config.oracle_address)
    //         .get_prices(collateral_addresses)
    //         .view(&mut context);

    //     for i in 0..collateral_prices.len() {
    //         let price = collateral_prices.get_unchecked(i);
    //         let asserted_price = collateral_asserted_prices.get_unchecked(i);
    //         assert(price == asserted_price, "Price mismatch");
    //     }

    //     assert(debt_addresses.len() == debt_asserted_prices.len());
    //     let debt_prices =
    //         MockPriceFeed::at(config.oracle_address).get_prices(debt_addresses).view(&mut context);

    //     for i in 0..debt_prices.len() {
    //         let price = debt_prices.get_unchecked(i);
    //         let asserted_price = debt_asserted_prices.get_unchecked(i);
    //         // debug_log_format("=========debt\nindex: {0}\nprice: {1}\nasserted: {2}", [i as Field, price as Field, asserted_price as Field]);
    //         assert(price == asserted_price, "Price mismatch");
    //     }
    // }

    // #[external("public")]
    // #[internal]
    // fn _post_repay(asset: AztecAddress, amount_repaid: u128) {
    //     let mut utilization = storage.utilization.at(asset).read();
    //     utilization.total_borrowed -= amount_repaid;
    //     storage.utilization.at(asset).write(utilization);
    // }

    // #[external("public")]
    // #[internal]
    // fn _post_liquidation(
    //     loan_asset: AztecAddress,
    //     collateral_asset: AztecAddress,
    //     amount_repaid: u128,
    //     collateral_transferred: u128,
    //     collateral_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     collateral_assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     protocol_fee: u128,
    // ) {
    //     // 1. update loaned asset utilization
    //     let mut utilization = storage.utilization.at(loan_asset).read();
    //     utilization.total_borrowed -= amount_repaid;
    //     storage.utilization.at(loan_asset).write(utilization);

    //     // 2. update collateral asset utilization
    //     let mut utilization_collateral = storage.utilization.at(collateral_asset).read();
    //     utilization_collateral.total_supplied -= collateral_transferred;
    //     storage.utilization.at(collateral_asset).write(utilization_collateral);

    //     // 2. check prices
    //     let config = storage.config.read();
    //     assert(collateral_assets.len() == collateral_prices.len());

    //     let collateral_prices = MockPriceFeed::at(config.oracle_address)
    //         .get_prices(collateral_assets)
    //         .view(&mut context);

    //     for i in 0..collateral_prices.len() {
    //         let price = collateral_prices.get_unchecked(i);
    //         let asserted_price = collateral_prices.get_unchecked(i);
    //         assert(price == asserted_price, "Price mismatch");
    //     }

    //     assert(debt_assets.len() == debt_prices.len());
    //     let debt_prices =
    //         MockPriceFeed::at(config.oracle_address).get_prices(debt_assets).view(&mut context);

    //     for i in 0..debt_prices.len() {
    //         let price = debt_prices.get_unchecked(i);
    //         let asserted_price = debt_prices.get_unchecked(i);
    //         // debug_log_format("=========debt\nindex: {0}\nprice: {1}\nasserted: {2}", [i as Field, price as Field, asserted_price as Field]);
    //         assert(price == asserted_price, "Price mismatch");
    //     }

    //     // 3. claim protocol fees to treasury
    //     let config = storage.config.read();
    //     Token::at(collateral_asset)
    //         .transfer_public_to_public(
    //             context.this_address(),
    //             config.treasury_address,
    //             protocol_fee,
    //             0,
    //         )
    //         .call(&mut context);
    // }

    // #[external("utility")]
    // unconstrained fn get_deposit_receipts(
    //     account: AztecAddress,
    // ) -> BoundedVec<ReceiptNote, MAX_ASSETS_PER_ACCOUNT> {
    //     let mut retrieved_notes = BoundedVec::new();
    //     let notes = storage.deposit_receipts.at(account).view_notes(NoteViewerOptions::new());
    //     for i in 0..notes.len() {
    //         // assumes that there will never be more than MAX_ASSETS_PER_ACCOUNT notes stored in the set
    //         retrieved_notes.push(notes.get_unchecked(i));
    //     }
    //     retrieved_notes
    // }

    // #[external("utility")]
    // unconstrained fn get_loan_receipts(
    //     account: AztecAddress,
    // ) -> BoundedVec<ReceiptNote, MAX_ASSETS_PER_ACCOUNT> {
    //     let mut retrieved_notes = BoundedVec::new();
    //     let notes = storage.loan_receipts.at(account).view_notes(NoteViewerOptions::new());
    //     for i in 0..notes.len() {
    //         // assumes that there will never be more than MAX_ASSETS_PER_ACCOUNT notes stored in the set
    //         retrieved_notes.push(notes.get_unchecked(i));
    //     }
    //     retrieved_notes
    // }

    // #[external("utility")]
    // unconstrained fn get_utilization(asset: AztecAddress) -> (u128, u128) {
    //     let utilization = storage.utilization.at(asset).read();
    //     (utilization.total_supplied, utilization.total_borrowed)
    // }

    // // non utility views
    // #[external("private")]
    // #[view]
    // fn get_health_factor(
    //     collateral_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    // ) -> u128 {
    //     let caller = context.msg_sender().unwrap();
    //     let (health_factor, _, _) = _calculate_health_factor(
    //         &mut context,
    //         storage.deposit_receipts.at(caller),
    //         storage.loan_receipts.at(caller),
    //         storage.ltvs,
    //         collateral_prices,
    //         debt_asserted_prices,
    //     );
    //     health_factor
    // }

}
