# Security Policy

## Reporting a vulnerability

Email **security@aisocratic.org**. Please do not open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with
it. We aim to acknowledge within 72 hours.

## Atlas's trust model — read this before deploying

**Atlas has no user accounts and no in-app permission system.** Anyone who can
reach the board can read and edit every card. Assignees are free text, not
identities. This is deliberate: adding roles without an identity provider would
look like access control without being it.

The consequences you need to plan for:

- **Do not expose a board to the internet unauthenticated.** `AGORA_AUTH=none`
  is meant for localhost. In production, set `AGORA_AUTH=password`, or put Atlas
  behind a proxy that authenticates for you and use `AGORA_AUTH=proxy`.
- **`AGORA_AUTH=proxy` is only as good as your network.** It trusts an HTTP
  header. If anything can reach the app without passing through your proxy, that
  header can be forged. Atlas refuses the header unless the peer address is in
  the configured trusted range, but the network is still yours to get right.
- **API tokens are bearer credentials.** Anything holding one has full board
  access. They must be at least 32 characters; Atlas refuses shorter ones at
  startup. Rotate by editing `AGORA_API_TOKENS` and restarting.
- **The `command` dispatch adapter executes a process on your server.** It is
  off unless you set `AGORA_ALLOW_COMMAND_DISPATCH=1`. Card content becomes part
  of that process's input, so treat anyone who can create a card as someone who
  can influence what runs. Prefer the `webhook` adapter, which moves execution
  somewhere with its own boundary.
- **Webhook payloads are signed, not encrypted.** Verify the
  `X-Atlas-Signature` HMAC on your receiver, and serve it over TLS.

## Supported versions

Atlas is pre-1.0. Security fixes land on `main` and in the next release; there
are no backports yet.
