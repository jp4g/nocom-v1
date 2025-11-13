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
pub struct DepositReceiptNote {
    owner: AztecAddress,
    randomness: Field,
    pub deposit_amount: u128,
    pub epoch: u64
}

impl DepositReceiptNote {
    pub fn new(
        owner: AztecAddress,
        deposit_amount: u128,
        epoch: u64,
    ) -> Self {
        let randomness = unsafe { random() };
        Self {
            owner,
            randomness,
            deposit_amount,
            epoch,
        }
    }
}