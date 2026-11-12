"""nlp package (owner: casuist, docs/sahiplik.md): the embed.chunks consumer that fills the chunks table.

chunk.py      passage splitter, a port of packages/casuist/src/chunk.ts (same boundaries, UTF-16 offsets)
embedder.py   embedding backends behind one interface; none configured means chunks without vectors
store.py      SQL that reads masked_text and replaces a record's chunks (ADR-0026 consumer rule)
job.py        the embed.chunks handler registered in core.main.build_handlers
reconcile.py  python -m nlp.reconcile: re-enqueues servable records without chunks of the current model
"""
