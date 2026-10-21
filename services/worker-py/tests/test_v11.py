from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from connectors import crossref, eurlex, openalex
from core.records import RecordDraft
from core.sources import SourceRegistry
from helpers import fixture_bytes

NOW = datetime(2026, 10, 19, tzinfo=timezone.utc)


def test_norm_records_get_masked_text_and_decisions_do_not() -> None:
    norm = RecordDraft("mevzuat", "t", "baglayici_norm", "l", "https://x", "n1", NOW, "madde metni")
    row = norm.to_row()
    assert row["masked_text"] == "madde metni" and row["anonymized"] is True
    assert row["anonymization_version"] == "gerekmez-norm"
    dec = RecordDraft("kurul_karari", "t", "idari_karar", "l", "https://x", "d1", NOW, "karar", court="C", karar_no="1")
    assert dec.to_row()["masked_text"] is None  # stays unserved until the anonymiser writes it


def test_upsert_sql_writes_masked_text() -> None:
    from core.pipeline import UPSERT_RECORD_SQL

    assert "masked_text" in UPSERT_RECORD_SQL and "%(masked_text)s" in UPSERT_RECORD_SQL


def test_jurisdiction_codes() -> None:
    cr = json.loads(fixture_bytes("crossref/work-nature12373.json"))
    assert crossref.parse_work(cr, NOW).jurisdiction == "ZZ"
    oa = json.loads(fixture_bytes("openalex/work-nature12373.json"))
    assert openalex.parse_work(oa, NOW).jurisdiction == "ZZ"
    act = eurlex.parse_act("32016R0679", fixture_bytes("eurlex/32016R0679-ilk2.xhtml").decode(), NOW)
    assert act.jurisdiction == "EU"


def test_sources_dir_from_env(tmp_path: Path) -> None:
    src = Path(__file__).resolve().parents[3] / "docs" / "kaynaklar" / "kvkk.md"
    (tmp_path / "kvkk.md").write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    reg = SourceRegistry.load(env={"KAZUIST_SOURCES_DIR": str(tmp_path)})
    assert reg.names() == ["kvkk"]
    assert SourceRegistry.load(env={"KAZUIST_SOURCES_DIR": str(tmp_path / "missing")}).names() == []  # fail closed
