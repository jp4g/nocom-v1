use aztec::{
    context::PrivateContext,
    protocol_types::{
        traits::{Deserialize, Serialize, Packable, ToField},
        address::AztecAddress,
    },  
};

#[derive(Eq, Serialize, Deserialize, Packable)]
pub struct Config {
    pub admin: AztecAddress,
    pub oracle_address: AztecAddress,
    pub asset_token_address: AztecAddress,
    pub receipt_token_address: AztecAddress,
    pub stable_token_address: AztecAddress,
    pub ltv: u128,
}