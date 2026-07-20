# classifier-research

Student notes subject classifier research: prompted LLM vs base BERT vs fine-tuned BERT, with an orchestrator that can assign `Other` / custom subjects.

**Product name:** NoteLMs (not NoteLMS). Domain: [notelms.com](https://notelms.com).

Agent HTML plans live in [`agent-plans/`](agent-plans/). See [`agent-plans/AGENT_PLAN.html`](agent-plans/AGENT_PLAN.html) for the full research and product brief.

When scaffolding a website (Vercel + Mac Studio API + LM Studio + Cloudflare Tunnel), model after SocketHR using [`agent-plans/SOCKETHR_STACK_REFERENCE.html`](agent-plans/SOCKETHR_STACK_REFERENCE.html).

For creating the Vercel project, connecting this repo, and attaching `notelms.com`, follow [`agent-plans/VERCEL_SETUP_PLAN.html`](agent-plans/VERCEL_SETUP_PLAN.html) (desktop-agent handoff).

To share SocketHR’s existing Cloudflare Tunnel with `api.notelms.com` (one `cloudflared` process, two hostnames), copy [`agent-plans/SHARED_CLOUDFLARE_TUNNEL_PLAN.html`](agent-plans/SHARED_CLOUDFLARE_TUNNEL_PLAN.html) into the sockethr repo and run a SocketHR agent against it.

If `https://api.notelms.com` does not resolve to public Cloudflare edge IPs, run [`agent-plans/NOTELMS_API_TUNNEL_DNS_FIX.html`](agent-plans/NOTELMS_API_TUNNEL_DNS_FIX.html) on the Mac Studio (authoritative DNS/tunnel fix).

The production UI lives in [`web/`](web/) (Next.js on Vercel at [notelms.com](https://notelms.com)). Root Directory on Vercel is `web`.

The Mac Studio API lives in [`server/`](server/) (`npm run server` → port **3002** → `https://api.notelms.com` via the shared SocketHR Cloudflare Tunnel). User notes are stored on disk at `/Volumes/Samsung USB/notelms/<email>/` (not in the cloud). See [`docs/STARTUP.md`](docs/STARTUP.md) and [`AGENTS.md`](AGENTS.md).

## Setup

### Python (corpus + BERT)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Train / evaluate / serve BERT (weights stay gitignored under `models/`):

```bash
npm run bert:train    # fine-tune → models/fine-tuned-bert/
npm run bert:eval     # frozen test → data/processed/bert_eval.json
npm run bert:serve    # http://127.0.0.1:3003
```

- **Zero-shot BERT:** pretrained `bert-base-uncased` only (no corpus training); `[CLS]` cosine to `"This student note is about {Subject}."`
- **Fine-tuned BERT:** full sequence-classification fine-tune on the frozen train split @ `max_length=512`

### Mac Studio API (Express + LM Studio)

```bash
npm install --prefix server
npm run server
```

That’s it — no `.env` editing. Listens on `http://127.0.0.1:3002`. Defaults: USB data dir, LM Studio GPT-OSS, shared tunnel port 3002. Start `npm run bert:serve` in another terminal for BERT votes.

### Vercel / Next.js UI

```bash
npm install --prefix web
npm run dev                          # from repo root, or: npm run dev --prefix web
```

Required Vercel env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (must match Mac `AUTH_SECRET`).

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
- `models/` — BERT checkpoints (re-train with `npm run bert:train`)
- `.env`, `api_key.txt`, provider keys
- `.venv/` — local Python environment

## License note

MMLU, SetFit, CogBench, TextbookChapters, wiki_academic_subjects, and OpenStax materials are used under their respective dataset/book licenses. OpenStax textbooks are CC BY.
