use solana_idlgen::idlgen;

idlgen!({
  // Anchor requires `version` and `name` at the root.
  "version": "0.1.0",
  "name": "turbine_prereq",

  // ---- INSTRUCTIONS ----
  "instructions": [
    {
      "name": "complete",
      // The unique 8-byte discriminator for `complete`.
      "discriminator": [0,77,224,147,136,25,88,76],

      // Anchor expects each account to have isMut/isSigner.
      "accounts": [
        {
          "name": "signer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "prereq",
          "isMut": true,
          "isSigner": false,
          // pda seeds must specify kind & type
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "type": "bytes",
                "value": [112,114,101,114,101,113]
              },
              {
                "kind": "account",
                "type": "publicKey",
                "path": "signer"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "isMut": false,
          "isSigner": false,
          "address": "11111111111111111111111111111111"
        }
      ],
      // This instruction takes one argument: `github` (bytes).
      "args": [
        {
          "name": "github",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "update",
      "discriminator": [219,200,88,176,158,63,253,127],
      "accounts": [
        {
          "name": "signer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "prereq",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "system_program",
          "isMut": false,
          "isSigner": false,
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "github",
          "type": "bytes"
        }
      ]
    }
  ],

  // ---- ACCOUNTS (program-owned data structs) ----
  // Merged the discriminator + struct fields together so Anchor knows how to parse it.
  "accounts": [
    {
      "name": "SolanaCohort5Account",
      "discriminator": [167,81,85,136,32,169,137,77],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "github",
            "type": "bytes"
          },
          {
            "name": "key",
            "type": "pubkey"
          }
        ]
      }
    }
  ],

  // ---- ERRORS ----
  "errors": [
    {
      "code": 6000,
      "name": "InvalidGithubAccount",
      "msg": "Invalid Github account"
    }
  ],

  // ---- EXTRA TYPES (empty if none) ----
  "types": [],

  // ---- METADATA ----
  // The ID for the program on devnet or mainnet
  "metadata": {
    "address": "ADcaide4vBtKuyZQqdU689YqEGZMCmS4tL35bdTv9wJa"
  }
});
