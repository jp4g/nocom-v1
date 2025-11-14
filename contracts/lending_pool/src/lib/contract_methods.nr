use aztec::{
    context::{PrivateContext, PublicContext},
    note::{
        note_getter_options::{NoteGetterOptions, SortOrder},
        note_interface::NoteProperties,
        retrieved_note::RetrievedNote,
    },
    protocol_types::{address::AztecAddress, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL},
    state_vars::{Map, PrivateSet, PublicImmutable},
};

use mock_price_feed::MockPriceFeed;

use crate::{
    lib::{math, time},
    NocomLendingPoolV1::{
        self, BORROW_INTEREST, EPOCH_LENGTH, LEND_INTEREST, MAX_ASSETS_PER_ACCOUNT,
    },
    types::receipt_note::ReceiptNote,
};

pub struct Position {
    pub amount: u128,
    pub asset: AztecAddress,
}

#[contract_library_method]
pub fn _get_ltvs(
    assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
    ltv_storage: Map<AztecAddress, PublicImmutable<u128, &mut PrivateContext>, &mut PrivateContext>,
) -> BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT> {
    let mut ltvs: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT> = BoundedVec::new();
    for i in 0..MAX_ASSETS_PER_ACCOUNT {
        let asset = assets.get_unchecked(i);
        if i < assets.len() {
            let ltv = ltv_storage.at(asset).read();
            ltvs.push(ltv);
        }
    }
    ltvs
}

/*
 *
 * @return (principal, interest, next_epoch)
 */
#[contract_library_method]
pub fn _pop_existing_receipt(
    context: &mut PrivateContext,
    asset_address: AztecAddress,
    receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
    interest_rate: u64,
) -> (u128, u128, u64) {
    // 1. Get the current epoch & enforce delivery
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
    // 2. check if there is an existing deposit receipt and remove it if found
    let opts = NoteGetterOptions::with_filter(filter_to_asset_receipt, asset_address).set_limit(1);
    let receipt_notes = receipt_storage.pop_notes(opts);
    // 3. If no existing receipt, return 0
    if receipt_notes.len() == 0 {
        (0, 0, current_epoch)
    } else {
        let current_receipt = receipt_notes.get_unchecked(0);
        // 4. calculate the amount of accrued interest
        // note: hardcoded 4% rate of interest for now
        let interest = math::InterestCalculator::new(interest_rate).calculate_accrued_interest(
            current_receipt.amount,
            current_receipt.epoch,
            current_epoch,
        );
        (current_receipt.amount, interest, current_epoch)
    }
}

/**
 * Calculate health factor for single asset
 */
#[contract_library_method]
pub fn _calculate_health_factor(
    context: &mut PrivateContext,
    deposit_receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
    loan_receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
    ltv_storage: Map<AztecAddress, PublicImmutable<u128, &mut PrivateContext>, &mut PrivateContext>,
    collateral_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    debt_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
) -> (u128, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>) {
    // 1. get collateral value
    let (weighted_collateral_value, collateral_assets) = get_receipt_amount_ltv_weighted(
        context,
        deposit_receipt_storage,
        ltv_storage,
        LEND_INTEREST,
        collateral_prices,
    );
    // 2. get debt value
    let (debt_value, debt_assets) =
        get_receipt_amount(context, loan_receipt_storage, BORROW_INTEREST, debt_prices);
    // 3. calculate health factor
    let health_factor = if debt_value == 0 {
        math::U128_MAX
    } else {
        ((weighted_collateral_value as Field * math::SCALE) / debt_value as Field) as u128
    };
    (health_factor, collateral_assets, debt_assets)
}

// todo: constrain amount of notes provided to be exact number
#[contract_library_method]
pub fn get_receipt_amount(
    context: &mut PrivateContext,
    receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
    interest_rate: u64,
    prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
) -> (u128, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>) {
    // 1. Get all the notes for the depositor
    // enforce sorting asset addresses by ascending to match prices order
    let opts = NoteGetterOptions::new().set_limit(MAX_ASSETS_PER_ACCOUNT).sort(
        ReceiptNote::properties().asset,
        SortOrder.ASC,
    );
    let receipt_notes = receipt_storage.get_notes(opts);
    assert(prices.len() == receipt_notes.len(), "Mismatched prices and receipts lengths");
    // 2. get current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
    // 3. iterate through and determine values per asset & collect asset addresses
    let mut assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT> = BoundedVec::new();
    let mut total_value: u128 = 0;
    for i in 0..MAX_ASSETS_PER_ACCOUNT {
        if i < receipt_notes.len() {
            // calculate total with interest
            let receipt = receipt_notes.get_unchecked(i);
            let amount = math::InterestCalculator::new(interest_rate).calculate_interest(
                receipt.note.amount,
                receipt.note.epoch,
                current_epoch,
            ) as Field;
            // determine price
            let price = prices.get_unchecked(i) as Field;
            let asset_value = amount * price / math::SCALE;
            // accumulate total value
            total_value += asset_value as u128;
            // collect asset address
            assets.push(receipt.note.asset);
        }
    }
    (total_value, assets)
}

/**
 * Get the total value contained in all receipt notes, weighted by LTV's
 * todo: constrain amount of notes provided to be exact number
 * todo: can we use pop_capsule to make this more efficient
 *
 * @param receipt_storage - The set of receipt notes to evaluate
 * @param interest_rate - The interest rate to apply to the receipts
 * @param prices - The asserted of the assets in the receipts
 * @return
 *     - the total value of the receipts weighted by LTV
 *     - the list of asset addresses in the receipts
 */
#[contract_library_method]
pub fn get_receipt_amount_ltv_weighted(
    context: &mut PrivateContext,
    receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
    ltv_storage: Map<AztecAddress, PublicImmutable<u128, &mut PrivateContext>, &mut PrivateContext>,
    interest_rate: u64,
    prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
) -> (u128, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>) {
    // 1. Get all the notes for the depositor
    // enforce sorting asset addresses by ascending to match prices order
    let opts = NoteGetterOptions::new().set_limit(MAX_ASSETS_PER_ACCOUNT).sort(
        ReceiptNote::properties().asset,
        SortOrder.ASC,
    );
    let receipt_notes = receipt_storage.get_notes(opts);
    assert(prices.len() == receipt_notes.len(), "Mismatched prices and receipts lengths");
    // 2. get current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
    // 3. Iterate through, build asset map and ltvs
    let mut assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT> = BoundedVec::new();
    for i in 0..MAX_ASSETS_PER_ACCOUNT {
        if i < receipt_notes.len() {
            let receipt = receipt_notes.get_unchecked(i);
            assets.push(receipt.note.asset);
        }
    }
    let ltvs = _get_ltvs(assets, ltv_storage);
    // 4. iterate through and determine values per asset
    let mut total_value: u128 = 0;
    for i in 0..MAX_ASSETS_PER_ACCOUNT {
        if i < receipt_notes.len() {
            // calculate total with interest
            let receipt = receipt_notes.get_unchecked(i);
            let amount = math::InterestCalculator::new(interest_rate).calculate_interest(
                receipt.note.amount,
                receipt.note.epoch,
                current_epoch,
            ) as Field;
            // determine price
            let price = prices.get_unchecked(i) as Field;
            let asset_value = amount * price / math::SCALE;
            // apply LTV weighting
            let ltv = ltvs.get_unchecked(i) as Field;
            let asset_value = asset_value as Field * ltv / math::SCALE;
            // accumulate total value
            total_value += asset_value as u128;
        }
    }
    (total_value, assets)
}

// Ensures that either no note was found or one note matches
pub fn filter_to_asset_receipt(
    retrieved_notes: [Option<RetrievedNote<ReceiptNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    asset_address: AztecAddress,
) -> [Option<RetrievedNote<ReceiptNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];

    // let mut found = [false; N];

    // there should only be one matching note at most
    // so we don't loop over MAX_NOTE_HASH_READ_REQUESTS_PER_CALL
    let retrieved_note = retrieved_notes[0];
    if retrieved_note.is_some() {
        let note = retrieved_note.unwrap_unchecked().note;
        assert(note.asset == asset_address, "mismatch asset address in receipt");
        selected[0] = retrieved_notes[0];
    }

    selected
}

// why doesn't this like context here????
// #[contract_library_method]
// pub fn _check_prices(
//     context: &mut PublicContext,
//     oracle_address: AztecAddress,
//     assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
//     asserted_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
// ) {
//     let prices = MockPriceFeed::at(oracle_address)
//         .get_prices(assets)
//         .view(context);
//     for i in 0..prices.len() {
//         let price = prices.get_unchecked(i);
//         let asserted_price = asserted_prices.get_unchecked(i);
//         assert(price == asserted_price, "Price mismatch");
//     }
// }
