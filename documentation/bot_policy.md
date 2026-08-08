# Bot Policy

Single-player versus bots is a backend game mode for three, four, or five total
players. Player 1 is human; every other seat is controlled by the bot policy.

## Decision Boundary

The game engine remains the authority for rules and exposes `possible_actions`.
The bot selects only from that list and applies the selected action through
`perform_action`. It does not bypass costs, placement rules, phase ownership, or
effect resolution.

After every human action, the room service advances consecutive bot decisions and
unambiguous system steps. It stops as soon as the human has a decision. A safety
limit prevents a malformed state from producing an infinite bot loop.

## Evaluation

Each bot converts its private Hidden Agenda into preferences for:

- tags;
- resource production and stored resources;
- Pillar values;
- Plague, Unrest, and Fortified tokens.

Primary objectives carry the most weight, Secondary and Collapse objectives carry
less, and Forbidden conditions reverse the relevant preference. An objective that
is already satisfied receives a small marginal weight so the bot does not keep
overproducing it at the expense of unfinished objectives.

For ordinary choices, the bot applies each legal candidate to a copied state and
selects the resulting board with the highest value. This one-step evaluation is
used for placement, token placement, destruction, resource effects, and similar
choices. General resource gains and conversions prefer resources with greater
Agenda value and spend resources with lower Agenda value.

## Plotting And Schemes

During Plotting, the bot:

1. Scores playable cards from their tags, production, effects, costs, placement,
   and Agenda contribution.
2. Submits the highest-valued playable Structure or Crisis to the common pool.
3. Also plays a positive-value Edict when its current Ministry assignment permits
   it.
4. If no common submission is available, plays the best legal Edict fallback
   because a player must still play at least one card when able.

Plague-producing cards receive an additional timing penalty. The penalty is
largest while the bot has completed no positive Agenda objective and while the
Empire lacks enough Sanitary tags to cover the resulting Plague. It decreases
with weighted Agenda progress and disappears once the bot has reached its Agenda
win threshold; the normal negative value of Plague still applies afterward.

Before committing, the bot may move one high-value, currently unplayable card to
a Scheme Slot. It estimates readiness from missing tags, available tag providers,
resource production, storage, and City slots. The current horizon is three Eras;
cards estimated later than that are not Schemed. A full Scheme is changed only
when the incoming card is materially better than its weakest occupant.

## Ministries

Card value includes whether the bot is expected to control a Ministry that makes
choices for that card. The policy forecasts the deterministic Ministry rotation
for the estimated Era in which a Schemed card becomes ready. Explicit Event
Ministries and normal fallback roles for resource, token, destruction, placement,
and draw choices are included.

The Minister of the Empire orders the Council Docket by Crisis priority, build
dependencies, and Agenda-adjusted card value.

## Current Limits

- Bots never place Suspicion.
- Bots do not model another player's hidden Agenda or future behavior.
- Readiness is an estimate, not a multi-Era game-tree simulation.
- Docket ordering uses card value and immediate dependencies rather than
  simulating every complete resolution permutation.
- Tie-breaking is deterministic so tests and repeated states are reproducible.

These limits are intentional. Suspicion and opponent modeling can be added later
without changing the authoritative game engine.
