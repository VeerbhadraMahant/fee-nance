# Insights aggregation pipelines

The `/insights` page is served by a single handler, `src/app/api/private/insights/route.ts`, which issues eight aggregations in parallel and folds the results in application code. Three of them use `$setWindowFields`, which is the most interesting MongoDB feature in this repository and the reason this document exists.

Everything here is **read-only**. No collection is created, nothing is written, and no flag is stored — the detectors recompute on every request. That is a deliberate trade: a stored flag would go stale the moment its transaction is edited or deleted, and reconciling that is a whole subsystem the feature does not need.

## Server requirement

| Operator | Introduced |
|---|---|
| `$setWindowFields` | 5.0 |
| `$shift` (window operator) | 5.0 |
| `$stdDevSamp` as a window accumulator | 5.0 |
| `$count` as a window accumulator | 5.0 |
| `$dateDiff` | 5.0 |

**The whole page needs MongoDB 5.0 or newer.** Confirm with:

```js
db.version()
```

`$percentile` and `$median` (7.0+) are deliberately **not** used. A median-and-MAD outlier score is more robust against skew than mean-and-standard-deviation, and it was the first choice — but it would have raised the floor to 7.0. The mean-based score plus the three guards described below gets close enough without the version cost.

## 1. Outlier detection

**Question:** which expenses are unusual *for their own category*?

Comparing every expense against a single global average is useless — rent will always look extreme next to coffee. So the pipeline partitions by category and judges each transaction against the run of transactions before it in that same category.

```js
{ $match: { userId, type: "expense", transactionDate: { $gte, $lte } } },
{ $setWindowFields: {
    partitionBy: "$categoryId",
    sortBy: { transactionDate: 1 },
    output: {
      baseline:  { $avg: "$amount",        window: { documents: [-11, -1] } },
      spread:    { $stdDevSamp: "$amount", window: { documents: [-11, -1] } },
      priorSeen: { $count: {},             window: { documents: [-11, -1] } },
    },
} },
{ $match: { priorSeen: { $gte: 5 } } },
{ $set:   { zScore: <guarded (amount − baseline) / spread> } },
{ $match: { zScore: { $gte: 2.5 }, amount: { $gte: 500 } } },
{ $sort:  { zScore: -1 } },
{ $limit: 20 }
```

**Index used:** `{userId: 1, categoryId: 1, transactionDate: -1}` — already present on `transactions`. It serves the `$match` and supplies the partition key and sort order.

Three guards, each earning its place:

- **`window: { documents: [-11, -1] }`** — strictly the eleven *prior* documents. Including the current one would let a spike inflate the very baseline it is measured against, dragging its own z-score down. The upper bound of `-1` is the whole point.
- **`priorSeen >= 5`** — a category with two entries has no meaningful distribution. Without this, the second transaction in every new category fires.
- **`amount >= 500`** — a ₹40 chai against a ₹12 baseline is statistically extreme and practically noise. Statistical significance is not the same as being worth a user's attention.

The division is wrapped in a `$cond` on `spread > 0`, which also catches the `null` that `$stdDevSamp` returns for a degenerate window.

## 2. Duplicate charge detection

**Question:** was the same thing recorded twice by accident?

```js
{ $match: { userId, type: "expense", transactionDate: { $gte, $lte } } },
{ $set: { dupKey: { amount: "$amount",
                    title: { $toLower: { $trim: { input: "$title" } } } } } },
{ $setWindowFields: {
    partitionBy: "$dupKey",
    sortBy: { transactionDate: 1 },
    output: {
      prevDate: { $shift: { output: "$transactionDate", by: -1, default: null } },
      prevId:   { $shift: { output: "$_id",             by: -1, default: null } },
    },
} },
{ $match: { prevDate: { $ne: null } } },
{ $set:   { gapHours: { $dateDiff: { startDate: "$prevDate",
                                     endDate: "$transactionDate",
                                     unit: "hour" } } } },
{ $match: { gapHours: { $lte: 48 } } }
```

`$shift` is what makes this cheap. The relational equivalent is a self-join of the table against itself on `(amount, title)` with a correlated subquery picking the nearest earlier row — three passes and a sort. Here it is one pass over a partition that is already sorted.

Partitioning on a composite key (`{amount, title}`) rather than a single field is worth pointing at in a viva: `partitionBy` takes any expression, not just a field path.

## 3. Category drift

**Question:** what changed this month?

Two stages, because the window is over *aggregates*, not documents:

```js
{ $group: { _id: { categoryId, year, month }, total: { $sum: "$amount" } } },
{ $setWindowFields: {
    partitionBy: "$_id.categoryId",
    sortBy: { "_id.year": 1, "_id.month": 1 },
    output: { trailingAvg: { $avg: "$total", window: { documents: [-3, -1] } } },
} },
{ $match: { trailingAvg: { $gt: 0 } } },
{ $set:   { deltaPct: <(total − trailingAvg) / trailingAvg × 100> } }
```

A `$group` produces one row per category-month; the window then runs *over those rows*. Pipelines that mix grouping and windowing like this are where the aggregation framework pulls decisively ahead of a single SQL statement without CTEs.

The latest month per category is picked in application code, then filtered to movements of 15% or more and capped at eight rows — presentation concerns that do not belong in the pipeline.

## 4–8. Supporting aggregations

| # | Purpose | Shape |
|---|---|---|
| 4 | Balance as of the range end — the projection's starting point | `$group` by `type` |
| 5 | Monthly net across the range — supplies σ for the confidence band | `$group` by year/month |
| 6 | Daily net over the trailing 90 days — the actual half of the chart | `$group` by `$dateToString` |
| 7 | Trailing expense total — the raw discretionary rate | `$group` with `$sum` |
| 8 | The recurring rules themselves | `find()`, not an aggregation |

## The forecast

`src/lib/forecast.ts` is pure — no Mongoose, no I/O, no clock of its own — so it is the one piece of money logic in the codebase that can be tested today. `npm run verify:calc` exercises it.

Two components:

- **Committed flows.** Occurrences of each recurring rule, stepped forward by `getNextDate` in `src/lib/recurrence.ts` — the same function `POST /api/private/transactions/recurring/run` uses to advance `nextRunAt`. Sharing it is what stops a projected date drifting from the date the runner will really create. This also gives `recurring.nextRunAt` its first reader outside the runner; the Phase 0 audit had it listed as effectively dead.
- **Discretionary spend.** Trailing 90-day expense, minus the flagged outliers, expressed as a daily rate.

### A known imprecision, stated plainly

Recurring expenses are counted twice: once as the rule the forecast projects forward, and again inside the trailing spend total, as the occurrences the runner already generated. Generated occurrences carry no reference back to the rule that produced them — that link is backlog item F8 — so they cannot be filtered out by id.

The route compensates by subtracting each rule's *rate* (`amount ÷ average period days`) from the discretionary rate. Over a long window this nets out exactly; over a short one it is an approximation. It is the right answer available without a schema change, and it should be replaced with an id-based exclusion once F8 lands.

### The confidence band

±1σ of monthly net, widened by `√(days / 30)`. The variance of a random walk grows linearly with time, so its standard deviation grows with the square root. A flat band would claim the same confidence at day 90 as at day 1, which is not true and would read as false precision.

## Reproducing the explain output

```js
db.transactions.aggregate([ /* pipeline 1 */ ], { explain: true })
```

or, for execution statistics rather than just the plan:

```js
db.runCommand({
  explain: { aggregate: "transactions", pipeline: [ /* … */ ], cursor: {} },
  verbosity: "executionStats"
})
```

Look for `IXSCAN` on `userId_1_categoryId_1_transactionDate_-1` in the first stage. A `COLLSCAN` there means the compound index was not selected and the `$match` should be checked against the index prefix order.

> Captured `executionStats` output has not been committed yet — it needs a reachable cluster with the seeded dataset, and the connection string in `.env` does not currently resolve.
