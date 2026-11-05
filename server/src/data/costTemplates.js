/**
 * FinSight AI - Module 4 cost template seed data.
 * Every figure must cite a source. Items with no sourced figure are seeded at RM0
 * so the user enters their own estimate. House stamp duty and legal fees, and car road tax,
 * depend on the price or engine size, so they are worked out by services/purchaseCosts.js.
 *
 * The table is reseeded on startup whenever this list changes (db.js compares the rows).
 */

const SRC_HAJI = 'Utusan Malaysia (Oct 2025), Kos haji kekal RM33,300 seorang (1447H/2026)';
const SRC_WEDDING = 'iMoney (2026), Wedding costs 2026: Malay wedding RM30k-80k, hantaran RM5k-10k, catering 35-50%';
const SRC_CHILD = 'New Straits Times (Aug 2025), The cost of raising a child in Malaysia (birth-18)';
const PENDING = 'No published figure - enter your own estimate';
const FROM_PRICE = 'Worked out from the price with the published scale';

const COST_TEMPLATES = [
  // Kahwin: midpoints of the iMoney ranges (total RM55k midpoint)
  { goal_type: 'kahwin', income_group: 'ALL', item_name: 'Hantaran', default_cost: 7500, source: `${SRC_WEDDING} (midpoint)` },
  { goal_type: 'kahwin', income_group: 'ALL', item_name: 'Catering', default_cost: 23375, source: `${SRC_WEDDING} (42.5% of RM55k midpoint)` },
  { goal_type: 'kahwin', income_group: 'ALL', item_name: 'Venue, attire, photography & rings', default_cost: 24125, source: `${SRC_WEDDING} (remainder of RM55k midpoint)` },
  { goal_type: 'kahwin', income_group: 'ALL', item_name: 'Mas kahwin', default_cost: 0, source: 'Set by each state religious authority - enter your state rate' },
  { goal_type: 'kahwin', income_group: 'ALL', item_name: 'Honeymoon', default_cost: 0, source: PENDING },

  // Children: source gives B40 and T20 ranges only
  { goal_type: 'children', income_group: 'B40', item_name: 'Raising a child, birth to 18', default_cost: 124000, source: `${SRC_CHILD}: B40 RM93k-155k (midpoint)` },
  { goal_type: 'children', income_group: 'T20', item_name: 'Raising a child, birth to 18', default_cost: 360000, source: `${SRC_CHILD}: T20 RM250k-470k (midpoint)` },
  { goal_type: 'children', income_group: 'ALL', item_name: 'Raising a child, birth to 18', default_cost: 0, source: `${SRC_CHILD} gives B40/T20 only - enter your own estimate` },

  // Haji 1447H/2026
  { goal_type: 'haji', income_group: 'B40', item_name: 'Haji package (B40 subsidised rate)', default_cost: 15000, source: SRC_HAJI },
  { goal_type: 'haji', income_group: 'M40', item_name: 'Haji package (M40 subsidised rate)', default_cost: 23500, source: SRC_HAJI },
  { goal_type: 'haji', income_group: 'T20', item_name: 'Haji package (T20, full cost)', default_cost: 33300, source: SRC_HAJI },
  { goal_type: 'haji', income_group: 'ALL', item_name: 'Haji package (full cost)', default_cost: 33300, source: SRC_HAJI },

  // House: target = down payment + upfront costs. Down payment is auto-filled from the asset price in the UI.
  { goal_type: 'house', income_group: 'ALL', item_name: 'Down payment', default_cost: 0, source: 'Calculated from property price x down payment %' },
  { goal_type: 'house', income_group: 'ALL', item_name: 'SPA & loan agreement legal fees', default_cost: 0, source: FROM_PRICE },
  { goal_type: 'house', income_group: 'ALL', item_name: 'Stamp duty (MOT & loan)', default_cost: 0, source: FROM_PRICE },
  { goal_type: 'house', income_group: 'ALL', item_name: 'Valuation fee', default_cost: 0, source: 'Set by the valuers\' board scale - ask your bank or valuer' },
  { goal_type: 'house', income_group: 'ALL', item_name: 'Renovation & furnishing', default_cost: 0, source: PENDING },
  { goal_type: 'house', income_group: 'ALL', item_name: 'Moving costs', default_cost: 0, source: PENDING },

  // Car
  { goal_type: 'car', income_group: 'ALL', item_name: 'Down payment', default_cost: 0, source: 'Calculated from car price x down payment %' },
  { goal_type: 'car', income_group: 'ALL', item_name: 'Road tax (first year)', default_cost: 0, source: 'Worked out from the engine size with the JPJ rates' },
  { goal_type: 'car', income_group: 'ALL', item_name: 'Insurance (first year)', default_cost: 0, source: 'Priced by each insurer since 2017 - enter your quote' },
  { goal_type: 'car', income_group: 'ALL', item_name: 'Registration & number plate', default_cost: 0, source: PENDING },
  { goal_type: 'car', income_group: 'ALL', item_name: 'Accessories & tinting', default_cost: 0, source: PENDING },
];

module.exports = { COST_TEMPLATES };
