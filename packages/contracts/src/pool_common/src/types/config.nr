use aztec::{
    context::PrivateContext,
    protocol_types::{
        address::AztecAddress,
        traits::{Deserialize, Packable, Serialize, ToField}
    },
};
use poseidon::poseidon2::Poseidon2;
use std::embedded_curve_ops::EmbeddedCurvePoint;

#[derive(Eq, Serialize, Deserialize, Packable)]
pub struct Config {
    // address of admin who can control contract
    pub admin_address: AztecAddress,
    // liquidator schnorr pubkey
    pub liquidator_pubkey_x: Field,
    pub liquidator_pubkey_y: Field,
    // address of the price oracle contract
    pub price_oracle_address: AztecAddress,
    // address of the treasury where protocol fees accrue
    pub treasury_address: AztecAddress,
    // address of the token supplied as collateral for borrowing
    pub collateral_token_address: AztecAddress,
    // address of the token lent out
    pub loaned_token_address: AztecAddress,
    // max loan-to-value allowed
    pub max_ltv: u128,
    // threshold at which positions can be liquidated
    pub liquidation_threshold: u128
}

impl Config {
    pub fn signed_by_liquidator(
        self,
        pool_address: AztecAddress,
        escrow_address: AztecAddress,
        signature: [u8; 64]
    ) {
        let pubkey = EmbeddedCurvePoint {
            x: self.liquidator_pubkey_x,
            y: self.liquidator_pubkey_y,
            is_infinite: false
        };
        let preimage = [
            pool_address.to_field(),
            escrow_address.to_field(),
            self.admin_address.to_field()
        ];
        let payload: [u8; 32] = Poseidon2::hash(preimage, 3).to_le_bytes();
        schnorr::verify_signature(pubkey, signature, payload);
    }
}