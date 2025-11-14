use aztec::{
    context::PrivateContext,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize, ToField}},
};

#[derive(Eq, Serialize, Deserialize, Packable)]
pub struct Asset {
    pub asset_ltv: u128,
}
