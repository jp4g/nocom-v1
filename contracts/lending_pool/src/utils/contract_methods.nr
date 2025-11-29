use aztec::{
    context::PrivateContext,
    messages::message_delivery::MessageDelivery,
    protocol_types::address::AztecAddress,
    state_vars::PrivateMutable,
};
use crate::{
    utils::{
        constants::{BORROW_INTEREST, EPOCH_LENGTH, LEND_INTEREST},
        math, time
    },
    types::{loan_note::LoanNote, collateral_note::CollateralNote}
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
 * @param loan_storage - The storage for the loan note
 * @return (principal, interest) - the principal and accrued interest amounts
 */
#[contract_library_method]
pub fn _get_loan_value(
    context: &mut PrivateContext,
    loan_storage: PrivateMutable<LoanNote, &mut PrivateContext>,
    interest_rate: u128,
) -> (u128, u128) {
    // 1. get current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - 1;

    // 2. get and re-emit the loan note
    let emission = loan_storage.get_note();
    emission.emit(emission.content.note.owner, MessageDelivery.CONSTRAINED_ONCHAIN); // re-emit

    // 3. calculate accrued interest
    let principal = emission.content.note.amount;
    let start_epoch = emission.content.note.epoch;
    let interest = math::calculate_interest(
        principal,
        start_epoch,
        current_epoch,
        EPOCH_LENGTH,
        interest_rate,
    );
    (principal, interest)
}

/**
 * Updates (or initializes) a loan note in storage
 * @NOTICE: can be used for both adding to or subtracting from a loan note
 * @NOTICE: used for both lending and borrowing, using interest rate param
 *
 * @param context - The private context
 * @param loan_storage - The storage for the loan note
 * @param owner - The owner of the loan note
 * @param amount_added - The amount to add to the loan note
 * @param amount_subbed - The amount to subtract from the loan note
 * @param interest_rate - The interest rate to use for calculating accrued interest
 * @return - the total amount in the latest loan note
 */
#[contract_library_method]
pub fn _update_loan(
    context: &mut PrivateContext,
    loan_storage: PrivateMutable<LoanNote, &mut PrivateContext>,
    owner: AztecAddress,
    amount_added: u128,
    amount_subbed: u128,
    interest_rate: u128,
    is_borrow: bool,
) -> u128 {
    // 1. determine the current epoch
    let current_epoch = time::get_next_epoch(context, EPOCH_LENGTH) - is_borrow as u64;
    
    // 2. update or insert loan note
    let emission = loan_storage.initialize_or_replace(|existing_note| {
        let updated_amount = if (existing_note.is_some()) {
            // calclulate existing amount with interest
            let note = existing_note.unwrap_unchecked();
            let principal = note.amount;
            let epoch = note.epoch;
            let interest = math::calculate_interest(
                principal,
                epoch,
                current_epoch,
                EPOCH_LENGTH,
                interest_rate,
            );
            let existing_amount = principal + interest;
            existing_amount + amount_added - amount_subbed
        } else {
            amount_added - amount_subbed
        };
        
        // create new note
        LoanNote::new(owner, updated_amount, current_epoch)
    });

    // 3. capture new amount and emit new note
    emission.emit(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    emission.content.note.amount
}
