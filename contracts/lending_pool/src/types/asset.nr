use aztec::{
    context::PrivateContext,
    protocol_types::{
        traits::{Deserialize, Serialize, Packable, ToField},
        address::AztecAddress,
    },  
};

#[derive(Eq, Serialize, Deserialize, Packable)]
pub struct Asset {
    pub asset_ltv: u128,
}