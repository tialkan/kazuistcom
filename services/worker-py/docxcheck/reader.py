"""Reads the parts of a DOCX the checker needs: styles with inheritance, paragraphs with effective formatting,
sections with page numbering, footnotes. Standard library only (zipfile and ElementTree).

Document text is read to measure it (length, case, word counts) and to match headings against rule section
names; it is never copied into a result.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Tuple
from xml.etree import ElementTree as ET

from .safe_zip import DocxError, open_docx, parse_xml, read_part

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def q(tag: str) -> str:
    return f"{{{W}}}{tag}"


def attr(el: Optional[ET.Element], name: str) -> Optional[str]:
    if el is None:
        return None
    return el.get(q(name))


def _on(el: Optional[ET.Element]) -> Optional[bool]:
    """Word on/off element: present without value means true."""
    if el is None:
        return None
    v = el.get(q("val"))
    if v is None:
        return True
    return v.lower() not in ("0", "false", "off")


def _int(v: Optional[str]) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except ValueError:
        return None


def ppr_props(ppr: Optional[ET.Element]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if ppr is None:
        return out
    sp = ppr.find(q("spacing"))
    if sp is not None:
        for key in ("line", "after", "before"):
            v = _int(sp.get(q(key)))
            if v is not None:
                out[key] = v
        rule = sp.get(q("lineRule"))
        if rule is not None or "line" in out:
            out["line_rule"] = rule or "auto"
    ind = ppr.find(q("ind"))
    if ind is not None:
        for key, name in (("firstLine", "first_line"), ("hanging", "hanging"), ("left", "left"), ("start", "left")):
            v = _int(ind.get(q(key)))
            if v is not None:
                out[name] = v
    jc = attr(ppr.find(q("jc")), "val")
    if jc:
        out["jc"] = jc
    ol = _int(attr(ppr.find(q("outlineLvl")), "val"))
    if ol is not None:
        out["outline"] = ol
    return out


def rpr_props(rpr: Optional[ET.Element]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if rpr is None:
        return out
    f = rpr.find(q("rFonts"))
    if f is not None:
        name = f.get(q("ascii")) or f.get(q("hAnsi"))
        theme = f.get(q("asciiTheme")) or f.get(q("hAnsiTheme"))
        if name:
            out["font"] = name
        elif theme:
            out["font_theme"] = theme
    sz = _int(attr(rpr.find(q("sz")), "val"))
    if sz is not None:
        out["size"] = sz / 2.0
    b = _on(rpr.find(q("b")))
    if b is not None:
        out["bold"] = b
    caps = _on(rpr.find(q("caps")))
    if caps is not None:
        out["caps"] = caps
    return out


@dataclass
class Style:
    id: str
    type: str
    name: str
    based_on: Optional[str]
    default: bool
    ppr: Dict[str, Any]
    rpr: Dict[str, Any]


class Styles:
    def __init__(self, root: Optional[ET.Element], theme_fonts: Dict[str, str]):
        self.theme_fonts = theme_fonts
        self.doc_ppr: Dict[str, Any] = {}
        self.doc_rpr: Dict[str, Any] = {}
        self.styles: Dict[str, Style] = {}
        self.default_paragraph: Optional[str] = None
        if root is None:
            return
        dd = root.find(q("docDefaults"))
        if dd is not None:
            self.doc_rpr = rpr_props(dd.find(f"{q('rPrDefault')}/{q('rPr')}"))
            self.doc_ppr = ppr_props(dd.find(f"{q('pPrDefault')}/{q('pPr')}"))
        for s in root.findall(q("style")):
            sid = s.get(q("styleId"))
            if not sid:
                continue
            style = Style(
                id=sid,
                type=s.get(q("type")) or "paragraph",
                name=(attr(s.find(q("name")), "val") or sid),
                based_on=attr(s.find(q("basedOn")), "val"),
                default=(s.get(q("default")) or "").lower() in ("1", "true", "on"),
                ppr=ppr_props(s.find(q("pPr"))),
                rpr=rpr_props(s.find(q("rPr"))),
            )
            self.styles[sid] = style
            if style.type == "paragraph" and style.default and self.default_paragraph is None:
                self.default_paragraph = sid

    def chain(self, style_id: Optional[str]) -> List[Style]:
        """Style and its ancestors, root first. Cycles are cut."""
        sid = style_id or self.default_paragraph
        seen: List[Style] = []
        names = set()
        while sid and sid in self.styles and sid not in names:
            names.add(sid)
            seen.append(self.styles[sid])
            sid = self.styles[sid].based_on
        seen.reverse()
        return seen

    def effective(self, style_id: Optional[str], char_style: Optional[str] = None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        ppr = dict(self.doc_ppr)
        rpr = dict(self.doc_rpr)
        for s in self.chain(style_id):
            ppr.update(s.ppr)
            rpr.update(s.rpr)
        if char_style:
            for s in self.chain(char_style):
                rpr.update(s.rpr)
        if "font" not in rpr and "font_theme" in rpr:
            rpr["font"] = self.theme_fonts.get(rpr["font_theme"], f"theme:{rpr['font_theme']}")
        return ppr, rpr

    def name(self, style_id: Optional[str]) -> str:
        sid = style_id or self.default_paragraph
        return (self.styles[sid].name if sid and sid in self.styles else sid or "").lower()


def _theme_fonts(data: Optional[bytes]) -> Dict[str, str]:
    if not data:
        return {}
    text = data.decode("utf-8", "ignore")
    out: Dict[str, str] = {}
    for kind, key in (("majorFont", "majorHAnsi"), ("minorFont", "minorHAnsi")):
        m = re.search(rf"<a:{kind}>\s*<a:latin typeface=\"([^\"]*)\"", text)
        if m and m.group(1):
            out[key] = m.group(1)
            out[key.replace("HAnsi", "Ascii")] = m.group(1)
    return out


@dataclass
class Run:
    text: str
    ppr: Dict[str, Any]
    rpr: Dict[str, Any]


@dataclass
class Para:
    index: int
    style_id: Optional[str]
    style_name: str
    text: str
    ppr: Dict[str, Any]
    runs: List[Dict[str, Any]]  # effective run properties with their text length: {"len": n, **rpr}
    outline: Optional[int]
    in_toc: bool

    @property
    def length(self) -> int:
        return len(self.text.strip())


@dataclass
class Section:
    page_w: Optional[int]
    page_h: Optional[int]
    top: Optional[int]
    bottom: Optional[int]
    left: Optional[int]
    right: Optional[int]
    num_fmt: str
    num_start: Optional[int]
    title_page: bool
    header_parts: Dict[str, str] = field(default_factory=dict)
    footer_parts: Dict[str, str] = field(default_factory=dict)


@dataclass
class Docx:
    styles: Styles
    paragraphs: List[Para]
    sections: List[Section]
    footnote_paras: List[Para]
    # Page number field placement per section index: (kind "footer"|"header"|None, alignment)
    page_fields: List[Tuple[Optional[str], Optional[str]]]
    footnote_count: int


_HEADING_NAME = re.compile(r"^(?:heading|başlık)\s*(\d)$")


def _text_of(p: ET.Element) -> str:
    parts: List[str] = []
    for el in p.iter():
        if el.tag == q("t") and el.text:
            parts.append(el.text)
        elif el.tag in (q("tab"), q("br")):
            parts.append(" ")
    return "".join(parts)


def _runs(p: ET.Element, styles: Styles, para_style: Optional[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in p.iter(q("r")):
        text = "".join(t.text or "" for t in r.findall(q("t")))
        if not text.strip():
            continue
        rpr_el = r.find(q("rPr"))
        char_style = attr(rpr_el.find(q("rStyle")), "val") if rpr_el is not None else None
        _, rpr = styles.effective(para_style, char_style)
        direct = rpr_props(rpr_el)
        merged = {**rpr, **direct}
        if "font" in direct:
            merged.pop("font_theme", None)
        elif "font_theme" in direct:
            merged["font"] = styles.theme_fonts.get(direct["font_theme"], f"theme:{direct['font_theme']}")
        merged["len"] = len(text)
        out.append(merged)
    return out


def _para(p: ET.Element, idx: int, styles: Styles, in_toc: bool = False) -> Para:
    ppr_el = p.find(q("pPr"))
    style_id = attr(ppr_el.find(q("pStyle")), "val") if ppr_el is not None else None
    direct = ppr_props(ppr_el)
    eff, _ = styles.effective(style_id)
    merged = {**eff, **direct}
    name = styles.name(style_id)
    outline = merged.get("outline")
    if outline is None:
        m = _HEADING_NAME.match(name)
        if m:
            outline = int(m.group(1)) - 1
    toc = in_toc or name.startswith("toc ") or name.startswith("table of")
    return Para(
        index=idx,
        style_id=style_id or styles.default_paragraph,
        style_name=name,
        text=_text_of(p),
        ppr=merged,
        runs=_runs(p, styles, style_id),
        outline=outline,
        in_toc=toc,
    )


def _body_paragraphs(body: ET.Element) -> Iterator[Tuple[ET.Element, bool]]:
    """Paragraphs in document order. Table content is skipped; content controls (a table of contents) are
    entered and flagged."""

    def walk(parent: ET.Element, toc: bool) -> Iterator[Tuple[ET.Element, bool]]:
        for ch in parent:
            if ch.tag == q("p"):
                yield ch, toc
            elif ch.tag == q("sdt"):
                gallery = ch.find(f"{q('sdtPr')}/{q('docPartObj')}/{q('docPartGallery')}")
                is_toc = gallery is not None and (attr(gallery, "val") or "").lower().startswith("table of")
                content = ch.find(q("sdtContent"))
                if content is not None:
                    yield from walk(content, toc or is_toc)

    return walk(body, False)


def _sect_from(el: ET.Element) -> Section:
    pg = el.find(q("pgSz"))
    mar = el.find(q("pgMar"))
    num = el.find(q("pgNumType"))
    sec = Section(
        page_w=_int(attr(pg, "w")),
        page_h=_int(attr(pg, "h")),
        top=_int(attr(mar, "top")),
        bottom=_int(attr(mar, "bottom")),
        left=_int(attr(mar, "left")),
        right=_int(attr(mar, "right")),
        num_fmt=attr(num, "fmt") or "decimal",
        num_start=_int(attr(num, "start")),
        title_page=el.find(q("titlePg")) is not None,
    )
    for tag, store in (("headerReference", sec.header_parts), ("footerReference", sec.footer_parts)):
        for ref in el.findall(q(tag)):
            kind = attr(ref, "type") or "default"
            rid = ref.get(f"{{{R}}}id")
            if rid:
                store[kind] = rid
    return sec


_PAGE_FIELD = re.compile(r"(?<![A-Za-z])PAGE(?![A-Za-z])")


def _page_field_alignment(part: bytes, styles: Styles) -> Optional[str]:
    """Alignment of the first paragraph that holds a PAGE field, or None when the part has none."""
    root = parse_xml(part)
    for p in root.iter(q("p")):
        has = False
        for it in p.iter(q("instrText")):
            if it.text and _PAGE_FIELD.search(it.text.replace("NUMPAGES", "").replace("SECTIONPAGES", "")):
                has = True
        for fs in p.iter(q("fldSimple")):
            ins = fs.get(q("instr")) or ""
            if _PAGE_FIELD.search(ins.replace("NUMPAGES", "").replace("SECTIONPAGES", "")):
                has = True
        if has:
            ppr_el = p.find(q("pPr"))
            style_id = attr(ppr_el.find(q("pStyle")), "val") if ppr_el is not None else None
            eff, _ = styles.effective(style_id)
            jc = {**eff, **ppr_props(ppr_el)}.get("jc") or "left"
            return {"center": "center", "right": "right", "end": "right"}.get(jc, "left")
    return None


def read_docx(data: bytes) -> Docx:
    z = open_docx(data)
    doc_xml = read_part(z, "word/document.xml")
    if doc_xml is None:
        raise DocxError("not_docx")
    styles_xml = read_part(z, "word/styles.xml")
    styles = Styles(parse_xml(styles_xml) if styles_xml else None, _theme_fonts(read_part(z, "word/theme/theme1.xml")))
    root = parse_xml(doc_xml)
    body = root.find(q("body"))
    if body is None:
        raise DocxError("not_docx")

    rels: Dict[str, str] = {}
    rels_xml = read_part(z, "word/_rels/document.xml.rels")
    if rels_xml:
        for rel in parse_xml(rels_xml):
            rid, target = rel.get("Id"), rel.get("Target")
            if rid and target:
                rels[rid] = target

    paragraphs: List[Para] = []
    for i, (p, toc) in enumerate(_body_paragraphs(body)):
        paragraphs.append(_para(p, i, styles, toc))

    # Sections in document order: a sectPr inside a paragraph closes a section; the body one closes the last.
    sections: List[Section] = []
    for p in body.iter(q("p")):
        ppr = p.find(q("pPr"))
        sp = ppr.find(q("sectPr")) if ppr is not None else None
        if sp is not None:
            sections.append(_sect_from(sp))
    last = body.find(q("sectPr"))
    if last is not None:
        sections.append(_sect_from(last))

    # Headers and footers inherit from the previous section when a section names none.
    page_fields: List[Tuple[Optional[str], Optional[str]]] = []
    prev_header: Dict[str, str] = {}
    prev_footer: Dict[str, str] = {}
    for sec in sections:
        header = {**prev_header, **sec.header_parts}
        footer = {**prev_footer, **sec.footer_parts}
        prev_header, prev_footer = header, footer
        found: Tuple[Optional[str], Optional[str]] = (None, None)
        for kind, parts in (("footer", footer), ("header", header)):
            rid = parts.get("default")
            target = rels.get(rid) if rid else None
            if not target:
                continue
            name = target.lstrip("/") if target.startswith("/") else f"word/{target}"
            part = read_part(z, name)
            if part is None:
                continue
            align = _page_field_alignment(part, styles)
            if align is not None:
                found = (kind, align)
                break
        page_fields.append(found)

    footnote_paras: List[Para] = []
    footnote_count = 0
    fn_xml = read_part(z, "word/footnotes.xml")
    if fn_xml:
        fn_root = parse_xml(fn_xml)
        for fn in fn_root.findall(q("footnote")):
            fid = _int(fn.get(q("id")))
            if fid is None or fid < 1 or fn.get(q("type")) in ("separator", "continuationSeparator"):
                continue
            footnote_count += 1
            for p in fn.findall(q("p")):
                footnote_paras.append(_para(p, len(footnote_paras), styles))
    return Docx(styles, paragraphs, sections, footnote_paras, page_fields, footnote_count)
