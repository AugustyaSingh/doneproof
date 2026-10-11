"""Controlled login fixture for testing verification-plan calibration.

This is a toy benchmark, not production authentication code.
All implementations are predefined Python functions; no generated code runs.
"""
from dataclasses import dataclass
from typing import Callable


FIXTURE_ID = "login-auth-v1"


@dataclass(frozen=True)
class LoginScenario:
    scenario_id: str
    description: str
    username: str
    password: str
    account_active: bool
    expected_success: bool


LoginFunction = Callable[[str, str, bool], bool]


def login_correct(username: str, password: str, account_active: bool) -> bool:
    """Reference implementation with the intended behavior."""
    if username != "demo":
        return False
    if password != "correct-horse":
        return False
    if not account_active:
        return False
    return True


def mutant_rejects_valid_login(
    username: str, password: str, account_active: bool
) -> bool:
    """Bug: rejects every login, including valid credentials."""
    return False


def mutant_accepts_wrong_password(
    username: str, password: str, account_active: bool
) -> bool:
    """Bug: accepts any non-empty password for the demo account."""
    if username != "demo" or not account_active:
        return False
    return isinstance(password, str) and bool(password)


def mutant_accepts_empty_password(
    username: str, password: str, account_active: bool
) -> bool:
    """Bug: treats an empty password as valid."""
    if username != "demo" or not account_active:
        return False
    return password in {"correct-horse", ""}


def mutant_allows_inactive_account(
    username: str, password: str, account_active: bool
) -> bool:
    """Bug: ignores whether the account is active."""
    return username == "demo" and password == "correct-horse"


SCENARIOS: dict[str, LoginScenario] = {
    "valid_credentials": LoginScenario(
        "valid_credentials",
        "Valid credentials for an active account should succeed.",
        "demo",
        "correct-horse",
        True,
        True,
    ),
    "wrong_password": LoginScenario(
        "wrong_password",
        "An incorrect password should be rejected.",
        "demo",
        "wrong-password",
        True,
        False,
    ),
    "empty_password": LoginScenario(
        "empty_password",
        "An empty password should be rejected.",
        "demo",
        "",
        True,
        False,
    ),
    "inactive_account": LoginScenario(
        "inactive_account",
        "An inactive account should be rejected.",
        "demo",
        "correct-horse",
        False,
        False,
    ),
    "unknown_user": LoginScenario(
        "unknown_user",
        "An unknown username should be rejected.",
        "unknown",
        "correct-horse",
        True,
        False,
    ),
}


IMPLEMENTATIONS: dict[str, LoginFunction] = {
    "correct": login_correct,
    "rejects_valid_login": mutant_rejects_valid_login,
    "accepts_wrong_password": mutant_accepts_wrong_password,
    "accepts_empty_password": mutant_accepts_empty_password,
    "allows_inactive_account": mutant_allows_inactive_account,
}

MUTANT_IDS = (
    "rejects_valid_login",
    "accepts_wrong_password",
    "accepts_empty_password",
    "allows_inactive_account",
)
