"""Check digit algorithms for Turkish structured identifiers.

All functions accept strings that may contain spaces; non digit characters other than spaces return False.
"""

from __future__ import annotations


def _digits(value: str) -> str:
    return value.replace(" ", "").replace("-", "")


def tckn_valid(value: str) -> bool:
    """T.C. kimlik no: 11 digits, first digit not 0, digits 10 and 11 are check digits."""
    v = _digits(value)
    if len(v) != 11 or not v.isdigit() or v[0] == "0":
        return False
    d = [int(c) for c in v]
    d10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10
    d11 = sum(d[:10]) % 10
    return d[9] == d10 and d[10] == d11


def tckn_complete(first9: str) -> str:
    """Append the two check digits to nine digits (used by the synthetic generator)."""
    d = [int(c) for c in first9]
    d10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10
    d11 = (sum(d) + d10) % 10
    return first9 + str(d10) + str(d11)


def vkn_valid(value: str) -> bool:
    """Vergi kimlik no (10 digits), Gelir Idaresi check digit algorithm."""
    v = _digits(value)
    if len(v) != 10 or not v.isdigit():
        return False
    return int(v[9]) == _vkn_check(v[:9])


def _vkn_check(first9: str) -> int:
    total = 0
    for i, ch in enumerate(first9):
        tmp = (int(ch) + (9 - i)) % 10
        val = (tmp * (2 ** (9 - i))) % 9
        if tmp != 0 and val == 0:
            val = 9
        total += val
    return (10 - total % 10) % 10


def vkn_complete(first9: str) -> str:
    return first9 + str(_vkn_check(first9))


def iban_valid(value: str) -> bool:
    """ISO 13616 mod 97. TR IBANs are 26 characters."""
    v = value.replace(" ", "").upper()
    if len(v) < 15 or not v[:2].isalpha() or not v[2:4].isdigit():
        return False
    if v.startswith("TR") and len(v) != 26:
        return False
    if not v.isalnum():
        return False
    rearranged = v[4:] + v[:4]
    numeric = "".join(str(int(c, 36)) for c in rearranged)
    return int(numeric) % 97 == 1


def iban_complete(country: str, bban: str) -> str:
    numeric = "".join(str(int(c, 36)) for c in (bban + country + "00"))
    check = 98 - int(numeric) % 97
    return f"{country}{check:02d}{bban}"


def luhn_valid(value: str) -> bool:
    v = _digits(value)
    if not v.isdigit() or not 13 <= len(v) <= 19:
        return False
    total = 0
    for i, ch in enumerate(reversed(v)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def luhn_complete(partial: str) -> str:
    for c in "0123456789":
        if luhn_valid(partial + c):
            return partial + c
    raise ValueError("unreachable")
