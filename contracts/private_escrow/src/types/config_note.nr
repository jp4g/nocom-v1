use aztec::{
    context::PrivateContext,
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize, ToField}},
};
use poseidon::poseidon2::Poseidon2;

#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct ConfigNote {
    pub owner: AztecAddress,
    pub holder_commitment: Field,
    pub pool: AztecAddress,
    pub collateral_token_address: AztecAddress,
    pub loaned_token_address: AztecAddress,
    pub randomness: Field,
}

impl ConfigNote {
    pub fn new(
        owner: AztecAddress,
        pool: AztecAddress,
        collateral_token_address: AztecAddress,
        loaned_token_address: AztecAddress,
    ) -> Self {
        // Safety: random value supplied by client to blind hash
        let randomness = unsafe { random() };
        let holder_commitment = Self::compute_holder_commitment(owner, randomness);
        Self {
            owner,
            holder_commitment,
            pool,
            collateral_token_address,
            loaned_token_address,
            randomness
        }
    }

    pub fn compute_holder_commitment(address: AztecAddress, secret: Field) -> Field {
        Poseidon2::hash([address.to_field(), secret], 2)
    }

    pub fn assert_holder(self, context: &mut PrivateContext) {
        let caller = context.msg_sender().unwrap();
        let computed_commitment = Self::compute_holder_commitment(caller, self.randomness);
        assert(self.holder_commitment == computed_commitment);
    }
}
