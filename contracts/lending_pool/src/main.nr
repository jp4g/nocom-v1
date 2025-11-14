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
            asset::Asset,
            config::Config,
            obligations_note::ObligationsNote,
            receipt_note::ReceiptNote,
            utilization::Utilization,
        },
        // lib::contract_methods::{_combine_receipts}
    };
    use nocom_escrow::NocomEscrowV1;
    use token_contract::Token;
    use mock_price_feed::PriceFeed;

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
        assets: Map<AztecAddress, PublicImmutable<Asset, Context>, Context>,
        config: PublicImmutable<Config, Context>,
        deposit_receipts: Map<AztecAddress, PrivateSet<PrivateMutable<ReceiptNote, Context>, Context>, Context>,
        loan_receipts: Map<AztecAddress, PrivateSet<PrivateMutable<ReceiptNote, Context>, Context>, Context>,
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
        storage.assets.at(asset_address).initialize(Asset { asset_ltv });

        // 3. initialize single asset utilization
        // todo: is this necessary?
        storage.utilization.at(asset_address).write(Utilization::new(0, 0));
    }

    // #[external("private")]
    // fn deposit_private(
    //     amount: u128,
    //     asset_address: AztecAddress,
    //     depositor: AztecAddress
    // ) {
    //     // 1. get the config
    //     let config = storage.config.read();

    //     // 2. check supported asset
    //     // todo: replace with nullifier check for efficiency
    //     let _ = storage.assets.at(asset_address).read();
    //     // don't even need to do anything cuz it just constrains is initialized

    //     // 3. determine if there is an existing deposit receipt
    //     let (amount_existing, current_epoch) = _combine_receipts(
    //         depositor,
    //         &mut context,
    //         storage.deposit_receipts,
    //     );
    //     // 4. Add (or update) deposit receipt note
    //     let receipt_note = ReceiptNote::new(
    //         depositor,
    //         amount_existing + amount,
    //         current_epoch + 1, // start accumulating next epoch
    //     );
    //     // todo: handle initialization
    //     storage.deposit_receipts.at(depositor).initialize_or_replace(|_| { receipt_note }).emit(
    //         depositor,
    //         MessageDelivery.CONSTRAINED_ONCHAIN
    //     );

    //     // 5. pull in tokens
    //     NocomEscrowV1::at(depositor)
    //         .deposit_collateral_callback(amount, asset_address)
    //         .call(&mut context);

    //     // 6. update utilization
    //     NocomLendingPoolV1::at(context.this_address())
    //         ._update_utilization(0, amount, asset_address)
    //         .enqueue(&mut context); 
    // }

    // // TODO: CHECK FOR LIABILITIES
    // #[external("private")]
    // fn withdraw_private(
    //     amount: u128,
    //     partial_commitment: Field,
    //     depositor: AztecAddress
    // ) {
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
    //     let new_receipt_note = if remaining_amount > 0 {
    //         ReceiptNote::new(
    //             depositor,
    //             remaining_amount,
    //             current_epoch + 1,
    //         )
    //     } else {
    //         ReceiptNote::new(depositor, 0, 0)
    //     };
    //     storage.deposit_receipts.at(depositor).replace(|_| { new_receipt_note }).emit(
    //         depositor,
    //         MessageDelivery.CONSTRAINED_ONCHAIN
    //     );

    //     // 4. transfer tokens out to depositor
    //     Token::at(config.asset_token_address)
    //         .transfer_public_to_commitment(
    //             context.this_address(),
    //             partial_commitment,
    //             amount,
    //             0
    //         )
    //         .enqueue(&mut context);

    //     // 5. update utilization
    //     NocomLendingPoolV1::at(context.this_address())
    //         ._update_utilization(0, 0 - amount, config.asset_token_address)
    //         .enqueue(&mut context);
    // }

    

    // #[external("public")]
    // #[internal]
    // fn _update_utilization(
    //     amount_borrowd: u128,
    //     amount_supplied: u128,
    //     asset: AztecAddress,
    // ) {
    //     // 1. get utilization
    //     let mut utilization = storage.utilization.at(asset).read();
    //     // 2. update the utilization
    //     utilization.update(amount_borrowd, amount_supplied);
    //     // 3. write the change publicly
    //     storage.utilization.at(asset).write(utilization);
    // }

    // #[external("public")]
    // #[internal]
    // fn _check_price(
    //     asset: AztecAddress,
    //     asserted_price: u128,
    //     check_is_below: bool
    // ) {
    //     // todo: figure out private batch checks somehow
    //     // 1. get config
    //     let config = storage.config.read();
    //     // 2. get price from oracle
    //     let current_price = PriceFeed::at(config.oracle_address)
    //         .get_price(asset.to_field())
    //         .view(&mut context)
    //         .price;
    //     // 3. compare prices
    //     if check_is_below {
    //         // if checking LTV for liquidation, ensure privately asserted price is
    //         // at least current price if not higher. This is unfavorable for
    //         // the liquidator but prevents bad liquidations
    //         assert(current_price <= asserted_price);
    //     } else {
    //         // if checking LTV for borrow, ensure privately asserted price is at most the current
    //         // price if not lower. This is unfavorable for the borrower but prevents
    //         // borrowing at lower than cost
    //         assert(current_price >= asserted_price);
    //     }
    // }

    

    // // Create a position.
    // #[public]
    // fn update_accumulator() -> Asset {
    //     let asset_loc = storage.assets.at(0);
    //     let mut asset: Asset = asset_loc.read();

    //     let timestamp = context.timestamp();
    //     let dt = timestamp - asset.last_updated_ts;

    //     // Only update if time has passed.
    //     if !(dt == 0) {
    //         let precision = 1000000000 as u128;
    //         let rate_per_second = 1268391679 as u128; // 4% yearly rate / (60 * 60 * 24 * 365)
    //         // if rate_per_second < sqrt(WAD) our approx is eq precision + rate * dt
    //         let multiplier = compute_multiplier(rate_per_second, dt);

    //         // accumulator *= multiplier, and multiplier >= 1
    //         asset.interest_accumulator = (asset.interest_accumulator * multiplier) / precision;
    //         asset.last_updated_ts = timestamp;

    //         asset_loc.write(asset);
    //     }

    //     asset
    // }

    // #[private]
    // fn deposit_private(
    //     from: AztecAddress,
    //     amount: u128,
    //     authwit_nonce: Field,
    //     secret: Field,
    //     on_behalf_of: Field,
    //     collateral_asset: AztecAddress,
    // ) {
    //     let on_behalf_of = compute_identifier(
    //         secret,
    //         on_behalf_of,
    //         context.msg_sender().unwrap().to_field(),
    //     );
    //     let _res = Token::at(collateral_asset)
    //         .transfer_to_public(from, context.this_address(), amount, authwit_nonce)
    //         .call(&mut context);
    //     // docs:start:enqueue_public
    //     Lending::at(context.this_address())
    //         ._deposit(AztecAddress::from_field(on_behalf_of), amount, collateral_asset)
    //         .enqueue(&mut context);
    //     // docs:end:enqueue_public
    // }

    // #[public]
    // fn deposit_public(
    //     amount: u128,
    //     authwit_nonce: Field,
    //     on_behalf_of: Field,
    //     collateral_asset: AztecAddress,
    // ) {
    //     let _ = Token::at(collateral_asset)
    //         .transfer_in_public(
    //             context.msg_sender().unwrap(),
    //             context.this_address(),
    //             amount,
    //             authwit_nonce,
    //         )
    //         .call(&mut context);
    //     let _ = Lending::at(context.this_address())
    //         ._deposit(AztecAddress::from_field(on_behalf_of), amount, collateral_asset)
    //         .call(&mut context);
    // }

    // #[public]
    // #[internal]
    // fn _deposit(owner: AztecAddress, amount: u128, collateral_asset: AztecAddress) {
    //     let _asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);

    //     let coll_asset = storage.collateral_asset.read();
    //     assert(coll_asset.eq(collateral_asset));

    //     let coll_loc = storage.collateral.at(owner);
    //     let collateral = coll_loc.read();
    //     coll_loc.write(collateral + amount);
    // }

    // #[private]
    // fn withdraw_private(secret: Field, to: AztecAddress, amount: u128) {
    //     let on_behalf_of = compute_identifier(secret, 0, context.msg_sender().unwrap().to_field());
    //     Lending::at(context.this_address())
    //         ._withdraw(AztecAddress::from_field(on_behalf_of), to, amount)
    //         .enqueue(&mut context);
    // }

    // #[public]
    // fn withdraw_public(to: AztecAddress, amount: u128) {
    //     let _ = Lending::at(context.this_address())
    //         ._withdraw(context.msg_sender().unwrap(), to, amount)
    //         .call(&mut context);
    // }

    // #[public]
    // #[internal]
    // fn _withdraw(owner: AztecAddress, recipient: AztecAddress, amount: u128) {
    //     let asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);
    //     let price = PriceFeed::at(asset.oracle).get_price(0).view(&mut context).price;

    //     let coll_loc = storage.collateral.at(owner);
    //     let collateral = coll_loc.read();

    //     let debt_loc = storage.static_debt.at(owner);
    //     let static_debt = debt_loc.read();

    //     // debt_covered will revert if decrease would leave insufficient collateral to cover debt.
    //     // or trying to remove more collateral than available
    //     let debt_covered =
    //         covered_by_collateral(price, asset.loan_to_value, collateral, 0 as u128, amount);
    //     let debt_returns = debt_updates(
    //         asset.interest_accumulator,
    //         static_debt,
    //         0 as u128,
    //         0 as u128,
    //     );

    //     assert(debt_returns.debt_value < debt_covered);

    //     coll_loc.write(collateral - amount);

    //     // @todo @LHerskind Support both shielding and transfers (for now just transfer)
    //     let collateral_asset = storage.collateral_asset.read();
    //     let _ = Token::at(collateral_asset)
    //         .transfer_in_public(context.this_address(), recipient, amount, 0)
    //         .call(&mut context);
    // }

    // #[private]
    // fn borrow_private(secret: Field, to: AztecAddress, amount: u128) {
    //     let on_behalf_of = compute_identifier(secret, 0, context.msg_sender().unwrap().to_field());
    //     let _ = Lending::at(context.this_address())
    //         ._borrow(AztecAddress::from_field(on_behalf_of), to, amount)
    //         .enqueue(&mut context);
    // }

    // #[public]
    // fn borrow_public(to: AztecAddress, amount: u128) {
    //     let _ = Lending::at(context.this_address())
    //         ._borrow(context.msg_sender().unwrap(), to, amount)
    //         .call(&mut context);
    // }

    // #[public]
    // #[internal]
    // fn _borrow(owner: AztecAddress, to: AztecAddress, amount: u128) {
    //     let asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);
    //     let price = PriceFeed::at(asset.oracle).get_price(0).view(&mut context).price;

    //     // Fetch collateral and static_debt, compute health of current position
    //     let collateral = storage.collateral.at(owner).read();
    //     let static_debt = storage.static_debt.at(owner).read();

    //     let debt_covered =
    //         covered_by_collateral(price, asset.loan_to_value, collateral, 0 as u128, 0 as u128);
    //     let debt_returns = debt_updates(asset.interest_accumulator, static_debt, amount, 0 as u128);

    //     assert(debt_returns.debt_value < debt_covered);

    //     storage.static_debt.at(owner).write(debt_returns.static_debt);

    //     // @todo @LHerskind Need to support both private and public minting.
    //     let stable_coin = storage.stable_coin.read();
    //     let _ = Token::at(stable_coin).mint_to_public(to, amount).call(&mut context);
    // }

    // #[private]
    // fn repay_private(
    //     from: AztecAddress,
    //     amount: u128,
    //     authwit_nonce: Field,
    //     secret: Field,
    //     on_behalf_of: Field,
    //     stable_coin: AztecAddress,
    // ) {
    //     let on_behalf_of = compute_identifier(
    //         secret,
    //         on_behalf_of,
    //         context.msg_sender().unwrap().to_field(),
    //     );
    //     // docs:start:private_call
    //     let _ = Token::at(stable_coin).burn_private(from, amount, authwit_nonce).call(&mut context);
    //     // docs:end:private_call
    //     let _ = Lending::at(context.this_address())
    //         ._repay(AztecAddress::from_field(on_behalf_of), amount, stable_coin)
    //         .enqueue(&mut context);
    // }

    // #[public]
    // fn repay_public(
    //     amount: u128,
    //     authwit_nonce: Field,
    //     owner: AztecAddress,
    //     stable_coin: AztecAddress,
    // ) {
    //     let _ = Token::at(stable_coin)
    //         .burn_public(context.msg_sender().unwrap(), amount, authwit_nonce)
    //         .call(&mut context);
    //     let _ = Lending::at(context.this_address())._repay(owner, amount, stable_coin).call(
    //         &mut context,
    //     );
    // }

    // #[public]
    // #[internal]
    // fn _repay(owner: AztecAddress, amount: u128, stable_coin: AztecAddress) {
    //     let asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);

    //     // To ensure that private is using the correct token.
    //     assert(stable_coin.eq(storage.stable_coin.read()));

    //     let static_debt = storage.static_debt.at(owner).read();
    //     let debt_returns = debt_updates(asset.interest_accumulator, static_debt, 0 as u128, amount);

    //     storage.static_debt.at(owner).write(debt_returns.static_debt);
    // }

    // #[public]
    // #[view]
    // fn get_asset(asset_id: Field) -> Asset {
    //     storage.assets.at(asset_id).read()
    // }

    // #[public]
    // #[view]
    // fn get_position(owner: AztecAddress) -> pub Position {
    //     let collateral = storage.collateral.at(owner).read();
    //     let static_debt = storage.static_debt.at(owner).read();
    //     let asset: Asset = storage.assets.at(0).read();
    //     let debt = debt_value(static_debt, asset.interest_accumulator);
    //     Position { collateral, static_debt, debt }
    // }

    // #[public]
    // #[view]
    // fn get_assets() -> pub [AztecAddress; 2] {
    //     [storage.collateral_asset.read(), storage.stable_coin.read()]
    // }
}