#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Config & helpers
################################################################################

# Prompt the user for Phantom public key (currently overridden by the next line)
 #read -rp "Enter your Phantom public key: " PHANTOM_PUB
PHANTOM_PUB="7S2dK5vbJqTXLT8WVYGf6yfUAvd7oCSuJwmECgrb2RBE"
# Hardcoded Phantom public key (this overwrites the user input above)
PHANTOM_PUB="7S2dK5vbJqTXLT8WVYGf6yfUAvd7oCSuJwmECgrb2RBE"

echo "Using Phantom wallet: $PHANTOM_PUB"

LEDGER_DIR="test-ledger"
RPC_URL="http://127.0.0.1:8899"

kill_if_running() {
  pkill -f "$1" 2>/dev/null || true
}

################################################################################
# 1. Clean up any old validator
################################################################################

echo "Cleaning up old validator/ledger…"
kill_if_running solana-test-validator
lsof -ti:8899 | xargs kill -9 2>/dev/null || true
rm -rf "$LEDGER_DIR"

################################################################################
# 2. Start a fresh validator
################################################################################

echo "Starting local validator on random faucet port…"
/usr/bin/env solana-test-validator --ledger "$LEDGER_DIR" --quiet &
VAL_PID=$!

sleep 5 # Give it a head-start

# Wait until JSON-RPC responds
for i in {1..30}; do
  if solana cluster-version --url "$RPC_URL" >/dev/null 2>&1; then
    echo "Validator ready"
    break
  fi

  if [[ $i -eq 30 ]]; then
    echo "Validator did not start"
    exit 1
  fi

  sleep 1
done

################################################################################
# 3. Airdrop 2 SOL to CLI & Phantom
################################################################################

CLI_WALLET=$(solana address)
echo "CLI wallet: $CLI_WALLET"

echo "Airdropping 2 SOL to CLI wallet…"
solana airdrop 2 --url "$RPC_URL" "$CLI_WALLET" >/dev/null

echo "Airdropping 2 SOL to Phantom wallet…"
solana airdrop 2 --url "$RPC_URL" "$PHANTOM_PUB" >/dev/null

################################################################################
# 4. Deploy the Anchor program
################################################################################

echo "anchor deploy"
/usr/bin/env anchor deploy --provider.cluster localnet

PROG_ID=$(anchor keys list | awk '/econsight2:/ {print $2}')
echo "Program deployed as: $PROG_ID"

################################################################################
# 5. Create a 6-dec USDC mint and fund wallets
################################################################################

echo "Creating 6-dec USDC mint…"
MINT=$(spl-token create-token --decimals 6 --url "$RPC_URL" | awk '/Creating token/ {print $3}')
echo "→ Mint address: $MINT"

# CLI wallet’s ATA
echo "Creating CLI wallet’s USDC account…"
CLI_ATA=$(spl-token create-account "$MINT" --url "$RPC_URL" | awk '/Creating account/ {print $3}')

echo "Minting 1,000 USDC to CLI wallet…"
spl-token mint "$MINT" 1000000000 --url "$RPC_URL" >/dev/null  # 1,000 * 10^6

# Note: No explicit create-account for Phantom; it will be auto-created.
echo "Transferring 1,000 USDC to Phantom (will auto-create ATA)…"
spl-token transfer "$MINT" 1000000000 "$PHANTOM_PUB" \
  --url "$RPC_URL" --fund-recipient \
  >/dev/null

# Capture the newly created ATA address for the log
PHANTOM_ATA=$(
  spl-token accounts --owner "$PHANTOM_PUB" --url "$RPC_URL" \
  | awk -v mint="$MINT" '$2 == mint {print $1}'
)

################################################################################
# 6. Patch app/.env
################################################################################

echo "Updating app/.env…"
ENV_FILE="app/.env"

# If the line for VITE_USDC_MINT doesn't exist, add it
grep -q '^VITE_USDC_MINT=' "$ENV_FILE" || echo "VITE_USDC_MINT=" >> "$ENV_FILE"

# macOS uses a slightly different sed syntax
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|^VITE_USDC_MINT=.*|VITE_USDC_MINT=$MINT|" "$ENV_FILE"
else
  sed -i "s|^VITE_USDC_MINT=.*|VITE_USDC_MINT=$MINT|" "$ENV_FILE"
fi

################################################################################
# Final output
################################################################################

echo "Setup complete!"
echo "USDC Mint         : $MINT"
echo "CLI USDC acct     : $CLI_ATA"
echo "Phantom USDC acct : $PHANTOM_ATA"
echo "Start React with: cd app && npm run dev"
echo "Leave this terminal running to keep the validator alive (PID $VAL_PID)"