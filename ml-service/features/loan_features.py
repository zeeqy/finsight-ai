"""
Loan default features — the single definition shared by training and serving.

Dataset: Lending Club accepted loans 2007-2016 (lending_club_loan_two.csv), target
loan_status == "Charged Off". Only features a FinSight user can supply on the loan form
are used. Amounts are USD, so the model sees ratios, never raw amounts.

Lending Club column -> feature:
  credit_to_income      loan_amnt / annual_inc                  form: loan / (monthly income x 12)
  instalment_to_income  installment / (annual_inc / 12)         form: monthly instalment / monthly income
  existing_dti          dti / 100 (existing debt, excl. new)    form: existing commitments / monthly income
  dsr_after             existing_dti + instalment_to_income     form: DSR after loan / 100
  loan_term_years       term (36 / 60 months) / 12              form: tenure (years)
  years_employed        emp_length ("< 1 year" = 0, "10+" = 10) form: years employed (capped at 10)
  purpose_car/house     purpose grouped                         form: loan type

Excluded on purpose: int_rate, grade, sub_grade. Lending Club sets these from its own
risk assessment, so using them would leak the lender's verdict into the model.

Not in the dataset (so not in the model): age, dependants, employment type. Those form
inputs still affect the DSR band and verdict in Express, just not the ML score.
"""

import numpy as np
import pandas as pd

FEATURES = [
    "credit_to_income",
    "instalment_to_income",
    "existing_dti",
    "dsr_after",
    "loan_term_years",
    "years_employed",
    "purpose_car",
    "purpose_house",
]

FEATURE_LABELS = {
    "credit_to_income": "Loan size vs income",
    "instalment_to_income": "Instalment vs income",
    "existing_dti": "Existing commitments",
    "dsr_after": "DSR after loan",
    "loan_term_years": "Loan tenure",
    "years_employed": "Years employed",
    "purpose_car": "Loan type",
    "purpose_house": "Loan type",
}

# Lending Club purpose -> FinSight loan type (everything else counts as a personal loan)
LC_PURPOSE = {"car": "car", "house": "house", "home_improvement": "house"}

YEARS_EMPLOYED_CAP = 10  # Lending Club records "10+ years" as its top bucket


def _parse_emp_length(s: pd.Series) -> pd.Series:
    years = s.str.extract(r"(\d+)")[0].astype(float)
    return years.where(~s.str.startswith("<", na=False), 0.0)


def _purpose_dummies(loan_type: pd.Series) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "purpose_car": (loan_type == "car").astype(int),
            "purpose_house": (loan_type == "house").astype(int),
        },
        index=loan_type.index,
    )


def lendingclub_to_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build the model matrix from lending_club_loan_two.csv rows."""
    monthly_income = df["annual_inc"] / 12
    instalment_to_income = df["installment"] / monthly_income
    existing_dti = df["dti"] / 100
    out = pd.DataFrame(
        {
            "credit_to_income": df["loan_amnt"] / df["annual_inc"],
            "instalment_to_income": instalment_to_income,
            "existing_dti": existing_dti,
            "dsr_after": existing_dti + instalment_to_income,
            "loan_term_years": df["term"].str.extract(r"(\d+)")[0].astype(float) / 12,
            "years_employed": _parse_emp_length(df["emp_length"]),
        },
        index=df.index,
    )
    loan_type = df["purpose"].map(LC_PURPOSE).fillna("personal")
    out = pd.concat([out, _purpose_dummies(loan_type)], axis=1)
    return out.replace([np.inf, -np.inf], np.nan)[FEATURES]


def form_to_features(p: dict) -> pd.DataFrame:
    """Build a one-row model matrix from the Express /predict/loan payload."""
    income = float(p.get("monthly_income") or 0)
    loan = float(p.get("loan_amount") or 0)
    instalment = float(p.get("monthly_instalment") or 0)
    commitments = float(p.get("existing_commitments") or 0)
    tenure = p.get("tenure_years")
    years_emp = p.get("years_employed")

    instalment_to_income = instalment / income if income > 0 else np.nan
    existing_dti = commitments / income if income > 0 else np.nan
    row = {
        "credit_to_income": loan / (income * 12) if income > 0 else np.nan,
        "instalment_to_income": instalment_to_income,
        "existing_dti": existing_dti,
        "dsr_after": existing_dti + instalment_to_income,
        "loan_term_years": float(tenure) if tenure else (loan / (instalment * 12) if instalment > 0 else np.nan),
        "years_employed": min(float(years_emp), YEARS_EMPLOYED_CAP) if years_emp is not None else np.nan,
    }
    loan_type = p.get("loan_type") or "personal"
    row.update(_purpose_dummies(pd.Series([loan_type])).iloc[0].to_dict())
    return pd.DataFrame([row])[FEATURES]


def out_of_range(X: pd.DataFrame, ranges: dict) -> list:
    """Features in this row above the training data's 99th percentile.

    Only the upper end matters: low ratios (no existing debt, a small loan) are well
    covered by the data, while larger or longer loans than any in the dataset are not.
    """
    flagged = []
    for feature, (_lo, hi) in ranges.items():
        v = X.iloc[0][feature]
        if pd.notna(v) and v > hi:
            flagged.append(feature)
    return flagged
