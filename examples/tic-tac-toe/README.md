# Tic-Tac-Toe

You play X; an injected `ChooseComputerMove` Effect chooses O's reply. A confirmed human move wakes the server's `computerTurn` machine, which submits one `playO` command. The machine continues without a browser connection. The default implementation chooses the first empty square.

The aggregate supplies game models and contracts as flat properties, without a module wrapper. The system registers the machine separately. Its browser session also declares models and contracts directly. The human actor exposes `createGame` and `playX`; only the machine can submit `playO`. Authoritative aggregate guards reject stale boards, wrong turns, occupied squares, and moves after the game ends.

Run `pnpm nx run tic-tac-toe:zerospin:dev` and `pnpm nx run tic-tac-toe:dev`. The board opens on port 3020 and the API on 3006. Copy `.env.example` to `.env.local` for your development publishable key.

This demo uses an anonymous game identity in localStorage. Knowing that identity permits playing its human turn. Changed fixed schemas require empty storage.
