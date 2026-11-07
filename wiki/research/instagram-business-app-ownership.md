# Instagram business app ownership

Researched 2026-11-06 against Meta's official documentation and the authenticated QRK setup UI. This investigation concerns connecting the existing Meta app to QRK's existing business portfolio. User invitations are outside this investigation and remain untouched.

## Current finding

An additional **Connect an app ID** attempt in regular Chrome reached Meta and received an application-level authorization rejection: `BizKitSettingsClaimApplicationMutation`, HTTP 200, `Unauthorized operation.`, code `1675034`. The attempt used Instagram `@qrk.sh` in `QRK.SH` with the exact existing app ID. No transport-loading failure was observed in that bounded capture. This confirms the failure also occurs outside Incognito; Incognito is not its sole cause. The precise permission, policy or eligibility check behind the rejection remains unexplained. [Sanitized local capture](/private/tmp/qrk-meta-app-claim-evidence.json), [setup observations](../plans/054-plan-instagram-verification.md)

The two earlier Incognito attempts displayed only a generic technical error and retained no app or sent ownership request. Their backend error code was not captured, so this investigation does not claim that they returned the same code. Neither the generic message nor the later authorization error establishes that Instagram-only portfolio identities categorically cannot own apps. [Setup observations](../plans/054-plan-instagram-verification.md)

The app's current **API setup with Unified login** UI offers another ownership path: the app administrator can select a portfolio or enter its business ID. The page explicitly says an ownership request goes to the business's Requests inbox when the requesting app administrator lacks full control of that business. This documents a request flow without first adding another portfolio user. In this session, entering QRK's exact ID left **Connect** disabled, so no app-side ownership request was issued. Neither path has completed ownership. [QRK app setup](https://developers.facebook.com/apps/1165998892424227/use_cases/customize/?use_case_enum=INSTAGRAM_BUSINESS&product_route=instagram-business&selected_tab=Unified-Login-API-Setup)

## Confirmed requirements and separate identities

1. **Portfolio control:** Meta's app-ownership guide requires full control of the target business portfolio and the existing App ID. Its **Connect an app ID** flow sends a request to the app owner for ownership approval. The guide does not state that an additional Facebook user must first join the portfolio. QRK's authenticated Business Suite UI reports Full access / Everything for `@qrk.sh` in `QRK.SH` (`2223814708480656`). [App-ownership guide](https://www.facebook.com/business/help/2199735813629697), [setup observations](../plans/054-plan-instagram-verification.md)
2. **App administration:** Unified Login setup requires a Meta app owned by a business portfolio, the Instagram messaging/content use case, Facebook Login for Business, and an admin role on the app. The migration guide separately requires a Facebook account to use App Dashboard. These requirements distinguish administering the developer app from membership in its owning portfolio; they do not state that the same human must have both roles. [Unified setup](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started), [migration guide](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide)
3. **Receiving-account authorization:** Unified Login permits a professional Instagram account or Facebook account to authenticate and select the business portfolio owning the Instagram assets. This proves Instagram-based client onboarding is supported. It does not, by itself, document every app-ownership action supported by an Instagram-only Business Suite identity. [Eligibility and troubleshooting](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting), [business onboarding](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/business-onboarding)
4. **Runtime credentials:** A Business Integration System User access token belongs to the client business portfolio rather than the person who authenticated. This is separate from the administrative identities used during setup. [Authentication and access tokens](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication)
5. **API selection:** Meta's current migration guide says newly created apps cannot configure the older Instagram API with Instagram Login. That makes the older `graph.instagram.com` setup an unsupported fallback for this newly created app. [Migration guide](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide)

## What the generic troubleshooting page establishes

Meta's business-asset troubleshooting page repeats the full-control requirement. It contains asset-specific sections for Pages, Instagram accounts, Threads accounts, ad accounts and catalogs. It does not explain the developer-app **Connect an app ID** technical error. Its separate advertising-eligibility section cannot establish the cause of QRK's app-ownership failure. [Business-asset troubleshooting](https://www.facebook.com/business/help/742119383392414)

The Unified Login troubleshooting page similarly covers application ownership, configuration, login choices, Instagram eligibility, permissions, messaging access and token problems. It does not attribute this Business Suite error to a human account restriction or prescribe adding a human portfolio administrator. Its support checklist requests the app/configuration identifiers, time and timezone, stopped step, login method, visible assets and exact error, while excluding credentials. [Unified eligibility and troubleshooting](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting)

## Additional live UI evidence

1. The coordinator entered business ID `2223814708480656` in the app-side ownership dialog. **Connect** remained disabled after blurring the field and after normal keyboard entry. The textbox's native HTML validity was valid, with no ARIA-invalid state or reported HTML constraint. That establishes only the textbox's local validation state; it does not establish Meta's server-side business eligibility or authorization result. No Connect request was issued from this dialog. [App setup inspected on 2026-11-06](https://developers.facebook.com/apps/1165998892424227/use_cases/customize/?use_case_enum=INSTAGRAM_BUSINESS&product_route=instagram-business&selected_tab=Unified-Login-API-Setup)
2. Browser console observations included repeated `TypeError: Failed to fetch` and one `Broken trigger flowlet chain!` message. Neither observation has been tied to a specific ownership request. They do not establish CORS, an account restriction, an unsupported Instagram identity, or any other root cause. [Same inspected app setup](https://developers.facebook.com/apps/1165998892424227/use_cases/customize/?use_case_enum=INSTAGRAM_BUSINESS&product_route=instagram-business&selected_tab=Unified-Login-API-Setup)
3. The app's **Required actions** view currently reports no required actions. This establishes the displayed status, rather than proving that every internal eligibility check passes.
4. In Advanced settings, **Allow API Access to app settings** is unchecked. Its UI describes preventing API changes to app settings when set to No. No checked official source establishes this flag as a prerequisite for Business Suite app claiming or `business/owned_apps`; its effect on the failed claim remains unknown. The setting was not changed.
5. `QRK.SH`'s Business info view shows **Business verification status: Unverified**, with a description that Meta has not verified the business details. That page displayed no explicit app-ownership restriction. The unverified label alone does not establish the cause of the authorization error.

## Regular Chrome claim response

The coordinator signed the same Instagram identity into regular Chrome through Meta's official Instagram-enabled login entry. The existing Instagram SSO popup completed automatically, without a password step or a Facebook sign-out action. The target portfolio was still `QRK.SH` (`2223814708480656`), and its Apps list was empty. Submitting the existing app ID `1165998892424227` again produced the same visible technical error. User invitations were not changed.

The bounded capture at 22:47 on 2026-11-06 in America/Chicago (`2026-11-07T04:47:05.433Z`) recorded this safe response summary:

```json
{
  "operation": "BizKitSettingsClaimApplicationMutation",
  "httpStatus": 200,
  "errors": [
    {
      "message": "Unauthorized operation.",
      "severity": "CRITICAL",
      "code": 1675034
    }
  ],
  "networkLoadingFailures": 0
}
```

The request was a POST to `business.facebook.com/api/graphql/`. The response contained errors and `extensions.is_final: true`, with no data, error path or more specific explanation. HTTP 200 records transport completion, not a successful ownership change. No `loadingFailed` transport events were observed in that capture. The earlier app-setup console fetch errors have not been linked to this ownership request. [Sanitized local capture](/private/tmp/qrk-meta-app-claim-evidence.json), [visible rejection](/private/tmp/qrk-regular-app-claim-rejected.jpg)

Official-domain searches for `1675034` and the mutation name did not locate a Meta explanation of the specific authorization check. This is a research limit, not proof that Meta has no internal definition. The response does not establish that the cause is a personal-profile restriction, an unsupported Instagram actor, a missing app-admin role or a business-verification requirement.

## Evidence to collect next

1. Inspect the actual request associated with entering or resolving the business ID in the app-side dialog, and distinguish a failed lookup from unrelated page requests. Record only the safe operation/status/error evidence needed to explain its disabled control. That unresolved app-side state is separate from the now-confirmed Business Suite authorization rejection.
2. If that inspection supplies no specific reason, use the prepared report below for an operator review through Meta's official support surfaces. The current Help menu did not open a support form; no report has been submitted. Sending a support request is a separate action and has not been authorized. [Meta's support-evidence checklist](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting)
3. If an actionable, supported correction enables the app-to-portfolio ownership request, distinguish request creation, owner approval and completed ownership. Keep user invitations and unrelated portfolios unchanged.
4. Verify the resulting app owner in Meta and the portfolio's Apps list before provisioning the receiver token. Until then, do not claim that ownership is complete or that another portfolio user is required.

## Prepared operator support report — not submitted

**Subject:** Instagram portfolio administrator receives authorization error when connecting an existing Meta app

We are connecting Meta app **QRK verification** (`1165998892424227`) to business portfolio **QRK.SH** (`2223814708480656`) in Meta Business Suite. The signed-in identity is Instagram **@qrk.sh**. Business Suite shows this identity with Full access / Everything, and the portfolio's Apps list is empty.

At **2026-11-06 22:47 America/Chicago** (`2026-11-07T04:47:05.433Z`), regular Chrome submitted **Accounts → Apps → Add → Connect an app ID** for that existing app. The POST to `business.facebook.com/api/graphql/` completed with HTTP 200. Operation `BizKitSettingsClaimApplicationMutation` returned `Unauthorized operation.`, severity `CRITICAL`, code `1675034`. No transport-loading failures were recorded in the bounded capture. The UI displayed a generic technical error; ownership did not complete.

The app's Required actions view reports none. Business verification is Unverified, but Business info displays no explicit app-ownership restriction. The app-side business-ID dialog also leaves Connect disabled before submission for the same portfolio ID.

Please identify the authorization check behind code `1675034` for this Instagram administrator and the supported ownership-request/approval path for this app and portfolio. This report contains no access tokens, app secrets, passwords, cookies or raw request headers.

## Source access and limits

The coordinator read the app-ownership guide and business-asset troubleshooting page in authenticated Chrome on 2026-11-06 and inspected the live app setup. Fresh unauthenticated requests from the research tool redirected to Meta login or temporary-block pages; developer documentation requests were also inaccessible. Those crawler results are access limitations of the research channel, not evidence that QRK's account is restricted.

The Unified Login findings use authenticated documentation captures from 2026-11-06. The pages identify updates dated October 1–27, 2026. No public secondary account of a similar error is used as evidence of QRK's cause. No account, invitation, credential, provider, storage or runtime changes were made by this research task.
