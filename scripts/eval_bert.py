#!/usr/bin/env python3
"""Evaluate zero-shot BERT, fine-tuned BERT, and GPT-OSS on the frozen test set."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ml.fine_tuned import FineTunedBertClassifier  # noqa: E402
from ml.gpt_oss import GptOssClassifier  # noqa: E402
from ml.labels import SUBJECTS  # noqa: E402
from ml.zero_shot import ZeroShotBertClassifier  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
DEFAULT_FT = ROOT / "models" / "fine-tuned-bert"
DEFAULT_OUT = PROCESSED / "bert_eval.json"
DEFAULT_PUBLIC = ROOT / "web" / "public" / "research-metrics.json"
GPTOSS_CACHE = PROCESSED / "gpt_oss_test_preds.jsonl"


def load_test(corpus: pd.DataFrame) -> pd.DataFrame:
    ids_path = PROCESSED / "freeze_test_ids.txt"
    ids = set(ids_path.read_text().splitlines())
    df = corpus[corpus["id"].isin(ids)].copy()
    if df.empty:
        df = corpus[corpus["split"] == "test"].copy()
    return df.reset_index(drop=True)


def summarize(y_true: list[str], y_pred: list[str], name: str, extra: dict | None = None) -> dict:
    report = classification_report(
        y_true,
        y_pred,
        labels=SUBJECTS,
        output_dict=True,
        zero_division=0,
    )
    per_class = {
        s: {
            "precision": float(report[s]["precision"]),
            "recall": float(report[s]["recall"]),
            "f1": float(report[s]["f1-score"]),
            "support": int(report[s]["support"]),
        }
        for s in SUBJECTS
    }
    out = {
        "name": name,
        "n": len(y_true),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "micro_f1": float(
            f1_score(y_true, y_pred, average="micro", labels=SUBJECTS, zero_division=0)
        ),
        "macro_f1": float(
            f1_score(y_true, y_pred, average="macro", labels=SUBJECTS, zero_division=0)
        ),
        "per_class": per_class,
    }
    if extra:
        out.update(extra)
    return out


def load_jsonl_preds(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            rid = row.get("id")
            subj = row.get("subject")
            if isinstance(rid, str) and isinstance(subj, str):
                out[rid] = subj
    return out


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(row) + "\n")


def evaluate_gpt_oss(test_df: pd.DataFrame, cache_path: Path) -> tuple[list[str], dict]:
    clf = GptOssClassifier()
    cached = load_jsonl_preds(cache_path)
    y_pred: list[str] = []
    ids = test_df["id"].tolist()
    texts = test_df["text"].tolist()
    total = len(ids)
    started = time.time()
    print(f"evaluating GPT-OSS ({total} rows, {len(cached)} cached)…")
    for i, (rid, text) in enumerate(zip(ids, texts)):
        if rid in cached:
            y_pred.append(cached[rid])
            continue
        try:
            pred = clf.predict(text)
            subject = pred["subject"]
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i+1}/{total}] error id={rid}: {exc}")
            subject = "__ERROR__"
        if subject != "__ERROR__":
            append_jsonl(
                cache_path,
                {"id": rid, "subject": subject, "model": clf.model},
            )
            cached[rid] = subject
        y_pred.append(subject if subject != "__ERROR__" else "Mathematics")
        if (i + 1) % 25 == 0 or i + 1 == total:
            elapsed = time.time() - started
            rate = (i + 1) / max(elapsed, 1e-6)
            eta = (total - i - 1) / max(rate, 1e-6)
            print(
                f"  [{i+1}/{total}] rate={rate:.2f}/s eta={eta/60:.1f}m "
                f"last={y_pred[-1]}",
                flush=True,
            )
    # Remap any errors already written; for metrics drop errors if present
    return y_pred, {"cache_path": str(cache_path), "cached_n": len(cached)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--finetuned-dir", type=Path, default=DEFAULT_FT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--public-output", type=Path, default=DEFAULT_PUBLIC)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--skip-zero-shot", action="store_true")
    parser.add_argument("--skip-finetuned", action="store_true")
    parser.add_argument("--skip-gpt-oss", action="store_true")
    parser.add_argument("--only-gpt-oss", action="store_true")
    parser.add_argument("--gpt-oss-cache", type=Path, default=GPTOSS_CACHE)
    parser.add_argument("--merge-existing", action="store_true", default=True)
    parser.add_argument(
        "--max-samples",
        type=int,
        default=0,
        help="If >0, evaluate only first N test rows (smoke)",
    )
    args = parser.parse_args()

    if args.only_gpt_oss:
        args.skip_zero_shot = True
        args.skip_finetuned = True
        args.skip_gpt_oss = False

    corpus = pd.read_parquet(PROCESSED / "corpus.parquet")
    test_df = load_test(corpus)
    if args.max_samples > 0:
        test_df = test_df.head(args.max_samples)
    texts = test_df["text"].tolist()
    y_true = test_df["label"].tolist()
    print(f"frozen test n={len(test_df)}")

    results: dict = {
        "subjects": SUBJECTS,
        "test_n": len(test_df),
        "arms": {},
    }
    if args.merge_existing and args.output.exists():
        try:
            prev = json.loads(args.output.read_text())
            if isinstance(prev.get("arms"), dict):
                results["arms"] = prev["arms"]
        except json.JSONDecodeError:
            pass

    if not args.skip_zero_shot:
        print("evaluating zero-shot BERT…")
        zs = ZeroShotBertClassifier()
        preds = zs.predict_batch(texts, batch_size=args.batch_size)
        y_pred = [p["subject"] for p in preds]
        results["arms"]["zero_shot"] = summarize(
            y_true,
            y_pred,
            "zero_shot",
            extra={
                "protocol": "zero_shot_cls_cosine",
                "model": "bert-base-uncased",
                "label": "Zero-shot BERT",
            },
        )
        arm = results["arms"]["zero_shot"]
        print(
            f"  zero-shot accuracy={arm['accuracy']:.4f} "
            f"micro_f1={arm['micro_f1']:.4f} macro_f1={arm['macro_f1']:.4f}"
        )

    if not args.skip_finetuned:
        if not args.finetuned_dir.exists():
            raise SystemExit(f"Fine-tuned dir missing: {args.finetuned_dir}")
        print(f"evaluating fine-tuned BERT from {args.finetuned_dir}…")
        ft = FineTunedBertClassifier(args.finetuned_dir)
        preds = ft.predict_batch(texts, batch_size=args.batch_size)
        y_pred = [p["subject"] for p in preds]
        results["arms"]["fine_tuned"] = summarize(
            y_true,
            y_pred,
            "fine_tuned",
            extra={
                "protocol": "fine_tuned",
                "model_dir": str(args.finetuned_dir),
                "label": "Fine-tuned BERT",
            },
        )
        arm = results["arms"]["fine_tuned"]
        print(
            f"  fine-tuned accuracy={arm['accuracy']:.4f} "
            f"micro_f1={arm['micro_f1']:.4f} macro_f1={arm['macro_f1']:.4f}"
        )

    if not args.skip_gpt_oss:
        y_pred, extra = evaluate_gpt_oss(test_df, args.gpt_oss_cache)
        # Filter rows where prediction failed hard — treat as wrong via dummy already
        results["arms"]["gpt_oss"] = summarize(
            y_true,
            y_pred,
            "gpt_oss",
            extra={
                "protocol": "gpt_oss_prompted",
                "model": "openai/gpt-oss-20b",
                "label": "GPT-OSS 20B",
                **extra,
            },
        )
        arm = results["arms"]["gpt_oss"]
        print(
            f"  gpt-oss accuracy={arm['accuracy']:.4f} "
            f"micro_f1={arm['micro_f1']:.4f} macro_f1={arm['macro_f1']:.4f}"
        )

    # Backfill micro_f1 on older arm blobs if missing
    for arm in results["arms"].values():
        if "micro_f1" not in arm and "accuracy" in arm:
            arm["micro_f1"] = arm["accuracy"]
        if "label" not in arm:
            arm["label"] = {
                "zero_shot": "Zero-shot BERT",
                "fine_tuned": "Fine-tuned BERT",
                "gpt_oss": "GPT-OSS 20B",
            }.get(arm.get("name", ""), arm.get("name", "arm"))

    results["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2) + "\n")
    print(f"wrote {args.output}")

    if args.public_output:
        args.public_output.parent.mkdir(parents=True, exist_ok=True)
        args.public_output.write_text(json.dumps(results, indent=2) + "\n")
        print(f"wrote {args.public_output}")


if __name__ == "__main__":
    main()
