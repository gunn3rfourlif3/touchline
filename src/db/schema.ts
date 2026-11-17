import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  date,
  numeric,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

/**
 * Stage 1 (predictions) and the parts of Stage 2 (auctions) that cannot be
 * backfilled later. See docs/DATA-MODEL.md for why the snapshot tables exist
 * from the first run even though nothing reads them yet.
 */

export const fixtureStatus = pgEnum('fixture_status', [
  'scheduled',
  'live',
  'finished',
  'postponed',
  'cancelled',
]);

export const roundState = pgEnum('round_state', [
  'open',
  'locked',
  'scored',
]);

export const pickSide = pgEnum('pick_side', ['home', 'away', 'draw']);

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // E.164, the only identity in the system. No wallet, no address.
    phone: text('phone').notNull(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // POPIA: deletion on request. Soft-delete so predictions history and
    // standings stay consistent; the row is scrubbed, not removed.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_phone_idx').on(t.phone)],
);

/**
 * Short-lived OTP challenges. Rows are deleted on success and swept on expiry;
 * the code is stored hashed so a database read does not hand over live codes.
 */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('otp_phone_idx').on(t.phone, t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Competition data (from the licensed feed, never scraped)
// ---------------------------------------------------------------------------

export const competitions = pgTable(
  'competitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Stable key from whichever provider is active, so a provider swap
    // mid-season is a remap rather than a reimport.
    providerKey: text('provider_key').notNull(),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    season: text('season').notNull(),
  },
  (t) => [
    uniqueIndex('competitions_provider_idx').on(
      t.provider,
      t.providerKey,
      t.season,
    ),
  ],
);

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id),
    number: integer('number').notNull(),
    name: text('name').notNull(),
    // Set to the earliest kickoff in the round. Picks close here, for everyone,
    // regardless of individual fixture times.
    locksAt: timestamp('locks_at', { withTimezone: true }).notNull(),
    state: roundState('state').notNull().default('open'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('rounds_competition_number_idx').on(t.competitionId, t.number),
    index('rounds_locks_at_idx').on(t.locksAt),
  ],
);

export const fixtures = pgTable(
  'fixtures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id),
    providerKey: text('provider_key').notNull(),
    provider: text('provider').notNull(),
    homeTeam: text('home_team').notNull(),
    awayTeam: text('away_team').notNull(),
    venue: text('venue'),
    kickoff: timestamp('kickoff', { withTimezone: true }).notNull(),
    status: fixtureStatus('status').notNull().default('scheduled'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    // Hash of the provider payload. Unchanged hash means skip the write —
    // a feed billed per call gets expensive through carelessness, not scale.
    payloadHash: text('payload_hash'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('fixtures_provider_idx').on(t.provider, t.providerKey),
    index('fixtures_round_idx').on(t.roundId, t.kickoff),
  ],
);

// ---------------------------------------------------------------------------
// The weekly habit
// ---------------------------------------------------------------------------

export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    fixtureId: uuid('fixture_id')
      .notNull()
      .references(() => fixtures.id),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id),
    pick: pickSide('pick').notNull(),
    // Stamped when the round locks. A null here on a locked round means the
    // pick was never made, which scores zero rather than erroring.
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    pointsAwarded: integer('points_awarded'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('predictions_user_fixture_idx').on(t.userId, t.fixtureId),
    index('predictions_round_idx').on(t.roundId, t.userId),
  ],
);

export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  competitionId: uuid('competition_id')
    .notNull()
    .references(() => competitions.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  // The join code that gets pasted into a WhatsApp group.
  inviteCode: text('invite_code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leagueMembers = pgTable(
  'league_members',
  {
    leagueId: uuid('league_id')
      .notNull()
      .references(() => leagues.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('league_members_idx').on(t.leagueId, t.userId)],
);

/**
 * Derived from predictions, but materialised: the league table is read on
 * every visit and rendered into the share image, and recomputing it from
 * every prediction each time is the obvious thing that gets slow first.
 */
export const standings = pgTable(
  'standings',
  {
    leagueId: uuid('league_id')
      .notNull()
      .references(() => leagues.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    points: integer('points').notNull().default(0),
    correctPicks: integer('correct_picks').notNull().default(0),
    playedRounds: integer('played_rounds').notNull().default(0),
    currentStreak: integer('current_streak').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('standings_idx').on(t.leagueId, t.userId)],
);

// ---------------------------------------------------------------------------
// Stage 2 groundwork — written from day one because it cannot be backfilled
// ---------------------------------------------------------------------------

/**
 * Append-only. Every state change of every bid, kept forever. Line movement
 * and sale-price history are both valuable and both lost for good if they are
 * not written from the first run.
 */
export const bidSnapshots = pgTable(
  'bid_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lotId: uuid('lot_id').notNull(),
    bidderId: uuid('bidder_id'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    isProxy: boolean('is_proxy').notNull().default(false),
    outcome: text('outcome').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('bid_snapshots_lot_idx').on(t.lotId, t.observedAt)],
);

/**
 * One row per sold lot. Feeds "what did a 1995 jersey go for last year",
 * which is the question that makes a provenance marketplace worth returning to.
 */
export const priceHistory = pgTable(
  'price_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lotId: uuid('lot_id').notNull(),
    category: text('category').notNull(),
    hammerPrice: numeric('hammer_price', { precision: 12, scale: 2 }).notNull(),
    bidCount: integer('bid_count').notNull(),
    soldOn: date('sold_on').notNull(),
  },
  (t) => [index('price_history_category_idx').on(t.category, t.soldOn)],
);

/**
 * Every provider call, so cost and silent-failure questions are answerable.
 * Cheap to write, impossible to reconstruct.
 */
export const feedFetches = pgTable(
  'feed_fetches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    endpoint: text('endpoint').notNull(),
    statusCode: integer('status_code'),
    payloadHash: text('payload_hash'),
    skipped: boolean('skipped').notNull().default(false),
    validationError: text('validation_error'),
    durationMs: integer('duration_ms'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('feed_fetches_idx').on(t.provider, t.fetchedAt)],
);
