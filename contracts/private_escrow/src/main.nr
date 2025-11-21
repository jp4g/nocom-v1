use aztec::macros::aztec;

pub mod types;
pub mod test;

#[aztec]
pub contract NocomEscrowV1 {
    use crate::types::config_note::ConfigNote;
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable,
    };
    use nocom_pool::NocomLendingPoolV1;
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

    /**
     * Supply collateral
     */
    #[external("private")]
    fn supply_collateral(asset_address: AztecAddress, amount: u128, authwit_nonce: Field) {
        // 1. get config
        let config = storage.config.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender().unwrap();

        // 2. ensure caller is escrow owner
        config.assert_holder(&mut context);

        // 4. initiate deposit into the lending pool
        NocomLendingPoolV1::at(config.pool)
            .deposit_private(asset_address, amount, caller, authwit_nonce)
            .call(&mut context);
    }

    /**
     * Withdraw collateral
     */
    #[external("private")]
    fn withdraw_collateral(
        recipient_address: AztecAddress,
        asset_address: AztecAddress,
        amount: u128,
        collateral_prices: BoundedVec<u128, NocomLendingPoolV1::MAX_ASSETS_PER_ACCOUNT>,
        debt_prices: BoundedVec<u128, NocomLendingPoolV1::MAX_ASSETS_PER_ACCOUNT>,
    ) {
        // 1. get config
        let config = storage.config.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender().unwrap();

        // 2. ensure caller is escrow owner
        config.assert_holder(&mut context);

        // 3. create partial note to receive tokens to
        let partial_note_commitment = Token::at(asset_address)
            .initialize_transfer_commitment(recipient_address, config.pool)
            .call(&mut context);
        // 3. initiate withdrawal from the lending pool
        NocomLendingPoolV1::at(config.pool)
            .withdraw_private(
                asset_address,
                amount,
                collateral_prices,
                debt_prices,
                partial_note_commitment,
            )
            .call(&mut context);
    }

    #[external("private")]
    fn borrow(
        receipient_address: AztecAddress,
        asset_address: AztecAddress,
        amount: u128,
        collateral_prices: BoundedVec<u128, NocomLendingPoolV1::MAX_ASSETS_PER_ACCOUNT>,
        debt_prices: BoundedVec<u128, NocomLendingPoolV1::MAX_ASSETS_PER_ACCOUNT>,
    ) {
        // 1. get config
        let config = storage.config.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender().unwrap();

        // 2. ensure caller is escrow owner
        config.assert_holder(&mut context);

        // 3. create partial note to receive tokens to
        let partial_note_commitment = Token::at(asset_address)
            .initialize_transfer_commitment(receipient_address, config.pool)
            .call(&mut context);
        // 3. initiate withdrawal from the lending pool
        NocomLendingPoolV1::at(config.pool)
            .borrow_private(
                asset_address,
                context.msg_sender().unwrap(),
                amount,
                collateral_prices,
                debt_prices,
                partial_note_commitment,
            )
            .call(&mut context);
    }

    #[external("private")]
    fn repay(asset_address: AztecAddress, amount: u128, authwit_nonce: Field) {
        // 1. get config
        let config = storage.config.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender().unwrap();

        // 2. ensure caller is escrow owner
        config.assert_holder(&mut context);

        // 3. initiate repayment into the lending pool
        NocomLendingPoolV1::at(config.pool)
            .repay_private(asset_address, amount, caller, authwit_nonce)
            .call(&mut context);
    }

    /**
     * Borrow collateral
     */
    #[external("private")]
    fn transfer_callback(amount: u128, asset: AztecAddress) {
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
