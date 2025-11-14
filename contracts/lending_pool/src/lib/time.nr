use aztec::context::PrivateContext;

// privately determine the next epoch and enforce tx inclusion before then
// todo: could make it dynamically advance if timestamp is too close?
pub fn get_next_epoch(context: &mut PrivateContext, epoch_length: u64) -> u64 {
    // get the anchor timestamp
    let anchor_timestamp = context.anchor_block_header.global_variables.timestamp;
    let include_by_timestamp = context.include_by_timestamp;

    // ceil(div(a, b)) = (a + b - 1) / b
    let next_epoch = ((anchor_timestamp + epoch_length - 1) / epoch_length);
    let next_epoch_boundary = next_epoch * epoch_length;

    // constrain transaction to deliver before next epoch starts
    if include_by_timestamp > next_epoch_boundary {
        context.set_include_by_timestamp(next_epoch_boundary);
    }

    next_epoch
}
