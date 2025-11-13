use aztec::{
    macros::notes::note,
    oracle::random::random,
    context::PrivateContext,
    protocol_types::{
        traits::{Deserialize, Serialize, Packable, ToField},
        address::AztecAddress,
    },  
};
use poseidon::poseidon2::Poseidon2;


#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct ConfigNote {
    pub owner: AztecAddress,
    pub holder_commitment: Field,
    pub pool: AztecAddress,
    pub randomness: Field,
}

impl ConfigNote {
    pub fn new(
        owner: AztecAddress,
        pool: AztecAddress,
    ) -> Self {
        let randomness = unsafe { random() };
        let holder_commitment = Self::compute_holder_commitment(owner, randomness);
        Self {
            owner,
            holder_commitment,
            pool,
            randomness,
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