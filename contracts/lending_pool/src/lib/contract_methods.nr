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
    NocomLendingPoolV1::{self, EPOCH_LENGTH, MAX_ASSETS_PER_ACCOUNT},
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
    depositor: AztecAddress,
    context: &mut PrivateContext,
    deposit_receipt_storage: Map<AztecAddress, PrivateMutable<ReceiptNote, &mut PrivateContext>, &mut PrivateContext>,
    loan_receipt_storage: Map<AztecAddress, PrivateMutable<ReceiptNote, &mut PrivateContext>, &mut PrivateContext>,
    asserted_price: u128,
) -> u128 {
    // 1. get receipts
    let deposit_receipt_emission = deposit_receipt_storage.at(depositor).get_note();
    let deposit_receipt = deposit_receipt_emission.content.note;
    let loan_receipt_emission = loan_receipt_storage.at(depositor).get_note();
    let loan_receipt = loan_receipt_emission.content.note;
    // 2. 
    0
}

// todo: constrain amount of notes provided to be exact number
#[contract_library_method]
pub fn get_receipt_amount(
    depositor: AztecAddress,
    context: &mut PrivateContext,
    receipt_storage: Map<AztecAddress, PrivateSet<ReceiptNote, &mut PrivateContext>, &mut PrivateContext>,
    interest_rate: u64,
    prices: BoundedVec<u128, MAX_ASSETS_PER_ACCOUNT>
) -> u128 {
    // 1. Get all the notes for the depositor
    // enforce sorting asset addresses by ascending to match prices order
    let opts = NoteGetterOptions::new()
        .set_limit(MAX_ASSETS_PER_ACCOUNT)
        .sort(ReceiptNote::properties().asset, SortOrder.ASC);
    let receipt_notes = receipt_storage.at(depositor).get_notes(opts);
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
            let asset_value = (amount * price / math::SCALE) as u128;
            // accumulate total value
            total_value += asset_value;
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