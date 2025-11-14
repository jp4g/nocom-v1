// mod asset;
// mod position;
// mod interest_math;
// mod helpers;
mod lib;
mod types;



use dep::aztec::macros::aztec;

#[aztec]
pub contract NocomLendingPoolV1 {
    use aztec::{
        context::PrivateContext,
        protocol_types::address::AztecAddress,
        state_vars::{Map, PrivateSet, PublicImmutable, PublicMutable, PrivateMutable},
        macros::{
            functions::{initializer, internal, external, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol_types::{
            traits::{FromField, ToField},
            constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL
        },
        note::{retrieved_note::RetrievedNote, note_getter_options::NoteGetterOptions}
    };

    use crate::{
        types::{
            config::Config,
            obligations_note::ObligationsNote,
            receipt_note::ReceiptNote,
            utilization::Utilization,
        },
        lib::{
            contract_methods::{
                _pop_existing_receipt,
                _calculate_health_factor,
                // _check_prices
            },
            validation
        }
    };
    use nocom_escrow::NocomEscrowV1;
    use mock_price_feed::MockPriceFeed;
    use token_contract::Token;

    // use crate::asset::Asset;
    // use crate::helpers::{compute_identifier, covered_by_collateral, debt_updates, debt_value};
    // use crate::interest_math::compute_multiplier;
    // use crate::position::Position;
    // use dep::price_feed::PriceFeed;

    // use dep::aztec::
    // use dep::aztec::

    pub global EPOCH_LENGTH: u64 = 300; // 5 minutes per epoch 

    // predetermined interest rate per epoch (approx 4% APR)
    pub global FIXED_LEND_RATE_PER_EPOCH: u128 = 1_000_000_746_822_095_197_583_024;

    // limitation of note getting
    pub global MAX_ASSETS_PER_ACCOUNT: u32 = 4;

    pub global LEND_INTEREST: u64 = 4; // hardcoded 4% for supplying
    pub global BORROW_INTEREST: u64 = 5; // hardcoded 5% for borrowing


    // Storage structure, containing all storage, and specifying what slots they use.
    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        deposit_receipts: Map<AztecAddress, PrivateSet<ReceiptNote, Context>, Context>,
        loan_receipts: Map<AztecAddress, PrivateSet<ReceiptNote, Context>, Context>,
        ltvs: Map<AztecAddress, PublicImmutable<u128, Context>, Context>,
        obligations: Map<AztecAddress, PrivateMutable<ObligationsNote, Context>, Context>,
        utilization: Map<AztecAddress, PublicMutable<Utilization, Context>, Context>,
    //     // collateral_asset: PublicMutable<AztecAddress, Context>,
    //     // stable_coin: PublicMutable<AztecAddress, Context>,
    //     // assets: Map<Field, PublicMutable<Asset, Context>, Context>,
    //     // collateral: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
    //     // static_debt: Map<AztecAddress, PublicMutable<u128, Context>, Context>, // abusing keys very heavily
    }

    // Constructs the contract.
    #[external("private")]
    #[initializer]
    fn constructor() { }

    #[external("public")]
    fn init(
        oracle: AztecAddress,
        stable_token: AztecAddress,
    ) {
        // just initialize config
        let config = Config {
            admin: context.msg_sender().unwrap(),
            oracle_address: oracle,
            stable_token_address: stable_token,
        };
        storage.config.initialize(config);
    }

    #[external("public")]
    fn register_asset(
        asset_address: AztecAddress,
        asset_ltv: u128,
    ) {
        // 1. only admin can register assets
        let config = storage.config.read();
        assert(context.msg_sender().unwrap() == config.admin);

        // NOTE: do not check if asset already registered - public immutable
        // todo: switch to delayed public mutable
        // 2. register asset with LTV
        storage.ltvs.at(asset_address).initialize(asset_ltv);

        // 3. initialize single asset utilization
        // todo: is this necessary?
        storage.utilization.at(asset_address).write(Utilization::new(0, 0));
    }

    // #[external("private")]
    // fn deposit_private(
    //     amount: u128,
    //     asset_address: AztecAddress,
    // ) {
    //     let depositor = context.msg_sender().unwrap();
    //     // 1. get the config
    //     let config = storage.config.read();

    //     // 2. check supported asset
    //     // todo: replace with nullifier check for efficiency
    //     let _ = storage.assets.at(asset_address).read();
    //     // don't even need to do anything cuz it just constrains is initialized

    //     // 3. determine if there is an existing deposit receipt
    //     // if so, remove from set and return the amount with interest
    //     let (amount_existing, current_epoch) = _pop_existing_receipt(
    //         &mut context,
    //         asset_address,
    //         storage.deposit_receipts.at(depositor),
    //         LEND_INTEREST
    //     );
    //     // 4. Add (or update) deposit receipt note
    //     let receipt_note = ReceiptNote::new(
    //         depositor,
    //         asset_address,
    //         amount_existing + amount,
    //         current_epoch + 1, // start accumulating next epoch
    //     );
    //     // 5. Insert the new receipt note
    //     storage.deposit_receipts
    //         .at(depositor)
    //         .insert(receipt_note)
    //         .emit(depositor, MessageDelivery.CONSTRAINED_ONCHAIN);

    //     // 6. pull in tokens
    //     NocomEscrowV1::at(depositor)
    //         .deposit_collateral_callback(amount, asset_address)
    //         .call(&mut context);

    //     // 7. update utilization
    //     NocomLendingPoolV1::at(context.this_address())
    //         .post_deposit(0, amount, asset_address)
    //         .enqueue(&mut context); 
    // }

    // /**
    //  * Withdraw supplied collateral
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
    //     partial_commitment: Field,
    //     collateral_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     collateral_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    //     debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    // ) {
    //     let depositor = context.msg_sender().unwrap();
    //     // 1. get the config
    //     let config = storage.config.read();
    
    //     // 2. combine deposit receipts to get total amount + interest
    //     let (total_amount, current_epoch) = _combine_receipts(
    //         depositor,
    //         &mut context,
    //         storage.deposit_receipts,
    //     );
    //     assert(total_amount >= amount);

    //     // 3. create new deposit receipt for remaining amount (if any)
    //     let remaining_amount = total_amount - amount;
    //     if remaining_amount > 0 {
    //         let receipt_note = ReceiptNote::new(
    //             depositor,
    //             asset_address,
    //             remaining_amount,
    //             current_epoch + 1,
    //         );
    //         storage.deposit_receipts
    //             .at(depositor)
    //             .insert(receipt_note)
    //             .emit(depositor, MessageDelivery.CONSTRAINED_ONCHAIN);
    //     }

    //     // 4. Check the health factor after withdrawal
    //     _calculate_health_factor(

    //     )

    //     // 5. Check all prices
        

    //     // 5. transfer tokens out to depositor
    //     Token::at(config.asset_token_address)
    //         .transfer_public_to_commitment(
    //             context.this_address(),
    //             partial_commitment,
    //             amount,
    //             0
    //         )
    //         .enqueue(&mut context);

    //     // 6. update utilization
    //     NocomLendingPoolV1::at(context.this_address())
    //         ._update_utilization(0, 0 - amount, config.asset_token_address)
    //         .enqueue(&mut context);
    // }

    #[external("public")]
    #[internal]
    fn _post_deposit(asset: AztecAddress, amount_supplied: u128) {
        let mut utilization = storage.utilization.at(asset).read();
        utilization.total_supplied += amount_supplied;
        storage.utilization.at(asset).write(utilization);
    }

    // todo: combine all prices into one
    #[external("public")]
    fn _post_withdrawal(
        asset: AztecAddress,
        amount_withdrawn: u128,
        collateral_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
        collateral_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
        debt_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
        debt_asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    ) {
        // 1. update utilization
        let mut utilization = storage.utilization.at(asset).read();
        utilization.total_supplied -= amount_withdrawn;
        storage.utilization.at(asset).write(utilization);
        // 2. check prices
        let config = storage.config.read();
        assert(collateral_addresses.len() == collateral_asserted_prices.len());

        let collateral_prices = MockPriceFeed::at(config.oracle_address)
            .get_prices(collateral_addresses)
            .view(&mut context);
        for i in 0..collateral_prices.len() {
            let price = collateral_prices.get_unchecked(i);
            let asserted_price = collateral_asserted_prices.get_unchecked(i);
            assert(price == asserted_price, "Price mismatch");
        }
        
        assert(debt_addresses.len() == debt_asserted_prices.len());
        let debt_prices = MockPriceFeed::at(config.oracle_address)
            .get_prices(debt_addresses)
            .view(&mut context);
        for i in 0..debt_prices.len() {
            let price = debt_prices.get_unchecked(i);
        let asserted_price = debt_asserted_prices.get_unchecked(i);
            assert(price == asserted_price, "Price mismatch");
        }
    }
}