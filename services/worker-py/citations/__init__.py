"""Citation network extraction (plan 6.5, 10.3, SRS 9.4). Owner: atif-agi agent (docs/sahiplik.md).

Pipeline: decisions.py (E/K/T, AYM, ABAD, AIHM numbers) and doctrine.py (rule based parser) feed works.py
(author and work normalisation, "age." resolution), llm.py adds structured extraction over masked text
(Haiku 5.5, Batch API), scoring.py decides publish, queue or drop, store.py persists.
"""
