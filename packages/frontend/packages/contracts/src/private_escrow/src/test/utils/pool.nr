use aztec::test::helpers::txe_oracles;
use nocom_pool::utils::constants::EPOCH_LENGTH;

/**
 * Gets the next epoch number based on the last known block timestamp via TXE oracle
 */
unconstrained pub fn get_next_epoch() -> u64 {
    // get the timestamp of the last known block
    let last_timestamp = txe_oracles::get_last_block_timestamp();
    // ceil(div(a, b)) = (a + b - 1) / b
    ((last_timestamp + EPOCH_LENGTH - 1) / EPOCH_LENGTH)
}
