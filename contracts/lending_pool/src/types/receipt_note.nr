use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{
        address::AztecAddress,
        traits::{Serialize, Deserialize, Packable},
    },
};


#[derive(Deserialize, Eq, Serialize, Packable)]
#[note]
pub struct ReceiptNote {
    owner: AztecAddress,
    randomness: Field,
    pub amount: u128,
    pub epoch: u64
}

impl ReceiptNote {
    pub fn new(
        owner: AztecAddress,
        amount: u128,
        epoch: u64,
    ) -> Self {
        let randomness = unsafe { random() };
        Self {
            owner,
            randomness,
            amount,
            epoch,
        }
    }
}