use aztec::macros::aztec;

pub mod types;
// pub mod test;

#[aztec]
pub contract NocomEscrowV1 {
    use crate::types::config_note::ConfigNote;
    use aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
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
    fn constructor(
        pool_address: AztecAddress,
        collateral_token_address: AztecAddress,
        loaned_token_address: AztecAddress,
    ) {
        let caller = context.msg_sender().unwrap();
        let self_address = context.this_address();

        // Create config note
        let config = ConfigNote::new(
            caller,
            pool_address,
            collateral_token_address,
            loaned_token_address
        );
        // emit to any holders of escrow key
        storage.config.initialize(config).emit(self_address, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    /**
     * Register this escrow 
     */
    #[external("private")]
    fn register(signature: [u8; 64]) {
        // 1. check caller is escrow owner
        let config = storage.config.get_note();
        config.assert_holder(&mut context);

        // 2. register the escrow in the lending pool
        NocomLendingPoolV1::at(config.pool)
            .register(signature)
            .call(&mut context);
    }

    #[external("private")]
    fn supply_collateral(
        amount: u128,
        authwit_nonce: Field,
    ) {
        // 1. check caller is escrow owner
        let config = storage.config.get_note();
        let caller = context.msg_sender().unwrap();
        config.assert_holder(&mut context);

        // 2. initiate deposit into the lending pool
        NocomLendingPoolV1::at(config.pool)
            .collateralize_private(caller, amount)
            .call(&mut context);
        
        // 3. transfer collateral tokens into the escrow
        Token::at(config.collateral_token_address)
            .transfer_private_to_private(caller, context.this_address(), amount, authwit_nonce)
            .call(&mut context);
    }

    #[external("private")]
    fn borrow(
        amount: u128,
        asserted_collateral_token_price: u128,
        asserted_debt_token_price: u128,
    ) {
        // 1. check caller is escrow owner
        let config = storage.config.get_note();
        let caller = context.msg_sender().unwrap();
        config.assert_holder(&mut context);

        // 2. get partial note commitment to receive borrowed tokens
        let partial_note_commitment = Token::at(config.loaned_token_address)
            .initialize_transfer_commitment(caller, config.pool)
            .call(&mut context);
        
        // 3. initiate borrow from the lending pool
        NocomLendingPoolV1::at(config.pool)
            .borrow_private(
                caller, // todo: remove once partial note working
                amount,
                partial_note_commitment,
                asserted_collateral_token_price,
                asserted_debt_token_price,
            )
            .call(&mut context);
    }

    #[external("private")]
    fn withdraw_collateral(
        amount: u128,
        asserted_collateral_token_price: u128,
        asserted_loaned_token_price: u128,
    )  {
        // 1. check caller is escrow owner
        let config = storage.config.get_note();
        let caller = context.msg_sender().unwrap();
        config.assert_holder(&mut context);
        
        // 2. initiate withdrawal from the lending pool
        NocomLendingPoolV1::at(config.pool)
            .withdraw_collateral_private(
                amount,
                asserted_collateral_token_price,
                asserted_loaned_token_price,
            )
            .call(&mut context);
        
        // 3. transfer collateral back to the caller
        Token::at(config.collateral_token_address)
            .transfer_private_to_private(context.this_address(), caller, amount, 0)
            .call(&mut context);
    }

    #[external("private")]
    fn repay(amount: u128, authwit_nonce: Field) {
        // 1. check caller is escrow owner
        let config = storage.config.get_note();
        let caller = context.msg_sender().unwrap();
        config.assert_holder(&mut context);

        // 2. initiate repayment in the lending pool
        NocomLendingPoolV1::at(config.pool)
            .repay_loan_private(caller, amount, authwit_nonce)
            .call(&mut context);
    }

    #[external("private")]
    fn liquidate(
        amount: u128,
        liquidation_authwit_nonce: Field,
        asserted_collateral_token_price: u128,
        asserted_debt_token_price: u128,
    ) {
        // 1. get config
        let config = storage.config.get_note();
        let caller = context.msg_sender().unwrap();
        let self_address = context.this_address();
        
        // 2. initiate liquidation in the lending pool
        let (
            liquidator_collateral_amount,
            protocol_fee,
            treasury_address
        ) = NocomLendingPoolV1::at(config.pool)
            .liquidate_private(
                amount,
                caller,
                liquidation_authwit_nonce,
                asserted_collateral_token_price,
                asserted_debt_token_price,
            ).call(&mut context);

        // 3. transfer seized collateral share to liquidator
        Token::at(config.collateral_token_address)
            .transfer_private_to_private(
                self_address,
                caller,
                liquidator_collateral_amount,
                0
            )
            .call(&mut context);
        Token::at(config.collateral_token_address)
            .transfer_private_to_private(
                self_address,
                treasury_address,
                protocol_fee,
                0
            )
            .call(&mut context);
    }

    #[external("utility")]
    unconstrained fn get_config() -> ConfigNote {
        storage.config.view_note()
    }
}
