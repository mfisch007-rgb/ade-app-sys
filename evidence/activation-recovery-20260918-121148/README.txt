ADE ACTIVATION / PROVISIONING RECOVERY
Date: 2026-09-18 12:11:48
HEAD: 5442afb
Branch: main

Purpose:
Trace Founder -> authentication -> provisioning -> entitlement ->
catalogue -> navigation -> product route -> persistence.

Known user-observed failures:
- Founder provision/account creation not completing as expected
- Operator/admin provisioning failures
- SUPABASE_STORAGE_WRITE_FAILED HTTP 404
- Product surface/icon discovery incomplete
- Some channels/products report ENABLED + configuration pending
- Blank production surface has occurred previously

Safety:
- No git reset
- No git clean
- No stash
- No unrelated working-tree modifications
- No process killing
- No OpenCode process launched
- No secrets printed
