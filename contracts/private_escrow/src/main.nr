use aztec::macros::aztec;

pub mod types;
// pub mod test;

#[aztec]
pub contract NocomEscrowV1 {
    use crate::types::config_note::ConfigNote;
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable,
    };
    use token_contract::Token;

    #[storage]
    struct Storage<Context> {
        config: PrivateImmutable<ConfigNote, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(pool_address: AztecAddress) {
        let self_address = context.this_address();

        // Create config note
        let config = ConfigNote::new(context.msg_sender().unwrap(), pool_address);

        // emit to any holders of escrow key
        storage.config.initialize(config).emit(self_address, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // fn calculate_collateral() -> u128 {
    //     storage.con
    // }

    // /**
    //  * Supply collateral
    //  */
    // #[external("private")]
    // fn supply_collateral(_nonce: Field) {
    //     let config = storage.config.get_note();
    //     let self_address = context.this_address();
    //     let caller = context.msg_sender().unwrap();

    //     // transfer tokens in
    //     Token::at(config.sell_token_address)
    //         .transfer_private_to_private(
    //             caller,
    //             self_address,
    //             config.sell_token_amount,
    //             _nonce
    //         )
    //         .call(&mut context);

    //     // emit nullifier to prevent multiple deposits
    //     let deposit_nullifier = config.get_nullifier(true);
    //     context.push_nullifier(deposit_nullifier);
    // }

    #[external("private")]
    fn deposit_collateral_callback(amount: u128, asset: AztecAddress) {
        // 1. check caller is pool
        let config = storage.config.get_note();
        assert(context.msg_sender().unwrap() == config.pool);

        // 2. transfer tokens in private-to-public
        Token::at(asset).transfer_private_to_public(context.this_address(), config.pool, amount, 0);
    }

    // /**
    //  * Fulfil an OTC order as a taker by transfering in the asked tokens and withdrawing the offered tokens
    //  *
    //  * @param _nonce - authwit nonce used in `transfer_private_to_private`
    //  */
    // #[external("private")]
    // fn fill_order(_nonce: Field) {
    //     let config = storage.config.get_note();
    //     let self_address = context.this_address();
    //     let caller = context.msg_sender().unwrap();

    //     // transfer ask tokens in
    //     Token::at(config.buy_token_address)
    //         .transfer_private_to_private(
    //             caller,
    //             self_address,
    //             config.buy_token_amount,
    //             _nonce
    //         )
    //         .call(&mut context);

    //     Token::at(config.buy_token_address)
    //         .transfer_private_to_commitment(
    //             self_address,
    //             config.partial_note,
    //             config.buy_token_amount,
    //             0
    //         )
    //         .call(&mut context);

    //     // transfer offer tokens out
    //     Token::at(config.sell_token_address)
    //         .transfer_private_to_private(
    //             self_address,
    //             caller,
    //             config.sell_token_amount,
    //             0
    //         )
    //         .call(&mut context);

    //     // emit nullifier to prevent multiple fills
    //     let fill_nullifier = config.get_nullifier(false);
    //     context.push_nullifier(fill_nullifier);
    // }

    // #[external("utility")]
    // unconstrained fn get_config() -> ConfigNote {
    //     storage.config.view_note()
    // }
}
