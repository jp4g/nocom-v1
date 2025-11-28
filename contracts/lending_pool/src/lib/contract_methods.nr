use aztec::{
    context::{PrivateContext, UtilityContext},
    messages::message_delivery::MessageDelivery,
    note::{
        note_emission::NoteEmission,
        note_getter_options::{NoteGetterOptions, SortOrder},
        note_interface::NoteProperties,
        retrieved_note::RetrievedNote,
    },
    oracle::{
        debug_log::debug_log_format,
        notes::check_nullifier_exists
    },
    protocol_types::{
        address::AztecAddress,
        constants::{MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, GENERATOR_INDEX__INITIALIZATION_NULLIFIER},
        hash::poseidon2_hash_with_separator,
        storage::map::derive_storage_slot_in_map,
    },
    state_vars::{Map, PrivateSet, PublicImmutable, PrivateMutable},
};

use mock_price_feed::MockPriceFeed;

use crate::{
    lib::{
        constants::{BORROW_INTEREST, EPOCH_LENGTH, LEND_INTEREST},
        math, time
    },
    NocomLendingPoolV1::self,
    types::receipt_note::ReceiptNote,
};

unconstrained fn check_receipt_initialized(
    epoch: Field,
    map_slot: Field,
) -> bool {
    let epoch_slot = derive_storage_slot_in_map(map_slot, epoch);
    let nullifier = poseidon2_hash_with_separator(
        [epoch_slot],
        GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
    );
    unsafe { check_nullifier_exists(nullifier) }
}

pub fn _get_existing_receipt(
    current_epoch: u64,
    receipt_map_slot: Field,
    receipt_storage: PrivateMutable<ReceiptNote, &mut PrivateContext>,
) -> Option<ReceiptNote> {
    // check if initialized
    // Safety: use will try to initialize if not found, will find the nullifier, and fail
    let is_initialized = unsafe {
        check_receipt_initialized(current_epoch as Field, receipt_map_slot)
    };
    if !is_initialized {
        Option::none()
    } else {
        Option::some(receipt_storage.get_note().content.note)
    }
}

#[contract_library_method]
pub fn _update_receipt(
    context: &mut PrivateContext,
    receipt_map_slot: Field,
    receipt_storage: PrivateMutable<ReceiptNote, &mut PrivateContext>,
    owner: AztecAddress,
    amount: u128,
    interest_rate: u128,
) {
    // 1. determine the current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
    
    // 2. update or insert receipt note
    receipt_storage.initialize_or_replace(|existing_receipt| {
        // if note currently exists, calclulate existing amount with interest
        let existing_amount = if existing_receipt.is_some() {
            let principal = existing_receipt.unwrap_unchecked().amount;
            let epoch = existing_receipt.unwrap_unchecked().epoch;
            let interest = math::calculate_interest(
                principal,
                epoch,
                current_epoch,
                EPOCH_LENGTH,
                interest_rate,
            );
            principal + interest
        } else {
            0
        };
        let updated_amount = existing_amount + amount;
        ReceiptNote::new(owner, updated_amount, current_epoch)
    }).emit(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
}


// #[contract_library_method]
// pub fn _get_ltvs(
//     assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>,
//     ltv_storage: Map<AztecAddress, PublicImmutable<u128, &mut PrivateContext>, &mut PrivateContext>,
// ) -> BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT> {
//     let mut ltvs: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT> = BoundedVec::new();
//     for i in 0..MAX_ASSETS_PER_ACCOUNT {
//         let asset = assets.get_unchecked(i);
//         if i < assets.len() {
//             let ltv = ltv_storage.at(asset).read();
//             ltvs.push(ltv);
//         }
//     }
//     ltvs
// }

// /*
//  *
//  * @return (principal, interest, next_epoch)
//  */
// #[contract_library_method]
// pub fn _pop_existing_receipt(
//     context: &mut PrivateContext,
//     asset_address: AztecAddress,
//     receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
//     interest_rate: u128,
// ) -> (u128, u128, u64) {
//     // 1. Get the current epoch & enforce delivery
//     let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
//     // 2. check if there is an existing deposit receipt and remove it if found
//     let opts = NoteGetterOptions::with_filter(filter_to_asset_receipt, asset_address).set_limit(1);
//     let receipt_notes = receipt_storage.pop_notes(opts);
//     // 3. If no existing receipt, return 0
//     if receipt_notes.len() == 0 {
//         (0, 0, current_epoch)
//     } else {
//         let current_receipt = receipt_notes.get_unchecked(0);
//         // 4. calculate the amount of accrued interest
//         // note: hardcoded 4% rate of interest for now
//         let interest = math::calculate_interest(
//             current_receipt.amount,
//             current_receipt.epoch,
//             current_epoch,
//             EPOCH_LENGTH,
//             interest_rate,
//         );
//         (current_receipt.amount, interest, current_epoch)
//     }
// }

// /**
//  * Calculate health factor for single asset
//  */
// #[contract_library_method]
// pub fn _calculate_health_factor(
//     context: &mut PrivateContext,
//     deposit_receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
//     loan_receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
//     ltv_storage: Map<AztecAddress, PublicImmutable<u128, &mut PrivateContext>, &mut PrivateContext>,
//     collateral_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
//     debt_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
//     ) -> (u128, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>) {
//     // 1. get collateral value
//     let (weighted_collateral_value, collateral_assets) = get_receipt_amount_ltv_weighted(
//         context,
//         deposit_receipt_storage,
//         ltv_storage,
//         LEND_INTEREST,
//         collateral_prices,
//     );
//     // 2. get debt value
//     let (debt_value, debt_assets) =
//         get_receipt_amount(context, loan_receipt_storage, BORROW_INTEREST, debt_prices);
//     // 3. calculate health factor
//     let health_factor = if debt_value == 0 {
//         1000
//     } else {
//         // need to convert to u256 for this?
//         // or we will try reducing precision since technically only need like 3 decimals
//         let weighted_collateral_value_scaled = weighted_collateral_value / 10.pow_32(15) as u128;
//         let debt_value_scaled = debt_value / 10.pow_32(15) as u128;
//         debug_log_format("debt_value: {0}, debt_value_scaled: {1}", [debt_value as Field, debt_value_scaled as Field]);
//         debug_log_format("weighted_collateral_value: {0}, weighted_collateral_value_scaled: {1}", [weighted_collateral_value as Field, weighted_collateral_value_scaled as Field]);
//         (weighted_collateral_value_scaled * 10.pow_32(3) as u128 / debt_value_scaled)
//     };
//     (health_factor, collateral_assets, debt_assets)
// }

// // todo: constrain amount of notes provided to be exact number
// #[contract_library_method]
// pub fn get_receipt_amount(
//     context: &mut PrivateContext,
//     receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
//     interest_rate: u128,
//     prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
// ) -> (u128, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>) {
//     // 1. Get all the notes for the depositor
//     // enforce sorting asset addresses by ascending to match prices order
//     let opts = NoteGetterOptions::new().set_limit(MAX_ASSETS_PER_ACCOUNT).sort(
//         ReceiptNote::properties().asset,
//         SortOrder.ASC,
//     );
//     let receipt_notes: BoundedVec<RetrievedNote<ReceiptNote>, 16> = receipt_storage.get_notes(opts);
//     assert(prices.len() == receipt_notes.len(), "Mismatched prices and receipts lengths");
//     // 2. get current epoch
//     let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
//     // 3. iterate through and determine values per asset & collect asset addresses
//     let mut assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT> = BoundedVec::new();
//     let mut total_value_scaled: u128 = 0;
//     for i in 0..MAX_ASSETS_PER_ACCOUNT {
//         if i < receipt_notes.len() {
//             // calculate total with interest
//             let receipt = receipt_notes.get_unchecked(i);
//             let interest = math::calculate_interest(
//                 receipt.note.amount,
//                 receipt.note.epoch,
//                 current_epoch,
//                 EPOCH_LENGTH,
//                 interest_rate,
//             );
//             let total_amount = receipt.note.amount + interest;
//             // determine price
//             let price = prices.get_unchecked(i);
//             let asset_value_scaled = total_amount * price; // we can probably defer division until end to save on div ops
//             // accumulate total value
//             total_value_scaled += asset_value_scaled;
//             // collect asset address
//             assets.push(receipt.note.asset);
//         }
//     }
//     let total_value = total_value_scaled / math::PRICE_BASE;
//     (total_value, assets)
// }


// /**
//  * Get the total value contained in all receipt notes, weighted by LTV's
//  * todo: constrain amount of notes provided to be exact number
//  * todo: can we use pop_capsule to make this more efficient
//  *
//  * @param receipt_storage - The set of receipt notes to evaluate
//  * @param interest_rate - The interest rate to apply to the receipts
//  * @param prices - The asserted of the assets in the receipts
//  * @return
//  *     - the total value of the receipts weighted by LTV
//  *     - the list of asset addresses in the receipts
//  */
// #[contract_library_method]
// pub fn get_receipt_amount_ltv_weighted(
//     context: &mut PrivateContext,
//     receipt_storage: PrivateSet<ReceiptNote, &mut PrivateContext>,
//     ltv_storage: Map<AztecAddress, PublicImmutable<u128, &mut PrivateContext>, &mut PrivateContext>,
//     interest_rate: u128,
//     prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
// ) -> (u128, BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>) {
//     // 1. Get all the notes for the depositor
//     // enforce sorting asset addresses by ascending to match prices order
//     let opts = NoteGetterOptions::new().set_limit(MAX_ASSETS_PER_ACCOUNT).sort(
//         ReceiptNote::properties().asset,
//         SortOrder.ASC,
//     );
//     let receipt_notes = receipt_storage.get_notes(opts);
//     assert(prices.len() == receipt_notes.len(), "Mismatched prices and receipts lengths");
//     // 2. get current epoch
//     let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
//     // 3. Iterate through, build asset map and ltvs
//     let mut assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT> = BoundedVec::new();
//     for i in 0..MAX_ASSETS_PER_ACCOUNT {
//         if i < receipt_notes.len() {
//             let receipt = receipt_notes.get_unchecked(i);
//             assets.push(receipt.note.asset);
//         }
//     }
//     let ltvs = _get_ltvs(assets, ltv_storage);
//     // 4. iterate through and determine values per asset
//     let mut total_value_scaled: u128 = 0;
//     for i in 0..MAX_ASSETS_PER_ACCOUNT {
//         if i < receipt_notes.len() {
//             // calculate total with interest
//             let receipt = receipt_notes.get_unchecked(i);
//             let interest = math::calculate_interest(
//                 receipt.note.amount,
//                 receipt.note.epoch,
//                 current_epoch,
//                 EPOCH_LENGTH,
//                 interest_rate,
//             );
//             let total_amount = receipt.note.amount + interest;
//             debug_log_format("collateral amount: {0}", [total_amount as Field]);

//             // determine price
//             let price = prices.get_unchecked(i);

//             let asset_value_scaled = total_amount * price;
//             // apply LTV weighting
//             let ltv = ltvs.get_unchecked(i);
//             let asset_value_scaled = asset_value_scaled * ltv / math::LTV_BASE;
//             // accumulate total value
//             total_value_scaled += asset_value_scaled as u128;
//         }
//     }
//     let total_value = total_value_scaled / math::PRICE_BASE;
//     (total_value, assets)
// }


// // Ensures that either no note was found or one note matches
// pub fn filter_to_asset_receipt(
//     retrieved_notes: [Option<RetrievedNote<ReceiptNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
//     asset_address: AztecAddress,
// ) -> [Option<RetrievedNote<ReceiptNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
//     let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];

//     // let mut found = [false; N];

//     // there should only be one matching note at most
//     // so we don't loop over MAX_NOTE_HASH_READ_REQUESTS_PER_CALL
//     let retrieved_note = retrieved_notes[0];
//     if retrieved_note.is_some() {
//         let note = retrieved_note.unwrap_unchecked().note;
//         assert(note.asset == asset_address, "mismatch asset address in receipt");
//         selected[0] = retrieved_notes[0];
//     }

//     selected
// }

