"""
Labelled Malaysian transaction descriptions for the Module 1 categoriser.

There is no public, labelled Malaysian bank-transaction dataset, so this file is the
project's own labelled data: real Malaysian merchants and payees, labelled by category
by the author, then written out the way Bank Islam (CASATIA), Maybank2u and CIMB CSV
statements print them:

  - the merchant field is often cut at 20 characters ("DIGI TELECOMMUNICATI")
  - a branch / location and country code is appended ("SHAH ALAM MY", "SELANGOR SELMY")
  - the channel is sometimes included ("MyDEBIT SA PURCHASE", "DuitNow QR", "IB FPX")

Every row keeps its `merchant`, so evaluation can hold out whole merchants
(GroupKFold): the model is scored on shops it never saw in training, which is the
real question for a categoriser.

Income is not a class: the upload sets Income from the + sign / credit column.
`Others` covers money that is none of the spending categories: cash withdrawals,
bank fees, insurance/takaful, tax and zakat, council payments.
"""

import random

import pandas as pd

CATEGORIES = [
    "Food & Dining",
    "Groceries",
    "Transport",
    "Shopping",
    "Utilities",
    "Healthcare",
    "Entertainment",
    "Education",
    "Personal Transfer",
    "Others",
]

MERCHANTS = {
    "Food & Dining": [
        "MCDONALD'S", "KFC", "PIZZA HUT RESTAURANT", "DOMINO'S PIZZA", "MARRYBROWN", "TEXAS CHICKEN",
        "SUBWAY", "BURGER KING", "A&W RESTAURANT", "SECRET RECIPE", "OLDTOWN WHITE COFFEE", "PAPPARICH",
        "STARBUCKS COFFEE", "ZUS COFFEE", "TEALIVE", "CHATIME", "LUCKIN COFFEE", "GIGI COFFEE",
        "COFFEE BEAN & TEA LEAF", "KENANGAN COFFEE", "BASKIN ROBBINS", "LLAOLLAO", "DUNKIN DONUTS",
        "AUNTIE ANNE'S", "ROTIBOY", "BREAD HISTORY", "TOUS LES JOURS", "SUSHI KING", "SUKIYA",
        "NANDO'S", "WINGSTOP", "FISH & CO", "CHAGEE", "MIXUE ICE CREAM", "RESTORAN NASI KANDAR PELITA",
        "RESTORAN SRI MELAYU", "RESTORAN AL-BAIK", "KEDAI MAKAN ANA IKAN BAKAR", "NASI LEMAK WANJO",
        "MAMAK CORNER", "KOPITIAM SELERA", "DAILY FRESH KOPITIAM", "THE CHICKEN RICE SHOP", "DIM SUM HOUSE",
        "GRABFOOD", "FOODPANDA", "SHOPEEFOOD", "AYAM GEPUK PAK GEMBUS", "MYBURGERLAB", "SHIN LAKSA CAFE",
    ],
    "Groceries": [
        "LOTUS'S", "AEON BIG", "AEON CO (M) BHD SUPERMARKET", "GIANT HYPERMARKET", "MYDIN", "ECONSAVE",
        "JAYA GROCER", "VILLAGE GROCER", "COLD STORAGE", "MERCATO", "HERO MARKET", "NSK TRADE CITY",
        "99 SPEEDMART", "KK SUPER MART", "FAMILYMART", "7-ELEVEN", "MYNEWS", "SUPER SEVEN CASH & CARRY",
        "PASARAYA BILAL", "THE STORE", "PACIFIC HYPERMARKET", "BILLION SHOPPING CENTRE", "SEGI FRESH",
        "TF VALUE-MART", "PASAR TANI", "HAPPYFRESH", "GRABMART", "PANDAMART", "AEON MAXVALU", "SUNSHINE WHOLESALE MART",
    ],
    "Transport": [
        "PETRONAS", "SHELL", "PETRON", "CALTEX", "BHPETROL", "GRAB", "MYTEKSI SDN BHD", "AIRASIA RIDE",
        "INDRIVE", "MAXIM", "RAPID KL", "MRT CORP", "KTM BERHAD", "ERL KLIA EKSPRES", "TOUCH N GO",
        "TNG EWALLET RELOAD", "PLUS MALAYSIA BERHAD", "SMART TAG RELOAD", "SEMASA PARKING", "FLEXI PARKING",
        "CENTRAL PARKING", "PARKING MALL", "JOMPARKING", "SECURE PARKING", "PARKIR SELANGOR", "MBSA PARKING",
        "JPJ ROAD TAX", "MYEG JPJ", "PUSPAKOM", "AUTOBACS", "PROTON SERVICE CENTRE", "PERODUA SERVICE CENTRE",
        "GOODYEAR AUTOCARE", "CARSOME", "TRANSNASIONAL BAS", "EASYBOOK BUS TICKET", "REDBUS",
    ],
    "Shopping": [
        "SHOPEE", "LAZADA", "TIKTOK SHOP", "ZALORA", "UNIQLO", "H&M", "ZARA", "PADINI", "CORTINA WATCH",
        "COTTON ON", "BRANDS OUTLET", "MR DIY", "MR TOY", "DAISO", "KAISON", "IKEA", "HARVEY NORMAN",
        "SENHENG", "COURTS", "SWITCH", "MACHINES", "SAMSUNG STORE", "WATSONS", "GUARDIAN", "SEPHORA",
        "SASA COSMETICS", "POPULAR BOOKSTORE", "MPH BOOKSTORE", "DECATHLON", "SPORTS DIRECT", "AL-IKHSAN SPORTS",
        "BATA", "VINCCI", "CHARLES & KEITH", "PANDORA", "HABIB JEWELS", "POH KONG", "PARKSON", "AEON STORE",
        "TEMU", "ALIEXPRESS", "AMAZON",
    ],
    "Utilities": [
        "TENAGA NASIONAL BERHAD", "TNB", "AIR SELANGOR", "SYABAS", "INDAH WATER KONSORTIUM", "SAJ RANHILL",
        "AIR KELANTAN", "SESB SABAH ELECTRICITY", "TELEKOM MALAYSIA UNIFI", "UNIFI", "TIME DOTCOM",
        "MAXIS BROADBAND", "MAXIS", "HOTLINK", "CELCOMDIGI", "DIGI TELECOMMUNICATIONS", "CELCOM AXIATA",
        "U MOBILE", "YES 4G", "YOODO", "TUNE TALK", "REDONE", "XOX MOBILE", "ASTRO", "GAS MALAYSIA",
        "PETRONAS DAGANGAN LPG", "CUKAI TAKSIRAN MBPJ", "MAJLIS BANDARAYA SHAH ALAM",
    ],
    "Healthcare": [
        "KLINIK MEDIVIRON", "KLINIK KESIHATAN", "KLINIK PERGIGIAN", "KLINIK DR HALIM", "QUALITAS MEDICAL",
        "KPJ HOSPITAL", "SUNWAY MEDICAL CENTRE", "PANTAI HOSPITAL", "GLENEAGLES HOSPITAL", "COLUMBIA ASIA",
        "HOSPITAL PUSRAWI", "PRINCE COURT MEDICAL", "PUSAT PERUBATAN UKM", "CARING PHARMACY", "BIG PHARMACY",
        "ALPRO PHARMACY", "AA PHARMACY", "FARMASI MEDISINS", "HEALTH LANE FAMILY PHARMACY", "DOC2US",
        "BP HEALTHCARE", "PATHLAB", "LAB INNOVA", "OWNDAYS OPTICAL", "FOCUS POINT OPTICAL", "PRIMER DENTAL",
        "SMILE DENTAL CLINIC", "FISIOTERAPI", "BUMI DENTAL",
    ],
    "Entertainment": [
        "NETFLIX", "SPOTIFY", "YOUTUBE PREMIUM", "DISNEY+ HOTSTAR", "VIU", "IQIYI", "APPLE.COM/BILL",
        "GOOGLE PLAY", "STEAM GAMES", "PLAYSTATION NETWORK", "NINTENDO ESHOP", "XBOX", "RAZER GOLD",
        "CODASHOP", "GSC CINEMAS", "TGV CINEMAS", "MBO CINEMAS", "LOTUS FIVESTAR CINEMA", "DADI CINEMA",
        "TICKETMELON", "MYTICKET ASIA", "BIGTIX", "SUNWAY LAGOON", "GENTING SKYWORLDS", "ZOO NEGARA",
        "AQUARIA KLCC", "PETROSAINS", "KIDZANIA", "RED BOX KARAOKE", "NEWAY KARAOKE", "COSMIC BOWL",
        "ANYTIME FITNESS", "CELEBRITY FITNESS", "FITNESS FIRST", "KLOOK TRAVEL", "AGODA", "AIRASIA FLIGHT",
    ],
    "Education": [
        "UNIVERSITI TEKNOLOGI MARA", "UITM", "UNIVERSITI MALAYA", "UNIVERSITI KEBANGSAAN MALAYSIA",
        "UNIVERSITI PUTRA MALAYSIA", "UNIVERSITI SAINS MALAYSIA", "UNIVERSITI TEKNOLOGI MALAYSIA",
        "UNIVERSITI UTARA MALAYSIA", "TAYLOR'S UNIVERSITY", "SUNWAY UNIVERSITY", "UCSI UNIVERSITY",
        "ASIA PACIFIC UNIVERSITY", "MULTIMEDIA UNIVERSITY", "POLITEKNIK", "KOLEJ MATRIKULASI",
        "PTPTN", "PERBADANAN TABUNG PENDIDIKAN", "MARA EDUCATION", "COURSERA", "UDEMY", "DUOLINGO",
        "BRITISH COUNCIL", "TADIKA KEMAS", "TADIKA PERMATA", "SRI KDU SCHOOL", "KUMON", "PUSAT TUISYEN BESTARI",
        "SEKOLAH AGAMA", "YURAN SEKOLAH",
    ],
    "Others": [
        "ATM CASH WITHDRAWAL", "MEPS ATM WITHDRAWAL", "CASH WITHDRAWAL", "SERVICE CHARGE", "ANNUAL CARD FEE",
        "DEBIT CARD FEE", "STAMP DUTY", "IBG FEE", "TAKAFUL IKHLAS", "PRUDENTIAL BSN TAKAFUL", "ETIQA TAKAFUL",
        "GREAT EASTERN LIFE", "AIA BHD", "ALLIANZ MALAYSIA", "ZURICH INSURANCE", "LEMBAGA HASIL DALAM NEGERI",
        "LHDN CUKAI PENDAPATAN", "ZAKAT SELANGOR", "PUSAT PUNGUTAN ZAKAT", "LEMBAGA ZAKAT", "KWSP EPF",
        "PERKESO SOCSO", "ASNB PELABURAN", "TABUNG HAJI SIMPANAN", "CREDIT CARD PAYMENT", "LOAN REPAYMENT",
        "SAMAN PDRM", "KOMPAUN MAJLIS", "SUMBANGAN MASJID", "DERMA YAYASAN",
    ],
}

# Personal transfers are to people, so they are generated from common Malaysian name parts
MALAY_FIRST = ["MUHAMMAD", "MOHD", "AHMAD", "NUR", "NURUL", "SITI", "AMIR", "AIMAN", "FARIS", "HAZIQ",
               "AISYAH", "AQILAH", "IRFAN", "SYAFIQ", "DANIAL", "ZULKIFLI", "FARAH", "HANIS", "IZZAT", "AFIQ"]
MALAY_SECOND = ["AMIRUL", "HAKIM", "IMAN", "ADAM", "AINA", "SYAZWANI", "NAJWA", "HARIS", "ARIF", "FATIN"]
MALAY_FATHER = ["ABDULLAH", "ISMAIL", "RAHMAN", "HASSAN", "OTHMAN", "YUSOF", "IBRAHIM", "SALLEH", "HAMZAH", "ZAKARIA"]
CHINESE_NAMES = ["TAN WEI MING", "LIM SIEW LING", "LEE CHONG WEI", "WONG KAH HOE", "ONG MEI LING", "CHAN KOK LEONG",
                 "NG JIA HUI", "TEOH BOON KIAT", "GOH SU YIN", "YAP CHEE KEONG"]
INDIAN_NAMES = ["KUMAR A/L RAJAN", "PRIYA A/P MURUGAN", "SURESH A/L KANNAN", "KAVITHA A/P RAVI",
                "GANESH A/L MUTHU", "DEVI A/P SUBRAMANIAM", "ARUN A/L SELVAM", "LATHA A/P KRISHNAN"]

LOCATIONS = ["SHAH ALAM MY", "KUALA LUMPUR KULMY", "SELANGOR SELMY", "PETALING JAYASELMY", "SUBANG JAYA MY",
             "PUTRAJAYA MY", "JOHOR BAHRU JHRMY", "PULAU PINANG MY", "IPOH PRKMY", "KOTA BHARU MY", "SEREMBAN NS MY",
             "MELAKA MY", "KUANTAN PHG MY", "SG BULOH MY", "CYBERJAYA MY", "BANGI SELMY", "KLANG SELANGOR MY",
             "SEPANG SELMY", "AMPANG MY", "CHERAS KL MY", "PUCHONG SELMY", "KAJANG MY", "SETIA ALAM MY"]
OUTLETS = ["MID VALLEY", "SUNWAY PYRAMID", "I-CITY", "PAVILION", "IOI CITY", "ONE UTAMA", "KLCC", "NU SENTRAL",
           "AEON BUKIT TINGGI", "SETIA CITY", "TTDI", "BANGSAR", "SEKSYEN 7", "SEKSYEN 13", "JLN TAR", "DESA PARKCITY",
           "GSTAND", "R&R SG BULOH", "KESAS", "FEDERAL HWAY"]

CARD_CHANNELS = ["MyDEBIT SA PURCHASE", "MyDEBIT SA SALES.CMP", "BIDC RTL POST NON US", "VISA DEBIT PURCHASE",
                 "CARD PURCHASE", "POS PURCHASE", "DEBIT CARD"]
ONLINE_CHANNELS = ["IB FPX (DEBIT) - SA", "FPX PAYMENT", "JOMPAY", "IBG BILL PAYMENT", "M2U BILL PAYMENT",
                   "AUTO DEBIT", "DUITNOW QR OU", "DUITNOW QR"]
TRANSFER_CHANNELS = ["DuitNow Transfer", "DUITNOW QR P2P", "IBG TRANSFER", "FUND TRANSFER", "IBFT TRANSFER",
                     "INSTANT TRANSFER", "TRANSFER TO A/C", "M2U TRANSFER"]

ONLINE_CATEGORIES = {"Utilities", "Education", "Others", "Entertainment"}


def _person_name(rng):
    style = rng.random()
    if style < 0.6:
        first = rng.choice(MALAY_FIRST)
        mid = rng.choice(MALAY_SECOND) if rng.random() < 0.5 else ""
        link = rng.choice(["BIN", "BINTI"])
        return " ".join(p for p in [first, mid, link, rng.choice(MALAY_FATHER)] if p)
    if style < 0.8:
        return rng.choice(CHINESE_NAMES)
    return rng.choice(INDIAN_NAMES)


def _merchant_text(name, category, rng):
    """One statement-style rendering of a merchant name."""
    text = name
    if rng.random() < 0.35:
        text = f"{text}-{rng.choice(OUTLETS)}"
    if rng.random() < 0.15:
        text = f"{text} {rng.randint(100, 9999)}"
    if rng.random() < 0.15:
        text = f"{text} SDN BHD" if rng.random() < 0.7 else f"{text} (M) SB"
    if rng.random() < 0.45:
        text = text[:20]  # Bank Islam (CASATIA) cuts the merchant field at 20 characters
    if rng.random() < 0.55:
        text = f"{text} {rng.choice(LOCATIONS)}"
    if rng.random() < 0.4:
        channel_pool = ONLINE_CHANNELS if category in ONLINE_CATEGORIES else CARD_CHANNELS
        text = f"{text} {rng.choice(channel_pool)}"
    if rng.random() < 0.3:
        text = text.lower() if rng.random() < 0.3 else text.title()
    return text


def _transfer_text(name, rng):
    text = name[:20] if rng.random() < 0.6 else name
    if rng.random() < 0.6:
        text = f"{text} {rng.choice(TRANSFER_CHANNELS)}"
    if rng.random() < 0.25:
        text = f"{text} {rng.choice(['MAKAN', 'DUIT SEWA', 'HUTANG', 'BAYAR BALIK', 'TQ', 'BIRTHDAY', 'BELANJA'])}"
    return text


def build_malaysian_dataset(per_merchant=12, n_transfers=600, seed=42):
    """Return a DataFrame of (description, category, merchant) rows."""
    rng = random.Random(seed)
    rows = []
    for category, names in MERCHANTS.items():
        for name in names:
            for _ in range(per_merchant):
                rows.append({"description": _merchant_text(name, category, rng), "category": category, "merchant": name})
    for i in range(n_transfers):
        name = _person_name(rng)
        # group transfers by name so held-out folds contain unseen people too
        rows.append({"description": _transfer_text(name, rng), "category": "Personal Transfer", "merchant": f"PERSON:{name}"})
    return pd.DataFrame(rows)


# Public US data (DoDataThings/us-bank-transaction-categories-v2, MIT licence) mapped to
# FinSight categories. Income is dropped (set by the + sign); categories with no
# FinSight equivalent become Others; Travel is dropped (airlines/hotels are ambiguous here).
US_CATEGORY_MAP = {
    "Restaurants": "Food & Dining",
    "Groceries": "Groceries",
    "Transportation": "Transport",
    "Shopping": "Shopping",
    "Personal Care": "Shopping",
    "Utilities": "Utilities",
    "Healthcare": "Healthcare",
    "Entertainment": "Entertainment",
    "Subscription": "Entertainment",
    "Education": "Education",
    "Transfer": "Personal Transfer",
    "Fees": "Others",
    "Insurance": "Others",
    "Mortgage": "Others",
    "Rent": "Others",
}


def clean_us_description(text: str) -> str:
    """Drop the dataset's "[debit] " sign prefix so the text looks like the rest."""
    return text.replace("[debit] ", "").replace("[credit] ", "")
