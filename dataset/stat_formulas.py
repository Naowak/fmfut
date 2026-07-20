"""
Calcul des 6 statistiques FUT Manager à partir des sous-statistiques FIFA/EA FC.

Toutes les formules sont volontairement centralisées dans ce fichier.
Pour rééquilibrer le jeu, modifier les poids ici puis reconstruire la base.

Règles :
- Entrées attendues dans l'intervalle 0..100.
- Sorties clampées dans l'intervalle 1..100.
- Si une sous-stat manque, les poids disponibles sont renormalisés.
"""

from __future__ import annotations

from typing import Any, Mapping


OUTFIELD_FORMULAS: dict[str, dict[str, float]] = {
    "speed": {
        "movement_acceleration": 0.45,
        "movement_sprint_speed": 0.55,
    },
    "shooting": {
        "attacking_finishing": 0.45,
        "power_shot_power": 0.25,
        "power_long_shots": 0.15,
        "attacking_volleys": 0.10,
        "mentality_penalties": 0.05,
    },
    "passing": {
        "attacking_short_passing": 0.30,
        "mentality_vision": 0.25,
        "skill_long_passing": 0.20,
        "attacking_crossing": 0.15,
        "skill_curve": 0.10,
    },
    "physical": {
        "power_strength": 0.30,
        "power_stamina": 0.25,
        "mentality_aggression": 0.20,
        "power_jumping": 0.15,
        "movement_balance": 0.10,
    },
    "technique": {
        "skill_ball_control": 0.35,
        "skill_dribbling": 0.30,
        "movement_agility": 0.15,
        "movement_balance": 0.10,
        "mentality_composure": 0.10,
    },
}

# L'intelligence utilise une composante "lecture du poste" :
# max(positioning offensif, marking awareness défensif).
INTELLIGENCE_WEIGHTS = {
    "movement_reactions": 0.25,
    "mentality_composure": 0.20,
    "mentality_vision": 0.20,
    "_position_awareness": 0.20,
    "mentality_interceptions": 0.15,
}


GOALKEEPER_FORMULAS: dict[str, dict[str, float]] = {
    "speed": {
        "goalkeeping_speed": 0.50,
        "movement_acceleration": 0.25,
        "movement_sprint_speed": 0.25,
    },
    "shooting": {
        "goalkeeping_kicking": 0.70,
        "power_shot_power": 0.30,
    },
    "passing": {
        "goalkeeping_kicking": 0.50,
        "attacking_short_passing": 0.25,
        "skill_long_passing": 0.25,
    },
    "physical": {
        "power_strength": 0.35,
        "power_jumping": 0.25,
        "power_stamina": 0.20,
        "mentality_aggression": 0.20,
    },
    "technique": {
        "goalkeeping_handling": 0.40,
        "skill_ball_control": 0.25,
        "goalkeeping_diving": 0.20,
        "mentality_composure": 0.15,
    },
    "intelligence": {
        "goalkeeping_positioning": 0.40,
        "goalkeeping_reflexes": 0.25,
        "movement_reactions": 0.20,
        "mentality_composure": 0.15,
    },
}


SOURCE_STAT_COLUMNS = sorted({
    key
    for formula in list(OUTFIELD_FORMULAS.values()) + list(GOALKEEPER_FORMULAS.values())
    for key in formula
} | {
    "movement_reactions",
    "mentality_composure",
    "mentality_vision",
    "mentality_positioning",
    "mentality_interceptions",
    "defending_marking_awareness",
})


def _to_float(value: Any) -> float | None:
    """Convertit une valeur CSV en float, ou None si absente/invalide."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    value = str(value).strip()
    if not value or value.lower() in {"nan", "none", "null", "n/a"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _clamp_rating(value: float) -> int:
    return max(1, min(100, int(round(value))))


def weighted_rating(row: Mapping[str, Any], weights: Mapping[str, float]) -> int:
    """
    Moyenne pondérée avec renormalisation automatique si certaines valeurs manquent.
    Lève ValueError si aucune sous-stat nécessaire n'est disponible.
    """
    total = 0.0
    total_weight = 0.0

    for column, weight in weights.items():
        value = _to_float(row.get(column))
        if value is None:
            continue
        total += value * weight
        total_weight += weight

    if total_weight == 0:
        raise ValueError(f"Aucune donnée disponible pour calculer {list(weights)}")

    return _clamp_rating(total / total_weight)


def calculate_outfield_stats(row: Mapping[str, Any]) -> dict[str, int]:
    stats = {
        stat_name: weighted_rating(row, weights)
        for stat_name, weights in OUTFIELD_FORMULAS.items()
    }

    positioning = _to_float(row.get("mentality_positioning"))
    awareness = _to_float(row.get("defending_marking_awareness"))

    if positioning is None and awareness is None:
        position_awareness = None
    elif positioning is None:
        position_awareness = awareness
    elif awareness is None:
        position_awareness = positioning
    else:
        position_awareness = max(positioning, awareness)

    intelligence_row = dict(row)
    intelligence_row["_position_awareness"] = position_awareness
    stats["intelligence"] = weighted_rating(intelligence_row, INTELLIGENCE_WEIGHTS)

    return stats


def calculate_goalkeeper_stats(row: Mapping[str, Any]) -> dict[str, int]:
    return {
        stat_name: weighted_rating(row, weights)
        for stat_name, weights in GOALKEEPER_FORMULAS.items()
    }


def calculate_game_stats(
    row: Mapping[str, Any],
    is_goalkeeper: bool,
) -> dict[str, int]:
    if is_goalkeeper:
        return calculate_goalkeeper_stats(row)
    return calculate_outfield_stats(row)
