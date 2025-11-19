// used to avoid cyclic dependencies
use aztec::{
    context::PrivateContext,
    protocol_types::{
        abis::function_selector::FunctionSelector, address::AztecAddress, traits::ToField,
    },
};

#[contract_library_method]
pub fn escrow_transfer_callback(
    context: &mut PrivateContext,
    escrow_address: AztecAddress,
    amount: u128,
    asset: AztecAddress,
) {
    let function_selector =
        comptime { FunctionSelector::from_signature("transfer_callback(u128,AztecAddress)") };
    context.static_call_private_function(
        escrow_address,
        function_selector,
        [amount as Field, asset.to_field()],
    );
}
