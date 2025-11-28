use aztec::{
    context::{PrivateContext, PublicContext},
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
    utils::{
        constants::{BORROW_INTEREST, EPOCH_LENGTH, LEND_INTEREST},
        math, time
    },
    NocomLendingPoolV1::self,
    types::{
        loan_note::LoanNote,
        collateral_note::CollateralNote,
    },
};

/**
 * Get a collateral note's amount and re-emit it
 * @NOTICE: reading a PrivateMutable destroys the note, so this function handles reemission
 * @NOTICE: we do not check for initialization on collateral notes - if they don't exist,
 *          any function calling this should fail
 *
 * @param collateral_storage - The storage for the collateral note
 * @param owner - The owner of the collateral note
 * @return The amount of collateral the owner has deposited
 */
#[contract_library_method]
pub fn _get_collateral_reemitted(
    collateral_storage: PrivateMutable<CollateralNote, &mut PrivateContext>,
    owner: AztecAddress,
) -> u128 {
    let emission = collateral_storage.get_note();
    emission.emit(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    emission.content.note.amount
}

/**
 * Get a loan note's amount and re-emit it in private context
 * NOTE: we cannot extract interest from PrivateMutable.replace() so we must read, re-emit,
 *       and then replace (which reads again) unfortunately. TODO: solve if possible
 *
 * @param receipt_storage - The storage for the loan note
 * @return (principal, interest) - the principal and accrued interest amounts
 */
#[contract_library_method]
pub fn _get_loan_value(
    context: &mut PrivateContext,
    receipt_storage: PrivateMutable<LoanNote, &mut PrivateContext>
) -> (u128, u128) {
    // 1. get current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;

    // 2. get and re-emit the loan note
    let emission = receipt_storage.get_note();
    emission.emit(emission.content.note.owner, MessageDelivery.CONSTRAINED_ONCHAIN); // re-emit

    // 3. calculate accrued interest
    let principal = emission.content.note.amount;
    let start_epoch = emission.content.note.epoch;
    let interest = math::calculate_interest(
        principal,
        start_epoch,
        current_epoch,
        EPOCH_LENGTH,
        BORROW_INTEREST,
    );
    (principal, interest)
}

#[contract_library_method]
pub fn _update_loan(
    context: &mut PrivateContext,
    receipt_storage: PrivateMutable<LoanNote, &mut PrivateContext>,
    owner: AztecAddress,
    amount_added: u128,
    amount_subbed: u128,
    interest_rate: u128,
) -> u128 {
    // 1. determine the current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;
    
    // 2. update or insert receipt note
    let emission = receipt_storage.replace(|existing_receipt| {
        // calclulate existing amount with interest
        let principal = existing_receipt.amount;
        let epoch = existing_receipt.epoch;
        let interest = math::calculate_interest(
            principal,
            epoch,
            current_epoch,
            EPOCH_LENGTH,
            interest_rate,
        );
        let existing_amount = principal + interest;
        let updated_amount = existing_amount + amount_added - amount_subbed;
        // create new note
        LoanNote::new(owner, updated_amount, current_epoch)
    });

    // 3. capture new amount and emit new note
    emission.emit(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    emission.content.note.amount
}
