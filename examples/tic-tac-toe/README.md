# Tic-Tac-Toe

This example is intentionally broken after removing its computer-turn implementation.


Run `pnpm nx run tic-tac-toe:zerospin:dev` and `pnpm nx run tic-tac-toe:dev`. The board opens on port 3020 and the API on 3006. Copy `.env.example` to `.env.local` for your development publishable key.

This demo uses an anonymous game identity in localStorage. Knowing that identity permits playing its human turn. Changed fixed schemas require empty storage.
