"""
Conversion des postes FIFA vers les postes simplifiés de FUT Manager.
"""

from __future__ import annotations


POSITION_MAP: dict[str, str] = {
    "GK": "GK",

    "LB": "LB",
    "LWB": "LB",
    "RB": "RB",
    "RWB": "RB",

    "CB": "CB",

    "CDM": "CDM",
    "LDM": "CDM",
    "RDM": "CDM",

    "CM": "CM",
    "LCM": "CM",
    "RCM": "CM",

    "CAM": "CAM",
    "LAM": "CAM",
    "RAM": "CAM",
    "CF": "CAM",

    "LM": "LM",
    "RM": "RM",

    "LW": "LW",
    "LF": "LW",

    "RW": "RW",
    "RF": "RW",

    "ST": "ST",
    "LS": "ST",
    "RS": "ST",
}


def parse_source_positions(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [
        position.strip().upper()
        for position in str(raw).split(",")
        if position.strip()
    ]


def map_position(source_position: str) -> str | None:
    return POSITION_MAP.get(source_position.strip().upper())


def map_positions(source_positions: list[str]) -> list[str]:
    """Mappe et déduplique en conservant l'ordre du CSV."""
    result: list[str] = []
    for source_position in source_positions:
        mapped = map_position(source_position)
        if mapped and mapped not in result:
            result.append(mapped)
    return result
