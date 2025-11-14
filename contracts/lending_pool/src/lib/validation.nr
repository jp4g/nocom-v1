use crate::NocomLendingPoolV1::MAX_ASSETS_PER_ACCOUNT;
use aztec::protocol_types::{address::AztecAddress, traits::ToField};

pub fn ensure_asset_ordering(assets: BoundedVec<AztecAddress, MAX_ASSETS_PER_ACCOUNT>) {
    let mut last_value = 0;
    for i in 0..assets.len() {
        if i < assets.len() {
            let asset_address = assets.get_unchecked(i).to_field() as u128;
            assert(asset_address > last_value, "ASSET_ADDRESSES_NOT_SORTED");
            last_value = asset_address;
        }
    }
}
