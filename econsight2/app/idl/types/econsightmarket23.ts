/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/econsightmarket2.json`.
 */
export type Econsightmarket2 = {
  "address": "68CF4Pu8HGRoeSkTPNyTgC4iE5DmG4q8DZSrRmrEeeck",
  "metadata": {
    "name": "econsightmarket2",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "buyOutcome",
      "discriminator": [
        23,
        167,
        228,
        249,
        105,
        241,
        139,
        113
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.authority",
                "account": "marketState"
              },
              {
                "kind": "account",
                "path": "market.seed",
                "account": "marketState"
              }
            ]
          }
        },
        {
          "name": "userUsdcAccount",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryAccount",
          "writable": true
        },
        {
          "name": "userOutcomeAccount",
          "writable": true
        },
        {
          "name": "yesMint",
          "writable": true
        },
        {
          "name": "noMint",
          "writable": true
        },
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "outcomeSide",
          "type": {
            "defined": {
              "name": "outcomeSide"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimRewards",
      "discriminator": [
        4,
        144,
        132,
        71,
        116,
        23,
        151,
        80
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.authority",
                "account": "marketState"
              },
              {
                "kind": "account",
                "path": "market.seed",
                "account": "marketState"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "userOutcomeAccount",
          "writable": true
        },
        {
          "name": "userUsdcAccount",
          "writable": true
        },
        {
          "name": "yesMint",
          "writable": true
        },
        {
          "name": "noMint",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "user",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "arg",
                "path": "seed"
              }
            ]
          }
        },
        {
          "name": "yesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  121,
                  101,
                  115,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "noMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  111,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "seed",
          "type": "u64"
        },
        {
          "name": "question",
          "type": "string"
        },
        {
          "name": "expiryTs",
          "type": "i64"
        },
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "bValueScaled",
          "type": "u64"
        }
      ]
    },
    {
      "name": "resolveMarket",
      "discriminator": [
        155,
        23,
        80,
        173,
        46,
        74,
        23,
        239
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "market.seed",
                "account": "marketState"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "winnerSide",
          "type": {
            "defined": {
              "name": "outcomeSide"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "marketState",
      "discriminator": [
        0,
        125,
        123,
        215,
        95,
        96,
        164,
        194
      ]
    }
  ],
  "events": [
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "marketResolved",
      "discriminator": [
        89,
        67,
        230,
        95,
        143,
        106,
        199,
        202
      ]
    },
    {
      "name": "outcomeBought",
      "discriminator": [
        11,
        165,
        190,
        71,
        214,
        229,
        19,
        212
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "marketNotResolved",
      "msg": "The market is not yet resolved."
    },
    {
      "code": 6001,
      "name": "marketAlreadyResolved",
      "msg": "The market is already resolved."
    },
    {
      "code": 6002,
      "name": "noWinnerYet",
      "msg": "No winner set yet."
    },
    {
      "code": 6003,
      "name": "wrongSide",
      "msg": "You tried to claim the wrong side."
    },
    {
      "code": 6004,
      "name": "marketExpired",
      "msg": "Attempted to create or interact with an expired market."
    },
    {
      "code": 6005,
      "name": "marketNotExpiredYet",
      "msg": "Attempted to resolve the market before expiry."
    },
    {
      "code": 6006,
      "name": "insufficientFunds",
      "msg": "You have insufficient funds to complete this transaction."
    },
    {
      "code": 6007,
      "name": "mathError",
      "msg": "Math error (overflow/underflow)."
    },
    {
      "code": 6008,
      "name": "noWinningShares",
      "msg": "No winning shares in this account"
    },
    {
      "code": 6009,
      "name": "noTokensToRedeem",
      "msg": "No tokens to redeem"
    },
    {
      "code": 6010,
      "name": "noRewardsAvailable",
      "msg": "No rewards available"
    },
    {
      "code": 6011,
      "name": "insufficientVaultFunds",
      "msg": "Insufficient vault funds"
    }
  ],
  "types": [
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketKey",
            "type": "pubkey"
          },
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "expiryTimestamp",
            "type": "i64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "marketResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "winnerSide",
            "type": {
              "defined": {
                "name": "outcomeSide"
              }
            }
          },
          {
            "name": "resolvedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seed",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "expiryTimestamp",
            "type": "i64"
          },
          {
            "name": "yesMint",
            "type": "pubkey"
          },
          {
            "name": "noMint",
            "type": "pubkey"
          },
          {
            "name": "resolved",
            "type": "bool"
          },
          {
            "name": "winner",
            "type": {
              "option": {
                "defined": {
                  "name": "outcomeSide"
                }
              }
            }
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "yesShares",
            "type": "u64"
          },
          {
            "name": "noShares",
            "type": "u64"
          },
          {
            "name": "bValueScaled",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "outcomeBought",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "outcomeSide",
            "type": {
              "defined": {
                "name": "outcomeSide"
              }
            }
          },
          {
            "name": "totalPaid",
            "type": "u64"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          },
          {
            "name": "netStaked",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "outcomeSide",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    }
  ]
};
