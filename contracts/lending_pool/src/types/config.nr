use aztec::{
    context::PrivateContext,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize, ToField}},
};

#[derive(Eq, Serialize, Deserialize, Packable)]
pub struct Config {
    pub admin: AztecAddress,
    pub oracle_address: AztecAddress,
    pub stable_token_address: AztecAddress,
    pub treasury_address: AztecAddress,
}
