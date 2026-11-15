"""anonymizer package (plan 6.4). Owner per docs/sahiplik.md.

ENGINE_VERSION changes whenever detector behaviour changes; together with the policy version and NER backend
it forms records.anonymization_version, so a change triggers re-processing and a diff report.
"""

ENGINE_VERSION = "anon-0.4.0"
