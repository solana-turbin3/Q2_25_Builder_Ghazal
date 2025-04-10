//////////////////////
// src/lib.rs
//////////////////////

mod programs; // We have a "programs" folder with Turbin3_prereq.rs in it.

// Import from our IDL-generated module:
use crate::programs::Turbin3_prereq::{
    // Generated from your new IDL with "name": "turbine_prereq".
    TurbinePrereqProgram,

    // The argument struct for the "complete" instruction
    CompleteArgs,

    // We won't use `UpdateArgs` unless you plan to call "update"
    // (remove this line if you're not using the update instruction).
    // UpdateArgs,
};

use solana_client::rpc_client::RpcClient;
use solana_program::{system_instruction::transfer, system_program};
use solana_sdk::{
    signature::{Keypair, Signer, read_keypair_file},
    pubkey::Pubkey,
    hash::hash,
    transaction::Transaction,
    message::Message,
};
use std::{
    io::{self, BufRead},
};
use bs58;

/// Devnet endpoint
const RPC_URL: &str = "https://api.devnet.solana.com";

#[cfg(test)]
mod tests {
    use super::*;

    // 1. Generate a new Keypair
    #[test]
    fn keygen() {
        let kp = Keypair::new();
        println!("New Solana wallet pubkey: {}", kp.pubkey());
        println!("Save the following bytes as JSON: {:?}", kp.to_bytes());
    }

    // OPTIONAL: Convert base58 -> wallet file
    #[test]
    fn base58_to_wallet() {
        println!("Enter base58 private key:");
        let stdin = io::stdin();
        let base58_str = stdin.lock().lines().next().unwrap().unwrap();

        let bytes = bs58::decode(base58_str).into_vec().unwrap();
        println!("Wallet file bytes: {:?}", bytes);
    }

    // OPTIONAL: Convert wallet file -> base58
    #[test]
    fn wallet_to_base58() {
        println!("Enter wallet file bytes, e.g. [1,2,3,...]");
        let stdin = io::stdin();
        let line = stdin.lock().lines().next().unwrap().unwrap();
        let trimmed = line.trim_start_matches('[').trim_end_matches(']');
        let wallet_bytes = trimmed
            .split(',')
            .map(|s| s.trim().parse::<u8>().unwrap())
            .collect::<Vec<u8>>();

        let base58_str = bs58::encode(wallet_bytes).into_string();
        println!("Base58 private key: {}", base58_str);
    }

    // 2. Airdrop
    #[test]
    fn airdrop() {
        let keypair = read_keypair_file("dev-wallet.json").expect("Couldn't find dev-wallet.json");
        let client = RpcClient::new(RPC_URL);

        let lamports = 2_000_000_000u64; // 2 SOL
        match client.request_airdrop(&keypair.pubkey(), lamports) {
            Ok(sig) => println!("Airdrop success! TX: https://explorer.solana.com/tx/{}?cluster=devnet", sig),
            Err(e) => eprintln!("Airdrop error: {}", e),
        }
    }

    // 3. Transfer SOL
    #[test]
    fn transfer_sol() {
        let keypair = read_keypair_file("dev-wallet.json").expect("Couldn't find dev-wallet.json");

        // Just demonstrating a quick signature
        let pubkey = keypair.pubkey();
        let msg_bytes = b"Verifying dev-wallet ownership";
        let signed = keypair.sign_message(msg_bytes);
        let hashed = hash(signed.as_ref());
        println!("Signature verified: {}", signed.verify(&pubkey.to_bytes(), &hashed.to_bytes()));

        // Provide your actual target address here, or read from "Turbin3-wallet.json"
        let to_keypair = read_keypair_file("Turbin3-wallet.json").expect("Couldn't find Turbin3-wallet.json");
        let to_pubkey = to_keypair.pubkey();

        let client = RpcClient::new(RPC_URL);
        let blockhash = client.get_latest_blockhash().unwrap();

        // Transfer 0.1 SOL => 100_000_000 lamports
        let lamports = 100_000_000u64;
        let instruction = transfer(&keypair.pubkey(), &to_pubkey, lamports);

        let tx = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&keypair.pubkey()),
            &[&keypair],
            blockhash,
        );

        let sig = client.send_and_confirm_transaction(&tx).expect("Transfer failed");
        println!("Transfer success: https://explorer.solana.com/tx/{}?cluster=devnet", sig);
    }

    // 4. Empty dev wallet
    #[test]
    fn empty_dev_wallet() {
        let keypair = read_keypair_file("dev-wallet.json").expect("Couldn't find dev-wallet.json");
        let client = RpcClient::new(RPC_URL);

        // We'll send the remainder to our Turbin3 wallet
        let to_keypair = read_keypair_file("Turbin3-wallet.json").expect("Couldn't find Turbin3-wallet.json");
        let to_pubkey = to_keypair.pubkey();

        let balance = client.get_balance(&keypair.pubkey()).unwrap();
        if balance == 0 {
            println!("No funds to transfer!");
            return;
        }

        let blockhash = client.get_latest_blockhash().unwrap();

        // Check fee
        let test_msg = Message::new_with_blockhash(
            &[transfer(&keypair.pubkey(), &to_pubkey, balance)],
            Some(&keypair.pubkey()),
            &blockhash
        );
        let fee = client.get_fee_for_message(&test_msg).expect("Failed to get fee");

        // Create the real transaction
        let tx = Transaction::new_signed_with_payer(
            &[transfer(&keypair.pubkey(), &to_pubkey, balance - fee)],
            Some(&keypair.pubkey()),
            &[&keypair],
            blockhash
        );

        let sig = client.send_and_confirm_transaction(&tx).expect("Failed to empty dev-wallet");
        println!("Emptied dev wallet! TX: https://explorer.solana.com/tx/{}?cluster=devnet", sig);
    }

    // 5. Complete enrollment using the "complete" instruction
    #[test]
    fn complete_enrollment() {
        // The wallet you'll use to sign your on-chain "complete" instruction
        let signer = read_keypair_file("Turbin3-wallet.json").expect("Couldn't find Turbin3-wallet.json");

        let client = RpcClient::new(RPC_URL);

        // According to the new IDL, seeds => [ b"prereq", signer ]
        let (prereq_pda, _bump) = Pubkey::find_program_address(
            &[
                b"prereq",
                signer.pubkey().as_ref(),
            ],
            &TurbinePrereqProgram::id()
        );

        // The "complete" instruction takes `CompleteArgs { github }`
        let args = CompleteArgs {
            github: b"ghazalassadipour".to_vec(),
        };

        let blockhash = client.get_latest_blockhash().unwrap();

        // Create a transaction with the auto-generated "complete" function
        let tx = TurbinePrereqProgram::complete(
            &[
                &signer.pubkey(),       // "signer"
                &prereq_pda,            // "prereq"
                &system_program::id(),  // "system_program"
            ],
            &args,
            Some(&signer.pubkey()),   // optional payer override
            &[&signer],
            blockhash
        );

        let sig = client.send_and_confirm_transaction(&tx).expect("Complete instruction failed");
        println!("Enrollment complete! TX: https://explorer.solana.com/tx/{}?cluster=devnet", sig);
    }
}
