use aztec::{
    context::PrivateContext,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize, ToField}},
};

#[derive(Eq, Serialize, Deserialize, Packable)]
pub struct Utilization {
    pub total_borrowed: u128,
    pub total_supplied: u128,
}

impl Utilization {
    pub fn new(total_borrowed: u128, total_supplied: u128) -> Self {
        Self { total_borrowed, total_supplied }
    }

    pub fn update(&mut self, borrowed: u128, supplied: u128) {
        self.total_borrowed = borrowed;
        self.total_supplied = supplied;
    }

    pub fn get_utilization_rate(self) -> u128 {
        // todo: this is pretty unsafe but it is prototyped
        if self.total_supplied == 0 {
            0
        } else {
            self.total_borrowed / self.total_supplied
        }
    }
}
