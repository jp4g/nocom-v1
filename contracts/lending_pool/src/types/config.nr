use aztec::{
    context::PrivateContext,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize, ToField}},
};

#[derive(Eq, Serialize, Deserialize, Packable)]
pub struct Config {
    // address of admin who can control contract
    pub admin_address: AztecAddress,
    // address of the price oracle contract
    pub price_oracle_address: AztecAddress,
    // address of the treasury where protocol fees accrue
    pub treasury_address: AztecAddress,
    // address of the token supplied as collateral for borrowing
    pub collateral_token_address: AztecAddress,
    // address of the token lent out
    pub loaned_token_address: AztecAddress,
    // max loan-to-value allowed
    pub ltv: u128,
    // threshold at which positions can be liquidated
    pub liquidation_threshold: u128
}
