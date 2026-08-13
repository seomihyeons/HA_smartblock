# HA-SmartBlock Metadata Audit

Generated for the second-pass revision evidence update.

## Scope

This audit checks repository metadata that can be verified locally. The manuscript body was not found in the inspected repository files, so manuscript-facing items are reported against the user-provided mismatch notes and marked `manual_required` where exact manuscript text cannot be verified.

## Summary

| Item | Repository evidence | Manuscript/audit status | Action |
| --- | --- | --- | --- |
| License | `package.json` and `ha_smartblock/package.json` report `Apache-2.0`; no standalone `LICENSE` file was found. | Mismatch if manuscript says MIT. | Correct manuscript to Apache-2.0 or intentionally change repository metadata and add matching license file. |
| C7 dependencies | Root/add-on dependencies: Blockly, js-yaml, dotenv; build tooling: webpack stack; add-on runtime: Node.js/npm, Python 3, PyYAML, Home Assistant base image. | Partially repository-supported. | Map exact wording to SoftwareX C7 form. |
| C7 operating environment | Browser-based Blockly app; local webpack dev server; Home Assistant add-on container using `ghcr.io/home-assistant/base:latest`; architectures `amd64`, `aarch64`; ingress on port 8099. | Repository-supported, but exact minimum HA version absent. | Add minimum HA version or mark manual_required. |
| C9 support email | `repository.yaml` maintainer is `seomihyeons`; no support email found. | `manual_required`. | Add/verify support email before submission. |
| Minimum Home Assistant version | No explicit minimum version found in `ha_smartblock/config.yaml`, README, DOCS, package metadata, or add-on Dockerfile. | `manual_required`. | Verify tested HA version and add metadata/manuscript statement. |
| Install/run/test commands | Commands are available for root app, add-on, headless evaluation, conflict benchmark, and analyzer. | Repository-supported with caveats. | Use exact commands below. |

## License Mismatch

Repository facts:

- Root `package.json`: `license: Apache-2.0`
- `ha_smartblock/package.json`: `license: Apache-2.0`
- Several source files include SPDX `Apache-2.0`.
- No root `LICENSE` or `LICENSE.md` file was found.

Audit conclusion:

- If the manuscript says `MIT`, it is inconsistent with repository metadata.
- Do not state MIT in the manuscript unless the project is deliberately relicensed and the package metadata/source headers are updated.
- Recommended manuscript value from current repository evidence: `Apache-2.0`.
- Recommended repository cleanup before resubmission: add a standalone `LICENSE` file matching Apache-2.0.

## C7 Dependencies And Operating Environment

Repository-supported dependency inventory:

| Area | Evidence |
| --- | --- |
| Frontend/runtime | `blockly ^11.0.0`, `js-yaml ^4.1.1`, `dotenv ^17.2.3` from `package.json` and `ha_smartblock/package.json` |
| Build tooling | `webpack ^5.102.1`, `webpack-cli ^5.1.4`, `webpack-dev-server ^4.15.2`, `html-webpack-plugin ^5.5.0`, `css-loader`, `style-loader`, `source-map-loader` |
| Add-on runtime | `ha_smartblock/Dockerfile` installs `nodejs`, `npm`, `python3`, `py3-yaml` |
| Container base | `ghcr.io/home-assistant/base:latest` |
| Home Assistant add-on metadata | `ha_smartblock/config.yaml` with `ingress: true`, `ingress_port: 8099`, `homeassistant_api: true`, `arch: amd64/aarch64` |
| Python analyzer | `src/homeassistant/conflict_analyzer/ha_eca_conflict_analyzer.py`, requires Python 3 and PyYAML |

Operating environment wording supported by repository evidence:

> HA-SmartBlock runs as a JavaScript/Blockly web application with Node.js build tooling. It can be run locally through webpack-dev-server or packaged as a Home Assistant add-on container based on `ghcr.io/home-assistant/base:latest`, with Node.js, npm, Python 3, and PyYAML installed for the add-on server and conflict analyzer. The add-on declares `amd64` and `aarch64` architectures, Home Assistant ingress, and Home Assistant API access.

Manual-required C7 items:

- Exact SoftwareX C7 prompt wording.
- Tested operating systems/browsers.
- Tested Node/npm versions.
- Exact Home Assistant Core/Supervisor version range.

## C9 Support Email

Repository evidence:

- `repository.yaml` contains `maintainer: seomihyeons`.
- No support email address was found in README, add-on docs, package metadata, or repository metadata.

Audit conclusion:

- C9 support email is `manual_required`.
- Do not invent an email address.

## Minimum Home Assistant Version

Repository evidence:

- `ha_smartblock/config.yaml` does not declare a minimum Home Assistant version.
- README/DOCS describe Home Assistant integration but do not state a minimum version.
- The add-on uses Home Assistant Supervisor/Core API routes through `SUPERVISOR_TOKEN`/`HA_TOKEN`.

Audit conclusion:

- Minimum Home Assistant version is `manual_required`.
- Recommended next action: record the tested Home Assistant Core and Supervisor versions, then add a clear manuscript/support statement.

## Exact Install, Run, And Test Commands

Root research/development app:

```powershell
npm ci
npm run build
npm start
```

Home Assistant add-on package:

```powershell
cd ha_smartblock
npm ci
npm run build
npm run start:addon
```

Current-code headless Task Alt evaluation:

```powershell
npx webpack --config revision_evidence\scripts\webpack.headless.config.cjs
node revision_evidence\.tmp\headless_task_alt_eval.cjs --root . --out revision_evidence\evaluation
```

Conflict benchmark:

```powershell
python revision_evidence\scripts\run_conflict_benchmark.py
```

Conflict analyzer, direct file mode:

```powershell
python src\homeassistant\conflict_analyzer\ha_eca_conflict_analyzer.py --in path\to\automations.yaml --out stdout
```

Analyzer HTTP bridge for local development:

```powershell
node server\analyze_server.js
```

## Manual-Required Items

| Item | Reason |
| --- | --- |
| Exact manuscript text audit | Manuscript source was not found in the inspected repository files. |
| C7 final wording | SoftwareX form text is not in the repository. |
| C9 support email | No email address found locally. |
| Minimum Home Assistant version | No explicit metadata or tested version file found. |
| License final decision | Repository says Apache-2.0; user notes manuscript says MIT. One side must be corrected intentionally. |
