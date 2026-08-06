# Chronicles of the Fall — Hidden Agenda System Specification

## Purpose

Hidden Agendas define how individual factions win when the Empire collapses. The Empire still ends when one Pillar reaches 0. At that moment, every player reveals their Hidden Agenda and evaluates the final state of the Empire.

Use **prebuilt complete Agenda cards**, not live-assembled module cards. You may design the pool from modular objective types, but players only receive complete Agenda cards. This avoids physical-table setup problems such as compatibility tables, public objective drafting, and impossible random combinations.

## Recommended Victory Model

Each Hidden Agenda has four parts:

1. **Primary Legacy** — 4 points.
2. **Secondary Legacy** — 2 points.
3. **Collapse Preference** — 2 points.
4. **Forbidden Future** — subtracts 1 point when true.

A player wins if, at collapse:

- they score at least **6 points**.

Since both 2-point objectives total only 4 points, reaching 6 still requires the Primary Legacy.

If multiple players qualify, the highest Agenda score wins. Tied leaders share victory.

## Physical Setup Method

Use a single deck of complete Hidden Agenda cards.

### Standard setup

1. Shuffle the Hidden Agenda deck.
2. Deal 2 Hidden Agenda cards face down to each player.
3. Each player secretly reads both cards.
4. Each player keeps 1 card as their Hidden Agenda.
5. Each player places the unchosen Agenda face down into a sealed out-of-game discard pile.
6. No player may inspect discarded Agenda cards.

This gives players some agency without revealing choices or requiring a visible draft.

### Faster setup

Deal 1 Hidden Agenda to each player.

### Higher-agency setup

Deal 3 Hidden Agenda cards to each player. Each player keeps 1 and seals away the other 2.

### Physical production note

All Hidden Agenda cards should have identical backs. Do not separate Agenda modules by visible type, color, or icon on the card back.

## Supported Evaluation Vocabulary

Evaluate Agenda conditions at the exact moment of collapse, after resolving the effect that caused the Pillar to reach 0.

### Supported tags

- Culture
- Diplomacy
- Faith
- Industry
- Military
- Sanitary
- Science

### Supported resources

- labor
- food
- favor
- material
- influence
- wealth
- knowledge

### Production and capacity

`production_at_least(resource, amount)` means the Empire currently produces at least that many of the resource each Era from built Cities and Structures.

`capacity_at_least(resource, amount)` means current production of that resource plus stored resources of that type at collapse.

For rare resources such as Knowledge, capacity is often more appropriate than production.

## Supported Condition Types

The initial implementation should support:

- `tag_count`
- `tag_compare`
- `tag_sum_compare`
- `production`
- `capacity`
- `collapsed_pillar`
- `not_collapsed_pillar`
- `highest_surviving_pillar`
- `token_count`
- `tag_plus_token_count`
- `no_city_has_plague_exceeding_sanitary`
- `distinct_tags_at_least`
- `all_tags_at_most`
- `tag_is_highest`

See the JSON agenda catalog for examples of each condition shape.

## Supported Primary Legacy Options

Primary Legacies are mandatory and worth 4 points.

1. **Sacred Legacy** — Faith ≥ 3 and Favor production ≥ 2.
2. **Scholarly Legacy** — Science ≥ 2 and Knowledge capacity ≥ 1.
3. **Martial Legacy** — Military + Fortified tokens ≥ 4.
4. **Industrial Legacy** — Industry ≥ 3 and Material production ≥ 2.
5. **Civic Legacy** — Culture ≥ 3.
6. **Diplomatic Legacy** — Diplomacy ≥ 2 and Influence production ≥ 1.
7. **Sanitary Legacy** — Sanitary ≥ 3 and no City has Plague greater than Sanitary.
8. **Balanced Legacy** — At least four scoring tags are present and no scoring tag is greater than 3.

## Supported Secondary Legacy Options

Secondary Legacies are worth 2 points.

- Culture ≥ 2
- Faith ≥ 2
- Industry ≥ 2
- Military ≥ 2
- Sanitary ≥ 2
- Diplomacy ≥ 1
- Science ≥ 1
- Knowledge capacity ≥ 1
- Favor production ≥ 2
- Material production ≥ 2
- Wealth production ≥ 2
- Influence production ≥ 1
- At least 1 Fortified token
- No Global Unrest at collapse
- No Plague tokens at collapse

## Supported Collapse Preference Options

Collapse Preferences are worth 2 points.

- Treasury is the collapsed Pillar.
- Stability is the collapsed Pillar.
- Morale is the collapsed Pillar.
- Treasury is not the collapsed Pillar.
- Stability is not the collapsed Pillar.
- Morale is not the collapsed Pillar.
- Treasury is the highest surviving Pillar.
- Stability is the highest surviving Pillar.
- Morale is the highest surviving Pillar.

## Supported Forbidden Future Options

Forbidden Futures are veto conditions. If the Forbidden Future is true, the player cannot win.

- Military is the highest scoring tag.
- Science exceeds Faith.
- Faith exceeds Science.
- Diplomacy is 3 or higher.
- Knowledge capacity is 2 or higher.
- Treasury is the collapsed Pillar.
- Stability is the collapsed Pillar.
- Morale is the collapsed Pillar.
- Morale is the highest surviving Pillar.
- More than 1 Fortified token exists.
- No Plague tokens remain.
- Industry + Military exceeds Culture + Diplomacy.
- Faith + Culture exceeds Science + Diplomacy.
- Science + Diplomacy exceeds Faith + Culture.

## Recommended Implementation

The game engine should treat Hidden Agendas as catalog entries with:

- `id`
- `name`
- `summary`
- `primary`
- `secondary`
- `collapse`
- `forbidden`
- `max_points`
- `win_threshold`
- `primary_mandatory`
- `forbidden_is_veto`

At collapse:

1. Evaluate the Primary Legacy.
2. Evaluate the Forbidden Future.
3. If Primary is false or Forbidden is true, the player cannot win.
4. Otherwise, add points from Primary, Secondary, and Collapse.
5. If total score is at least 6, the player wins.
6. If multiple players win, compare total score.
