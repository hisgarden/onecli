# AES-256-GCM Wire Format

Secrets are encrypted at rest in the database. The web app (TypeScript) encrypts;
the gateway (Rust) decrypts. Both implementations must produce/consume the same
wire format.

## Wire Format

```
{iv_base64}:{authTag_base64}:{ciphertext_base64}
```

Three base64-encoded segments separated by colons (`:`).

| Segment      | Encoding                  | Length (decoded) | Description                   |
| ------------ | ------------------------- | ---------------- | ----------------------------- |
| `iv`         | Base64 (standard, padded) | 12 bytes         | Initialization vector / nonce |
| `authTag`    | Base64 (standard, padded) | 16 bytes         | GCM authentication tag        |
| `ciphertext` | Base64 (standard, padded) | variable         | Encrypted plaintext           |

## Algorithm Parameters

| Parameter                           | Value                                    |
| ----------------------------------- | ---------------------------------------- |
| Algorithm                           | AES-256-GCM                              |
| Key length                          | 32 bytes (256 bits)                      |
| IV length                           | 12 bytes (96 bits)                       |
| Auth tag length                     | 16 bytes (128 bits)                      |
| AAD (Additional Authenticated Data) | Empty (none)                             |
| Key encoding                        | Base64 (env var `SECRET_ENCRYPTION_KEY`) |

## Key Management

- Key is loaded from `SECRET_ENCRYPTION_KEY` environment variable (base64-encoded).
- OSS edition auto-generates and persists the key in `/app/data/secret-encryption-key`.
- Cloud edition uses AWS KMS for key wrapping.
- Key must be exactly 32 bytes when decoded.

## Implementation Notes

### TypeScript (encrypt + decrypt)

File: `apps/web/src/lib/crypto.ts`

- Uses `node:crypto` (`createCipheriv` / `createDecipheriv`)
- IV generated via `crypto.randomBytes(12)`
- Auth tag retrieved via `cipher.getAuthTag()` after encryption
- Output: `iv.toString('base64') + ':' + authTag.toString('base64') + ':' + ciphertext.toString('base64')`

### Rust (decrypt only)

File: `apps/gateway/src/crypto.rs`

- Uses `ring::aead::AES_256_GCM`
- `ring` expects ciphertext and auth tag concatenated: `ciphertext || authTag`
- Wire format stores them separately, so gateway concatenates before calling `open_in_place`
- No AAD (uses `aead::Aad::empty()`)

## Cross-Validation

A shared test fixture proves interop between the two implementations:

| Field               | Value                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Key (base64)        | `YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=`                                                   |
| Plaintext           | `sk-ant-api03-cross-validation-test-key`                                                         |
| IV (base64)         | `qrvM3e7/ABEiM6q7`                                                                               |
| Auth tag (base64)   | `LpKph0AdS2Yz+kIKMIuFzQ==`                                                                       |
| Ciphertext (base64) | `xoc+5Xj9EiXBsZt6GldiKpysy8bUq9ZQMxNLGZIvmetE67TDMP0=`                                           |
| Wire format         | `qrvM3e7/ABEiM6q7:LpKph0AdS2Yz+kIKMIuFzQ==:xoc+5Xj9EiXBsZt6GldiKpysy8bUq9ZQMxNLGZIvmetE67TDMP0=` |

Tests using this fixture:

- **Rust**: `apps/gateway/src/crypto.rs` → `decrypt_nodejs_fixture`
- **TypeScript**: `apps/web/src/lib/__tests__/crypto.test.ts` → `cross-validation with Rust gateway`

If either test fails, the wire format has diverged and secrets encrypted by one
side will not decrypt on the other.

## Edge Cases

- **Empty plaintext**: Node.js produces an empty base64 ciphertext segment (`""`).
  The gateway format check `!ciphertextB64` rejects this. Empty secrets should
  not occur in practice (validation requires non-empty values).
- **Unicode**: Both implementations handle multi-byte UTF-8 correctly. The
  plaintext is treated as a byte stream; encoding/decoding is UTF-8.
