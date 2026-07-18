# classifier-research

Student notes subject classifier research: prompted LLM vs base BERT vs fine-tuned BERT, with an orchestrator that can assign `Other` / custom subjects.

**Product name:** NoteLMs (not NoteLMS). Domain: [notelms.com](https://notelms.com).

See [`AGENT_PLAN.html`](AGENT_PLAN.html) for the full research and product brief.

When scaffolding a website (Vercel + Mac Studio API + LM Studio + Cloudflare Tunnel), model after SocketHR using [`SOCKETHR_STACK_REFERENCE.html`](SOCKETHR_STACK_REFERENCE.html).

For creating the Vercel project, connecting this repo, and attaching `notelms.com`, follow [`VERCEL_SETUP_PLAN.html`](VERCEL_SETUP_PLAN.html) (desktop-agent handoff).

To share SocketHR’s existing Cloudflare Tunnel with `api.notelms.com` (one `cloudflared` process, two hostnames), copy [`SHARED_CLOUDFLARE_TUNNEL_PLAN.html`](SHARED_CLOUDFLARE_TUNNEL_PLAN.html) into the sockethr repo and run a SocketHR agent against it.

The production UI lives in [`web/`](web/) (Next.js on Vercel at [notelms.com](https://notelms.com)). Root Directory on Vercel is `web`.

## Setup

```bash
python3 -m pip install -r requirements.txt
```

## Data for fine-tuning & frozen testing

Educational proxy corpus (exam questions, textbook chunks, short academic explanations) mapped to 8 BERT labels:

`Mathematics`, `Physics`, `Chemistry`, `Biology`, `Computer Science`, `History`, `Literature`, `Economics`

### Download raw sources

```bash
python3 scripts/download_data.py
```

This writes (gitignored) raw data under `data/raw/`:

| Source | Local path |
|--------|------------|
| `cais/mmlu` | `data/raw/hf/cais_mmlu/` |
| `SetFit/student-question-categories` | `data/raw/hf/setfit_student_question_categories/` |
| `mouryat9/CogBench` | `data/raw/hf/cogbench/` |
| `princeton-nlp/TextbookChapters` | `data/raw/hf/textbook_chapters/` |
| `meliascosta/wiki_academic_subjects` | `data/raw/hf/wiki_academic_subjects/` |
| OpenStax chapter pages | `data/raw/openstax/*.jsonl` |

Flags:

- `--force` — re-download even if present
- `--skip-openstax` — HF only
- `--openstax-max-pages N` — debug cap per book

### Build the unified corpus

```bash
python3 scripts/prepare_data.py
```

Outputs under `data/processed/` (committed):

- `corpus.parquet` / `corpus.csv` — columns `id, text, label, split, source, style`
- `freeze_test_ids.txt` (+ train/val id lists) — frozen forever for the paper
- `stats.json` — counts per label/split/source
- `label_map.json` — source → subject mappings

Target sizes (per subject): train 2000, val 250, test 250. Splits use seed `42`, min length ≥20 tokens, truncate/chunk at 512 tokens, and prefer a short/prose mix with a prose slice held in test.

### What is not committed

- `data/raw/` — large HF dumps and OpenStax page text (re-download with the script)
- `.env`, `api_key.txt`, provider keys

## License note

MMLU, SetFit, CogBench, TextbookChapters, wiki_academic_subjects, and OpenStax materials are used under their respective dataset/book licenses. OpenStax textbooks are CC BY.
