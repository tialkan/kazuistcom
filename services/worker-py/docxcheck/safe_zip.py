"""Safe reading of an uploaded DOCX (plan 5.6/4): size cap, entry cap, zip bomb cap, no XML entities.

The uploaded file is personal data. Nothing here logs, stores or returns document text; callers get values
(numbers, names of rule fields) only.
"""

from __future__ import annotations

import io
import zipfile
from typing import Optional
from xml.etree import ElementTree as ET

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_ENTRIES = 2000
MAX_TOTAL_UNCOMPRESSED = 600 * 1024 * 1024
# Parts the checker reads, with the most bytes it will inflate for each (checked on the real stream).
PART_LIMITS = {
    "word/document.xml": 60 * 1024 * 1024,
    "word/styles.xml": 8 * 1024 * 1024,
    "word/footnotes.xml": 20 * 1024 * 1024,
    "word/settings.xml": 2 * 1024 * 1024,
    "word/_rels/document.xml.rels": 2 * 1024 * 1024,
    "word/theme/theme1.xml": 4 * 1024 * 1024,
}
SMALL_PART_LIMIT = 4 * 1024 * 1024  # headers and footers


class DocxError(Exception):
    """Rejected upload. `code` is a stable identifier; the message never contains document content."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def open_docx(data: bytes) -> zipfile.ZipFile:
    if len(data) > MAX_FILE_BYTES:
        raise DocxError("too_large")
    if not data.startswith(b"PK\x03\x04"):
        raise DocxError("not_docx")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise DocxError("not_docx") from exc
    infos = z.infolist()
    if len(infos) > MAX_ENTRIES:
        raise DocxError("too_many_entries")
    if sum(i.file_size for i in infos) > MAX_TOTAL_UNCOMPRESSED:
        raise DocxError("zip_bomb")
    names = {i.filename for i in infos}
    if "word/document.xml" not in names or "[Content_Types].xml" not in names:
        raise DocxError("not_docx")
    return z


def read_part(z: zipfile.ZipFile, name: str) -> Optional[bytes]:
    try:
        info = z.getinfo(name)
    except KeyError:
        return None
    limit = PART_LIMITS.get(name, SMALL_PART_LIMIT)
    if info.file_size > limit:
        raise DocxError("zip_bomb")
    with z.open(info) as fh:
        chunk = fh.read(limit + 1)  # the declared size may lie; the stream decides
    if len(chunk) > limit:
        raise DocxError("zip_bomb")
    return chunk


def parse_xml(data: bytes) -> ET.Element:
    head = data[:4096].upper()
    if b"<!DOCTYPE" in head or b"<!ENTITY" in data[:65536].upper():
        raise DocxError("xml_entities")
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise DocxError("bad_xml") from exc
