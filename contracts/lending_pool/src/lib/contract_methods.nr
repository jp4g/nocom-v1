use aztec::{
    protocol_types::address::AztecAddress,
    note::{
        note_getter_options::{NoteGetterOptions, SortOrder},
        note_interface::NoteProperties,
        retrieved_note::RetrievedNote,
    },
    context::PrivateContext,
    state_vars::{Map, PrivateMutable, PrivateSet}
};

use crate::{
    NocomLendingPoolV1::{
        self,
        EPOCH_LENGTH,
        MAX_ASSETS_PER_ACCOUNT,
        LEND_INTEREST,
        BORROW_INTEREST,
    },
    lib::{time, math},
    types::receipt_note::ReceiptNote,
};

pub struct Position {
    pub amount: u128,
    pub asset: AztecAddress
}

/**
 *
 * @return (amount, next_epoch)
 */
// #[contract_library_method]
// pub fn _combine_receipts(
//     depositor: AztecAddress,
//     context: &mut PrivateContext,
//     receipt_storage: Map<AztecAddress, PrivateMutable<ReceiptNote, &mut PrivateContext>, &mut PrivateContext>,
// ) -> (u128, u64) {
//     // 1. Get the current epoch & enforce delivery
//     let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
//     // 2. check if there is an existing deposit receipt
//     // todo: need to check if note exists first and also replace this after getting it
//     let current_receipt_emission = receipt_storage.at(depositor).get_note();
//     let current_receipt = current_receipt_emission.content.note;
//     // 3. If no existing receipt, return 0
//     if current_receipt.epoch == 0 {
//         (0, current_epoch)
//     } else {
//         // 4. calculate the amount of accrued interest
//         // note: hardcoded 4% rate of interest for now
//         let interest = math::InterestCalculator::new(4)
//         .calculate_accrued_interest(
//             current_receipt.amount,
//             current_receipt.epoch,
//             current_epoch
//         );
//         let total = current_receipt.amount + interest;
//         (total, current_epoch)
//     }
// }

/**
 * Calculate health factor for single asset
 */
#[contract_library_method]
pub fn _calculate_health_factor(
    context: &mut PrivateContext,
    deposit_receipt_set: PrivateSet<ReceiptNote, &mut PrivateContext>,
    collateral_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    ltvs: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    loan_receipt_set: PrivateSet<ReceiptNote, &mut PrivateContext>,
    debt_prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
) -> u128 {
    // 1. get collateral value
    let weighted_collateral_value = get_receipt_amount_ltv_weighted(
        context,
        deposit_receipt_set,
        LEND_INTEREST,
        collateral_prices,
        ltvs
    ) as Field;
    // 2. get debt value
    let debt_value = get_receipt_amount(
        context,
        loan_receipt_set,
        BORROW_INTEREST,
        debt_prices
    ) as Field;
    // 3. calculate health factor
    let health_factor = if debt_value == 0 {
        math::U128_MAX
    } else {
        ((weighted_collateral_value * math::SCALE) / debt_value) as u128
    };
    health_factor
}

// todo: constrain amount of notes provided to be exact number
#[contract_library_method]
pub fn get_receipt_amount(
    context: &mut PrivateContext,
    receipt_set: PrivateSet<ReceiptNote, &mut PrivateContext>,
    interest_rate: u64,
    prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>
) -> u128 {
    // 1. Get all the notes for the depositor
    // enforce sorting asset addresses by ascending to match prices order
    let opts = NoteGetterOptions::new()
        .set_limit(MAX_ASSETS_PER_ACCOUNT)
        .sort(ReceiptNote::properties().asset, SortOrder.ASC);
    let receipt_notes = receipt_set.get_notes(opts);
    assert(prices.len() == receipt_notes.len(), "Mismatched prices and receipts lengths");
    // 2. get current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
    // 3. iterate through and determine values per asset
    let mut total_value: u128 = 0;
    for i in 0..MAX_ASSETS_PER_ACCOUNT {
        if i < receipt_notes.len() {
            // calculate total with interest
            let receipt = receipt_notes.get_unchecked(i);
            let amount = math::InterestCalculator::new(interest_rate)
                .calculate_interest(
                    receipt.note.amount,
                    receipt.note.epoch,
                    current_epoch
                ) as Field;
            // determine price
            let price = prices.get_unchecked(i) as Field;
            let asset_value = amount * price / math::SCALE;
            // accumulate total value
            total_value += asset_value as u128;
        }
    }
    total_value
}

// todo: constrain amount of notes provided to be exact number
#[contract_library_method]
pub fn get_receipt_amount_ltv_weighted(
    context: &mut PrivateContext,
    receipt_set: PrivateSet<ReceiptNote, &mut PrivateContext>,
    interest_rate: u64,
    prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
    ltvs: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>,
) -> u128 {
    // 1. Get all the notes for the depositor
    // enforce sorting asset addresses by ascending to match prices order
    let opts = NoteGetterOptions::new()
        .set_limit(MAX_ASSETS_PER_ACCOUNT)
        .sort(ReceiptNote::properties().asset, SortOrder.ASC);
    let receipt_notes = receipt_set.get_notes(opts);
    assert(prices.len() == receipt_notes.len(), "Mismatched prices and receipts lengths");
    // 2. get current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
    // 3. iterate through and determine values per asset
    let mut total_value: u128 = 0;
    for i in 0..MAX_ASSETS_PER_ACCOUNT {
        if i < receipt_notes.len() {
            // calculate total with interest
            let receipt = receipt_notes.get_unchecked(i);
            let amount = math::InterestCalculator::new(interest_rate)
                .calculate_interest(
                    receipt.note.amount,
                    receipt.note.epoch,
                    current_epoch
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
    total_value
}

// #[contract_library_method]
// pub unconstrained fn _check_receipt_initialized(
//     depositor: AztecAddress,
//     asset: AztecAddress,
//     is_deposit: bool,
// ) -> bool {
//     // get map 1 slot
//     let depositor_map_slot = if is_deposit {
//         NocomLendingPoolV1::storage_layout().deposit_receipt_storage.slot
//     } else {
//         NocomLendingPoolV1::storage_layout().loan_receipt_storage.slot
//     }
    
//     let epoch_slot = derive_storage_slot_in_map(map_slot, epoch);
//     // compute the initialization nullifier
//     let nullifier = poseidon2_hash_with_separator(
//         [epoch_slot],
//         GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
//     );
//     // check with oracle call if it exists and return
//     unsafe { check_nullifier_exists(nullifier) }
// }