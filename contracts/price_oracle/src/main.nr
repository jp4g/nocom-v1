use aztec::macros::aztec;

#[aztec]
pub contract MockPriceFeed {
    use aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::{Map, PublicMutable},
    };

    global MAX_ASSETS_PER_CALL: u32 = 4; // just set based on nocom for prototype

    // Storage structure, containing all storage, and specifying what slots they use.
    #[storage]
    struct Storage<Context> {
        assets: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        admin: PublicMutable<AztecAddress, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        storage.admin.write(admin);
    }

    #[external("public")]
    fn change_admin(new_admin: AztecAddress) {
        let admin = storage.admin.read();
        assert(context.msg_sender().unwrap() == admin, "Only admin can change admin");
        storage.admin.write(new_admin);
    }

    // set a single price
    #[external("public")]
    fn set_price(asset_address: AztecAddress, price: u128) {
        let admin = storage.admin.read();
        assert(context.msg_sender().unwrap() == admin, "Only admin can set prices");
        storage.assets.at(asset_address).write(price);
    }

    // get a single prices
    #[external("public")]
    #[view]
    fn get_price(asset_address: AztecAddress) -> u128 {
        storage.assets.at(asset_address).read()
    }

    // set multiple prices
    #[external("public")]
    fn set_prices(
        asset_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_CALL>,
        prices: BoundedVec<u128, MAX_ASSETS_PER_CALL>,
    ) {
        let admin = storage.admin.read();
        assert(context.msg_sender().unwrap() == admin, "Only admin can set prices");

        for i in 0..asset_addresses.len() {
            let asset_address = asset_addresses.get_unchecked(i);
            let price = prices.get_unchecked(i);
            storage.assets.at(asset_address).write(price);
        }
    }

    // get multiple prices
    #[external("public")]
    #[view]
    fn get_prices(
        asset_addresses: BoundedVec<AztecAddress, MAX_ASSETS_PER_CALL>,
    ) -> BoundedVec<u128, MAX_ASSETS_PER_CALL> {
        let mut prices: BoundedVec<u128, MAX_ASSETS_PER_CALL> = BoundedVec::new();
        for i in 0..asset_addresses.len() {
            if i < asset_addresses.len() {
                let asset_address = asset_addresses.get_unchecked(i);
                let price = storage.assets.at(asset_address).read();
                prices.push(price);
            }
        }
        prices
    }
}
