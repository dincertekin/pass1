# Argon2 reference implementation (vendored)

The official Argon2 code from the Password Hashing Competition, used for Argon2id on the phone.
Unchanged copies of the files listed below; nothing here is edited by hand.

- Source: https://github.com/P-H-C/phc-winner-argon2
- Tag `20190702`, commit `62358ba2123abd17fccf2a108a301d4b52c01a7c`
- License: CC0 1.0 or Apache 2.0, at our choice (see LICENSE)

Only the portable reference files are included (`ref.c`, not `opt.c`, whose SSE code is for
Intel processors). Threads are compiled out (`ARGON2_NO_THREADS`): pass1 always uses one lane.

Whether this code computes Argon2id correctly is checked by the conformance suite
(`packages/crypto/src/conformance.ts`), against answers two other implementations agree on.

To update: fetch a newer tag, copy the same files, update the commit above, and run the
conformance checks on a device.
