---
name: yolo
description: >-
  Enforces yolo-mode cleanup: when a migration is completed, remove the old
  compatibility path instead of preserving it for legacy callers.
disable-model-invocation: true
---

# Yolo mode

## Rule

- Do not keep backward-compatible fallback APIs once migration is in progress and callsites are updated.
- Remove legacy helpers, aliases, and deprecated wrappers instead of retaining them as optional pathways.
- Prefer breaking cleanup commits over adding deprecation layers.

## Application

- If a stream decoding migration moves callers to `readAndDecodeStream`,
  remove old full-buffer helpers like `readStreamToBytes`/`decodeMany` from codec API.
- If a schema-backed transport migration is complete, delete old non-conforming transport glue in the same change.
