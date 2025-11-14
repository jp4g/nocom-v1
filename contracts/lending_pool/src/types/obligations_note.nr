use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

/**
 * Used to constrain the number of notes acquired from a set
 */
#[derive(Deserialize, Eq, Serialize, Packable)]
#[note]
pub struct ObligationsNote {
    owner: AztecAddress,
    randomness: Field,
    pub num_collateral_assets: u32,
    pub num_borrowed_assets: u32,
}

impl ObligationsNote {
    pub fn new(owner: AztecAddress) -> Self {
        let randomness = unsafe { random() };
        Self { owner, randomness, num_collateral_assets: 0, num_borrowed_assets: 0 }
    }
}
