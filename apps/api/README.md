# API

The API Worker serves at <https://api.qrk.localhost/>.

## Development

```sh
pnpm --filter @qrk.sh/api dev
```

## Portless

```sh
portless get api.qrk
```

## Build

```sh
pnpm --filter @qrk.sh/api build
```

## Types

```sh
pnpm --filter @qrk.sh/api types
```

## Instagram verification webhook

`/webhooks/instagram` verifies Meta's GET subscription challenge and signed POST
message events. It admits original text messages to the configured receiving
account through the shared verification Service's System-only command. It returns
success after that command completes; profile resolution continues through the
Service's recorded external work. Failed command delivery returns HTTP 503 so
Meta can retry the same message.
Echo, self-test (`is_self`), edited, deleted, and unsupported events are ignored.

Configure these values in the existing ignored local environment file:

- `NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID`: the same professional receiving
  account ID configured in App and the Zerospin backend.
- `INSTAGRAM_APP_SECRET`: Meta app secret used to verify POST signatures.
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`: the separately chosen GET verification token.
- `ZEROSPIN_SECRET_KEY`: the existing QRK backend's administrative credential.

The configured local `ZEROSPIN_API_URL` targets
<https://zerospin.qrk.localhost/>. Keep credentials server-side. Until receiver
and secret setup is complete, the webhook returns HTTP 503 explicitly.

For live local verification, expose only `/webhooks/instagram` through the
approved temporary HTTPS tunnel. Keep browser testing on the documented local
origins. This does not deploy the API or backend to production.

Run the contained HTTP tests without live provider calls:

```sh
node --experimental-strip-types --test apps/api/instagramVerification/handleInstagramVerificationWebhook.spec.mjs
```
