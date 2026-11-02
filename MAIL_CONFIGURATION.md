# Mail configuration

The default local evaluation profile captures account setup/reset messages privately under `.local/mail` and committee invitations/OTPs in the owned loopback Mailpit sink. READY prints the Mailpit URL. Automated verification uses synthetic accounts and local capture; routine notifications remain in-app. Verify actual external-inbox delivery separately when configuring provider mode.

The `ACCOUNT_MAIL_MODE=zoho` adapter supports the source-allowlisted Zoho US/EU/IN/AU/JP/CN endpoints and the supported US legacy ZeptoMail Send API endpoint. Provider setup requires authorized sender/agent credentials and recipients. Complete a controlled delivery check to establish that the configured route reaches the intended inbox.

For provider mode copy `examples/provider-settings.example.json` into a private directory **outside source**, fill its required fields and set mode 0600. `agent_key` is secret; never paste it in shell arguments or a tracked file. `app_origin` must be an existing HTTPS application origin as the current adapter requires. The kit does not set up TLS/DNS/public hosting or grant permission to operate a public/institutional service. Its normal application services remain loopback-bound; end-to-end external-origin routing is an operator prerequisite and is not claimed by localhost readiness.

```sh
chmod 600 /your/private/provider-settings.json
bash scripts/configure.sh --mail-config /your/private/provider-settings.json
```

Fields: `mode` (`zoho`); `region` (source region code); exact approved `endpoint`; `from_address`; optional `from_name`; HTTPS `app_origin`; private `agent_key`. Auth/encryption/database secrets are generated per install and retained; no production key/sender is supplied. Source validation runs before startup. To return to local capture, use a private JSON file containing only `{"mode":"capture"}` with the same command.

Demo generation always uses synthetic local capture/Mailpit, even if provider mode is selected for the installed application. Only the Demo's own generated pending outbound intents are retired before opening the app, so fixture setup cannot replay messages to an external provider. Existing user data is never reset. Fresh setup/reset/invite actions later use the operator-selected mode and normal application controls.

Provider reconfiguration preserves application data and restarts only verified owned application processes. Private state contains sender/key/configuration; keep `.local` and backups confidential. Real provider delivery remains unverified unless the exact controlled test is recorded in the release evidence.
