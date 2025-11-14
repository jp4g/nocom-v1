use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

#[derive(Deserialize, Eq, Serialize, Packable)]
#[note]
pub struct ReceiptNote {
    owner: AztecAddress,
    randomness: Field,
    pub asset: AztecAddress,
    pub amount: u128,
    pub epoch: u64,
}

/**
 * Tracks the amount and epoch for a given asset type (and whether is collateral or borrowed)
 */
impl ReceiptNote {
    pub fn new(owner: AztecAddress, asset: AztecAddress, amount: u128, epoch: u64) -> Self {
        let randomness = unsafe { random() };
        Self { owner, asset, randomness, amount, epoch }
    }
}
