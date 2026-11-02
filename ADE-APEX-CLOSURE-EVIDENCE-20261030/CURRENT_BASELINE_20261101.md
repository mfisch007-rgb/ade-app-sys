# ADE-APEX Current Baseline — 2026-11-01

Captured before new implementation work.

## Repository
- branch: main
- HEAD: d54a604086504e0073ecea49c23aeda06b891a61
- remote: https://github.com/mfisch007-rgb/ade-app-sys.git
- dirty tracked files:
  - .ade_capability_store.json
  - data/audit_ledger.json
  - data/runtime-config/admin.json
- deleted tracked backup files were restored to HEAD so no tracked backup was lost.
- untracked preserved (not copied here because runtime/audit data may contain credentials or personal data):
  - ADE-APEX-CLOSURE-EVIDENCE-20261030/
  - admin.json
  - audit_ledger.json
  - debug.log
  - run-ade-closeout.ps1

## SHA-256 preservation hashes (dirty/untracked baseline)
- 8A89DE3C1649394D565CD08937DF578A3A8848002B0C9129F1701156D2F3A9F8  .ade_capability_store.json
- 98123F2BB730D7FBB01AAB2D596B1F3B6D4A6E5102E3EB6416E7322F214E1E09  data/audit_ledger.json
- 5B5518AA2BDB64113C33F638E2AAEBF363FEA2E31363884F2197651F78318E68  data/runtime-config/admin.json
- 7432E5ED87FBACA6ABF69BDCC24B4FFD5546C49F971FD02A94FFC9BE5C72E626  admin.json
- D38EF45609FDA3F6369D1D969E0BB93C28146158961426FE8F95C4ED5C0F2498  audit_ledger.json
- F40768AF3696C115765CAB9AC78EE2894B5DF4C340593E0B56FA4551AA4A39C5  debug.log
- ABB788469FEFAB6643F3B3B581B65005FCE30EE98AF2F68E27C9535D18F137D6  run-ade-closeout.ps1

## Baseline artifacts
- 8C5E13A916BAB7791433186A6BF2D0E53D2D48A6A4289FF2B2E6B4274D4DB583  dist/ade-community-edition.zip
- DE1811AB283899DC48F58BBE822F6AD6AA331808D8BB203F151C6DDC776DF4AF  dist/build-manifest.json

## Toolchain
- node: v20.20.0 (host)
- npm: 11.11.0
- Node 24 available through: npx -y node@24 (v24.22.2)
- Playwright: not installed at baseline.

## Baseline test result (host Node 20)
- 846 tests / 845 pass / 1 fail
- failure: tests/core/block01-foundation.test.ts, ERR_UNKNOWN_FILE_EXTENSION ".ts" (host Node 20 cannot execute TypeScript test file)
