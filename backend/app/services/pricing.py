COVERAGE = {"Basic": 5000, "Moderate": 10000, "Premium": 20000}


def plan_prices(base: float) -> dict:
    """Weekly price of each plan from the base AI price. Always Basic < Moderate < Premium.
    The frontend uses the same formula."""
    base = round(base) if base and base > 0 else 20
    moderate = round(base * 1.25)
    premium = max(round(base * 1.5), moderate + 5)
    return {"Basic": base, "Moderate": moderate, "Premium": premium}
