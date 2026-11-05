"""
Text features for the transaction categoriser — shared by training and serving.

TF-IDF on two views of the description:
  - character n-grams (2-5, within word boundaries): robust to bank truncation
    ("DIGI TELECOMMUNICATI"), joined words ("TOUCHNGO") and spelling variants
  - word unigrams + bigrams: picks up whole keywords ("restoran", "parking", "bin")

Numbers are replaced by a single token so reference numbers, outlet codes and
amounts do not become features.
"""

import re

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion

_DIGITS = re.compile(r"\d+")
_JUNK = re.compile(r"[^a-z0-9&'/ ]+")
_SPACES = re.compile(r"\s+")


def normalise(text: str) -> str:
    text = str(text or "").lower()
    text = _DIGITS.sub(" 0 ", text)
    text = _JUNK.sub(" ", text)
    return _SPACES.sub(" ", text).strip()


def build_vectoriser():
    return FeatureUnion(
        [
            (
                "chars",
                TfidfVectorizer(
                    preprocessor=normalise, analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True, max_features=60000
                ),
            ),
            (
                "words",
                TfidfVectorizer(preprocessor=normalise, analyzer="word", ngram_range=(1, 2), min_df=2, sublinear_tf=True),
            ),
        ]
    )
