#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import sys
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[2]
BENCH_DIR = ROOT / "revision_evidence" / "conflict_benchmark"
LABELS_FILE = BENCH_DIR / "labels.json"
ANALYZER_FILE = ROOT / "src" / "homeassistant" / "conflict_analyzer" / "ha_eca_conflict_analyzer.py"
RESULTS_FILE = BENCH_DIR / "results.json"
REPORT_FILE = BENCH_DIR / "report.md"


def load_analyzer():
    spec = importlib.util.spec_from_file_location("ha_eca_conflict_analyzer", ANALYZER_FILE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load analyzer: {ANALYZER_FILE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def precision_recall(tp, fp, fn):
    precision = None if (tp + fp) == 0 else tp / (tp + fp)
    recall = None if (tp + fn) == 0 else tp / (tp + fn)
    return precision, recall


def fmt_metric(value):
    if value is None:
        return "manual_required"
    return f"{value:.3f}"


def markdown_table(headers, rows):
    out = []
    out.append("| " + " | ".join(headers) + " |")
    out.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for row in rows:
        out.append("| " + " | ".join(str(x) for x in row) + " |")
    return "\n".join(out)


def main():
    analyzer = load_analyzer()
    labels = json.loads(LABELS_FILE.read_text(encoding="utf-8"))
    rows = []
    comparable = []

    for case in labels.get("cases", []):
        case_file = BENCH_DIR / case["file"]
        yaml_text = case_file.read_text(encoding="utf-8")
        report = analyzer.analyze_ha_automations(yaml_text)
        issues = report.get("inconsistency", [])
        detected_binary = len(issues) > 0
        comparable_output = bool(case.get("comparable_output"))
        expected_binary = bool(case.get("expected_binary_inconsistency"))
        binary_correct = None
        if comparable_output:
            binary_correct = detected_binary == expected_binary
            comparable.append((expected_binary, detected_binary))

        rows.append({
            "id": case["id"],
            "file": case["file"],
            "label": case["label"],
            "expected_binary_inconsistency": expected_binary,
            "comparable_output": comparable_output,
            "detected_binary_inconsistency": detected_binary,
            "detected_inconsistency_issues": len(issues),
            "binary_correct": binary_correct,
            "unsupported_reason": case.get("unsupported_reason", ""),
            "summary": report.get("summary", {}),
            "issues": issues,
        })

    tp = sum(1 for expected, detected in comparable if expected and detected)
    fp = sum(1 for expected, detected in comparable if not expected and detected)
    fn = sum(1 for expected, detected in comparable if expected and not detected)
    tn = sum(1 for expected, detected in comparable if not expected and not detected)
    precision, recall = precision_recall(tp, fp, fn)

    results = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "analyzer": str(ANALYZER_FILE.relative_to(ROOT)).replace("\\", "/"),
        "labels": str(LABELS_FILE.relative_to(ROOT)).replace("\\", "/"),
        "comparison_scope": "binary inconsistency only for cases where comparable_output=true",
        "metrics": {
            "comparable_cases": len(comparable),
            "true_positive": tp,
            "false_positive": fp,
            "false_negative": fn,
            "true_negative": tn,
            "precision": precision,
            "recall": recall,
            "note": "Direct vs indirect type separation, redundancy, and circularity are not comparable through the current top-level analyzer output."
        },
        "case_results": rows,
    }
    RESULTS_FILE.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")

    md = []
    md.append("# Conflict Analyzer Second-Pass Benchmark")
    md.append("")
    md.append(f"Generated: `{results['generated_at_utc']}`")
    md.append("")
    md.append("This benchmark is intentionally small and labeled. The current analyzer output is comparable only as binary inconsistency presence/absence for selected cases.")
    md.append("")
    md.append("## Binary Inconsistency Metrics")
    md.append(markdown_table(
        ["Metric", "Value"],
        [
            ["Comparable cases", len(comparable)],
            ["TP", tp],
            ["FP", fp],
            ["FN", fn],
            ["TN", tn],
            ["Precision", fmt_metric(precision)],
            ["Recall", fmt_metric(recall)],
        ],
    ))
    md.append("")
    md.append("## Case-by-Case Results")
    md.append(markdown_table(
        [
            "Case",
            "Label",
            "Comparable",
            "Expected binary inconsistency",
            "Detected binary inconsistency",
            "Issues",
            "Result",
            "Unsupported reason",
        ],
        [
            [
                row["id"],
                row["label"],
                row["comparable_output"],
                row["expected_binary_inconsistency"],
                row["detected_binary_inconsistency"],
                row["detected_inconsistency_issues"],
                row["binary_correct"] if row["binary_correct"] is not None else "unsupported_by_current_output",
                row["unsupported_reason"] or "",
            ]
            for row in rows
        ],
    ))
    md.append("")
    md.append("## Interpretation")
    md.append("")
    md.append("- `direct_inconsistency` and `indirect_inconsistency` are evaluated only as binary inconsistency because the analyzer currently reports issue type `Inconsistency`.")
    md.append("- `redundancy` is labeled but not scored because the current top-level output does not expose redundancy findings.")
    md.append("- `circularity` is labeled but not scored because the current top-level output does not expose circularity findings, even though SCC helper code exists internally.")
    md.append("")
    REPORT_FILE.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps(results["metrics"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
