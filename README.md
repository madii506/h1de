# H1DE

Live: https://h1de.vercel.app

Every move you make on-chain is watched. We h1de it.

- **Scan**: read the public trail of any Solana wallet (first funder, active hours, apps, repeat counterparties) and get an exposure file. Nothing about the wallet is stored.
- **Ghosts**: fresh wallets made with tweetnacl in your browser. Keys never leave the device.
- **Routes**: your wallet pays a one-time NEAR Intents (1Click) deposit address and a solver pays the ghost from its own wallet, so no direct on-chain link joins them. Route out works the same way.
- **Moves**: swaps (Jupiter) and sends are signed by the ghost in the browser.
- **Counts, never who**: the server keeps counters and keyed hashes for de-duplication. No addresses, no amounts per person.

Limits: the route network sees both ends of a route; equal amounts at close times can be matched; sending from a ghost straight to your own wallet links them.

H1DE is independent experimental software. Not affiliated with NEAR, Jupiter or any wallet.

Env (Vercel): `DATABASE_URL` (Neon via Vercel Storage), optional `RPC_URL` (a Helius URL or key), optional `H1DE_CA`, `H1DE_X`, `H1DE_MODEL`.
