# Manual-Required Items

The second-pass update completed the current-code headless 861-file evaluation, timing measurement, and a small labeled conflict benchmark. The following items still cannot be verified automatically from the local repository without inventing results.

## External Comparison Verification

manual_required: Home Assistant native editor, Node-RED, previous SmartBlock, and other Blockly-based tools require external references and version-specific manuscript context.

## Usability Claims

manual_required: No user study or community feedback dataset was found in the repository. Claims that HA-SmartBlock is easier, less error-prone, or broadly usable by non-programmers require empirical evidence or conservative rewriting.

## Conflict Analyzer Redundancy And Circularity Metrics

manual_required: The second-pass benchmark includes redundancy and circularity cases, but the current top-level analyzer output does not expose redundancy or circularity categories. Those cases are reported case-by-case and are not scored as supported metrics.

## Conflict Analyzer Type-Level Precision/Recall

manual_required: The current analyzer reports generic `Inconsistency` issues. It does not distinguish direct inconsistency from indirect inconsistency in the output schema, so precision/recall is reported only for binary inconsistency presence/absence on comparable cases.

## SoftwareX C7 Exact Wording

manual_required: Dependency and operating-environment evidence is now collected in `revision_evidence/metadata_audit.md`, but the exact SoftwareX C7 form text was not found in the repository.

## C9 Support Email

manual_required: No support email address was found in README, add-on docs, package metadata, or repository metadata.

## Minimum Home Assistant Version

manual_required: No explicit minimum Home Assistant version was found in `ha_smartblock/config.yaml`, README, DOCS, Dockerfile, or package metadata. Record tested Home Assistant Core/Supervisor versions before making a minimum-version claim.

## License Final Decision

manual_required: Repository metadata reports `Apache-2.0`, while the user notes that the manuscript says MIT. Correct the manuscript to Apache-2.0 or intentionally change repository metadata/source headers and add a matching standalone license file.

## Manuscript Exact Text Audit

manual_required: The current manuscript source was not found in the inspected repository files, so exact claim rewrites and C7/C9 placement must be checked against the submitted manuscript.

## Reference Checklist Bibliographic Validation

manual_required: The requested references should be verified against the final bibliography before resubmission.
