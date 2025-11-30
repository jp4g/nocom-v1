use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

#[derive(Deserialize, Eq, Serialize, Packable)]
#[note]
pub struct CollateralNote {
    pub owner: AztecAddress,
    randomness: Field,
    pub amount: u128,
}

/**
 * Tracks the amount of collateral deposited
 */
impl CollateralNote {
    pub fn new(owner: AztecAddress, amount: u128) -> Self {
        let randomness = unsafe { random() };
        Self { owner, randomness, amount }
    }
}
